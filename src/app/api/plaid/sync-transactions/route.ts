import { NextResponse } from "next/server";
import { EMPTY_PLAID_BALANCE_SYNC_RESULT, type PlaidSyncResult } from "@/lib/plaid-shared";
import {
  getPlaidConnectionById,
  getPlaidConnectionsForStore,
  logPlaidApiError,
  PlaidNotConnectedError,
  syncPlaidTransactions,
} from "@/lib/plaid";
import { verifyUserCanAccessStore } from "@/lib/store-access";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PlaidConnectionSyncResult = PlaidSyncResult & {
  connectionId: string;
  ok: boolean;
  error?: string;
};

function aggregateSyncResults(results: PlaidConnectionSyncResult[]): PlaidSyncResult {
  return results.reduce(
    (totals, result) => ({
      added: totals.added + result.added,
      modified: totals.modified + result.modified,
      removed: totals.removed + result.removed,
      skippedRemovedPosted: totals.skippedRemovedPosted + result.skippedRemovedPosted,
      balances: {
        accountsSynced: totals.balances.accountsSynced + result.balances.accountsSynced,
        accountsRemoved: totals.balances.accountsRemoved + result.balances.accountsRemoved,
        ok: totals.balances.ok && result.balances.ok,
        error: [totals.balances.error, result.balances.error].filter(Boolean).join("; ") || undefined,
      },
    }),
    {
      added: 0,
      modified: 0,
      removed: 0,
      skippedRemovedPosted: 0,
      balances: { ...EMPTY_PLAID_BALANCE_SYNC_RESULT },
    }
  );
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { storeId?: unknown; connectionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  const connectionId = typeof body.connectionId === "string" ? body.connectionId : null;

  if (!storeId) {
    return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
  }

  const canAccessStore = await verifyUserCanAccessStore(supabase, storeId);
  if (!canAccessStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  try {
    if (connectionId) {
      const connection = await getPlaidConnectionById(connectionId);
      if (!connection || connection.store_id !== storeId) {
        return NextResponse.json({ error: "Bank connection not found for this store" }, { status: 404 });
      }

      const result = await syncPlaidTransactions(connectionId);
      return NextResponse.json({ connectionId, ...result });
    }

    const connections = await getPlaidConnectionsForStore(storeId);
    if (connections.length === 0) {
      return NextResponse.json({ error: "No bank connections found for this store" }, { status: 404 });
    }

    const connectionResults: PlaidConnectionSyncResult[] = [];

    for (const connection of connections) {
      try {
        const result = await syncPlaidTransactions(connection.id);
        connectionResults.push({ connectionId: connection.id, ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Plaid sync error";
        logPlaidApiError("[plaid/sync-transactions] connection sync failed", error, {
          storeId,
          connectionId: connection.id,
          userId: user.id,
        });
        connectionResults.push({
          connectionId: connection.id,
          ok: false,
          error: message,
          added: 0,
          modified: 0,
          removed: 0,
          skippedRemovedPosted: 0,
          balances: { ...EMPTY_PLAID_BALANCE_SYNC_RESULT, ok: false, error: message },
        });
      }
    }

    const synced = connectionResults.filter((result) => result.ok).length;
    const totals = aggregateSyncResults(connectionResults);

    return NextResponse.json({
      synced,
      total: connections.length,
      connections: connectionResults,
      ...totals,
    });
  } catch (error) {
    if (error instanceof PlaidNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    logPlaidApiError("[plaid/sync-transactions] route failed", error, { storeId, connectionId, userId: user.id });
    return NextResponse.json({ error: "Failed to sync Plaid transactions" }, { status: 500 });
  }
}
