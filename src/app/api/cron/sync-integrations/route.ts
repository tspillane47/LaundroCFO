import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  logPlaidApiError,
  PlaidNotConnectedError,
  syncPlaidTransactions,
} from "@/lib/plaid";
import {
  QuickBooksNotConnectedError,
  QuickBooksReconnectRequiredError,
  syncQuickBooksFinancials,
} from "@/lib/quickbooks";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type IntegrationKind = "quickbooks" | "plaid";

type ConnectionSyncResult = {
  storeId: string;
  integration: IntegrationKind;
  ok: boolean;
  error?: string;
  reconnectRequired?: boolean;
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
  const results: ConnectionSyncResult[] = [];
  const admin = createAdminSupabaseClient();

  const [{ data: quickbooksConnections, error: quickbooksError }, { data: plaidConnections, error: plaidError }] =
    await Promise.all([
      admin.from("quickbooks_connections").select("store_id"),
      admin.from("plaid_connections").select("store_id"),
    ]);

  if (quickbooksError) {
    console.error("[cron/sync-integrations] failed to load quickbooks_connections", quickbooksError);
    return NextResponse.json({ error: "Failed to load QuickBooks connections" }, { status: 500 });
  }

  if (plaidError) {
    console.error("[cron/sync-integrations] failed to load plaid_connections", plaidError);
    return NextResponse.json({ error: "Failed to load Plaid connections" }, { status: 500 });
  }

  for (const connection of quickbooksConnections ?? []) {
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

  for (const connection of plaidConnections ?? []) {
    const storeId = connection.store_id;
    try {
      await syncPlaidTransactions(storeId);
      results.push({ storeId, integration: "plaid", ok: true });
    } catch (error) {
      if (error instanceof PlaidNotConnectedError) {
        results.push({ storeId, integration: "plaid", ok: false, error: error.message });
        continue;
      }

      logPlaidApiError("[cron/sync-integrations] Plaid sync failed", error, { storeId });
      const message = error instanceof Error ? error.message : "Unknown Plaid sync error";
      results.push({ storeId, integration: "plaid", ok: false, error: message });
    }
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    quickbooks: summarizeResults(results, "quickbooks"),
    plaid: summarizeResults(results, "plaid"),
    failures: results.filter((entry) => !entry.ok),
  };

  console.log("[cron/sync-integrations] completed", JSON.stringify(summary, null, 2));

  return NextResponse.json({ ok: true, summary });
}
