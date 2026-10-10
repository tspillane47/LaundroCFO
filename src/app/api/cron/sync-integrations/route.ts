import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  logPlaidApiError,
  PlaidNotConnectedError,
  runPostedPlaidDuplicateReconcileSafe,
  syncPlaidTransactions,
} from "@/lib/plaid";
import { groupPlaidConnectionsByStore } from "@/lib/plaidDuplicateCleanup";
import {
  QuickBooksNotConnectedError,
  QuickBooksReconnectRequiredError,
  syncQuickBooksFinancials,
} from "@/lib/quickbooks";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Leave the last 30s of the 300s function budget so the current store can finish. */
const CRON_BUDGET_MS = 270_000;

type IntegrationKind = "quickbooks" | "plaid";

type ConnectionSyncResult = {
  storeId: string;
  integration: IntegrationKind;
  connectionId?: string;
  ok: boolean;
  error?: string;
  reconnectRequired?: boolean;
};

type DuplicateReconcileCronResult = {
  storeId: string;
  ok: boolean;
  applied: number;
  error?: string;
};

type SkippedStore = {
  storeId: string;
  integration: IntegrationKind;
};

function summarizeResults(results: ConnectionSyncResult[], integration: IntegrationKind) {
  const scoped = results.filter((entry) => entry.integration === integration);
  return {
    total: scoped.length,
    succeeded: scoped.filter((entry) => entry.ok).length,
    failed: scoped.filter((entry) => !entry.ok).length,
  };
}

export async function GET(request: Request) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const results: ConnectionSyncResult[] = [];
  const duplicateReconcile: DuplicateReconcileCronResult[] = [];
  const skippedStores: SkippedStore[] = [];
  const admin = createAdminSupabaseClient();

  const pastBudget = () => Date.now() - startedMs >= CRON_BUDGET_MS;

  const [{ data: quickbooksConnections, error: quickbooksError }, { data: plaidConnections, error: plaidError }] =
    await Promise.all([
      admin.from("quickbooks_connections").select("store_id"),
      admin.from("plaid_connections").select("id, store_id"),
    ]);

  if (quickbooksError) {
    console.error("[cron/sync-integrations] failed to load quickbooks_connections", quickbooksError);
    return NextResponse.json({ error: "Failed to load QuickBooks connections" }, { status: 500 });
  }

  if (plaidError) {
    console.error("[cron/sync-integrations] failed to load plaid_connections", plaidError);
    return NextResponse.json({ error: "Failed to load Plaid connections" }, { status: 500 });
  }

  const quickbooksList = quickbooksConnections ?? [];
  for (let index = 0; index < quickbooksList.length; index += 1) {
    if (pastBudget()) {
      const remaining = quickbooksList.slice(index).map((connection) => connection.store_id);
      console.warn("[cron/sync-integrations] stopping near time limit; skipped QuickBooks stores", {
        skippedStores: remaining,
      });
      skippedStores.push(...remaining.map((storeId) => ({ storeId, integration: "quickbooks" as const })));
      break;
    }

    const connection = quickbooksList[index];
    const storeId = connection.store_id;
    try {
      await syncQuickBooksFinancials(storeId);
      results.push({ storeId, integration: "quickbooks", ok: true });
    } catch (error) {
      if (error instanceof QuickBooksNotConnectedError) {
        results.push({ storeId, integration: "quickbooks", ok: false, error: error.message });
        continue;
      }

      if (error instanceof QuickBooksReconnectRequiredError) {
        results.push({
          storeId,
          integration: "quickbooks",
          ok: false,
          error: error.message,
          reconnectRequired: true,
        });
        continue;
      }

      const message = error instanceof Error ? error.message : "Unknown QuickBooks sync error";
      console.error("[cron/sync-integrations] QuickBooks sync failed", { storeId, error });
      results.push({ storeId, integration: "quickbooks", ok: false, error: message });
    }
  }

  const plaidGroups = groupPlaidConnectionsByStore(plaidConnections ?? []);
  for (let index = 0; index < plaidGroups.length; index += 1) {
    if (pastBudget()) {
      const remaining = plaidGroups.slice(index).map((group) => group.storeId);
      console.warn("[cron/sync-integrations] stopping near time limit; skipped Plaid stores", {
        skippedStores: remaining,
      });
      skippedStores.push(...remaining.map((storeId) => ({ storeId, integration: "plaid" as const })));
      break;
    }

    const { storeId, connectionIds } = plaidGroups[index];
    let anyPlaidSyncOk = false;

    for (const connectionId of connectionIds) {
      try {
        await syncPlaidTransactions(connectionId);
        anyPlaidSyncOk = true;
        results.push({ storeId, connectionId, integration: "plaid", ok: true });
      } catch (error) {
        if (error instanceof PlaidNotConnectedError) {
          results.push({
            storeId,
            connectionId,
            integration: "plaid",
            ok: false,
            error: error.message,
          });
          continue;
        }

        logPlaidApiError("[cron/sync-integrations] Plaid sync failed", error, { storeId, connectionId });
        const message = error instanceof Error ? error.message : "Unknown Plaid sync error";
        results.push({ storeId, connectionId, integration: "plaid", ok: false, error: message });
      }
    }

    if (!anyPlaidSyncOk) continue;

    const reconcileResult = await runPostedPlaidDuplicateReconcileSafe(storeId);
    if (reconcileResult.ok) {
      duplicateReconcile.push({
        storeId,
        ok: true,
        applied: reconcileResult.result.applied.length,
      });
    } else {
      console.error("[cron/sync-integrations] duplicate reconcile failed", {
        storeId,
        error: reconcileResult.error,
      });
      duplicateReconcile.push({
        storeId,
        ok: false,
        applied: 0,
        error: reconcileResult.error,
      });
    }
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    quickbooks: summarizeResults(results, "quickbooks"),
    plaid: summarizeResults(results, "plaid"),
    skippedStores,
    duplicateReconcile: {
      storesAttempted: duplicateReconcile.length,
      storesSucceeded: duplicateReconcile.filter((entry) => entry.ok).length,
      correctionsApplied: duplicateReconcile.reduce((sum, entry) => sum + entry.applied, 0),
      failures: duplicateReconcile.filter((entry) => !entry.ok),
    },
    failures: results.filter((entry) => !entry.ok),
  };

  console.log("[cron/sync-integrations] completed", JSON.stringify(summary, null, 2));

  return NextResponse.json({ ok: true, summary });
}
