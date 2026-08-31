import { NextResponse } from "next/server";
import {
  clearPlaidConnectionItemErrorById,
  getPlaidConnectionById,
  persistPlaidLinkSelectedAccounts,
  PlaidNotConnectedError,
  syncPlaidTransactions,
} from "@/lib/plaid";
import { parseOptionalPlaidLinkSelectedAccounts } from "@/lib/plaid-shared";
import { verifyUserCanAccessStore } from "@/lib/store-access";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { storeId?: unknown; connectionId?: unknown; accounts?: unknown };
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
  if (!connectionId) {
    return NextResponse.json({ error: "Missing connectionId" }, { status: 400 });
  }

  const canAccessStore = await verifyUserCanAccessStore(supabase, storeId);
  if (!canAccessStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  try {
    const connection = await getPlaidConnectionById(connectionId);
    if (!connection || connection.store_id !== storeId) {
      return NextResponse.json({ error: "Bank connection not found for this store" }, { status: 404 });
    }

    await clearPlaidConnectionItemErrorById(connectionId);

    const selectedAccounts = parseOptionalPlaidLinkSelectedAccounts(body.accounts);
    if (selectedAccounts) {
      await persistPlaidLinkSelectedAccounts({
        connectionId,
        storeId,
        accounts: selectedAccounts,
      });
    }

    let syncResult = null;
    try {
      syncResult = await syncPlaidTransactions(connectionId);
    } catch (syncError) {
      console.warn("[plaid/complete-update-mode] post-repair sync failed", syncError);
    }

    return NextResponse.json({ ok: true, connectionId, sync: syncResult });
  } catch (error) {
    if (error instanceof PlaidNotConnectedError) {
      return NextResponse.json({ error: "No bank connection found for this store" }, { status: 404 });
    }

    console.error("[plaid/complete-update-mode] failed", error);
    return NextResponse.json({ error: "Failed to complete bank reconnection" }, { status: 500 });
  }
}
