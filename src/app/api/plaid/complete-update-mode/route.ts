import { NextResponse } from "next/server";
import {
  clearPlaidConnectionItemErrorByStoreId,
  PlaidNotConnectedError,
  syncPlaidTransactions,
  verifyUserOwnsStore,
} from "@/lib/plaid";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { storeId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  if (!storeId) {
    return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
  }

  const ownsStore = await verifyUserOwnsStore(supabase, user.id, storeId);
  if (!ownsStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  try {
    await clearPlaidConnectionItemErrorByStoreId(storeId);

    let syncResult = null;
    try {
      syncResult = await syncPlaidTransactions(storeId);
    } catch (syncError) {
      console.warn("[plaid/complete-update-mode] post-repair sync failed", syncError);
    }

    return NextResponse.json({ ok: true, sync: syncResult });
  } catch (error) {
    if (error instanceof PlaidNotConnectedError) {
      return NextResponse.json({ error: "No bank connection found for this store" }, { status: 404 });
    }

    console.error("[plaid/complete-update-mode] failed", error);
    return NextResponse.json({ error: "Failed to complete bank reconnection" }, { status: 500 });
  }
}
