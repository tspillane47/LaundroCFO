import { NextResponse } from "next/server";
import { autoPostRevenueForStore } from "@/lib/autoPost";
import {
  getPlaidConnectionsForStore,
  logPlaidApiError,
  PlaidNotConnectedError,
  syncPlaidTransactions,
} from "@/lib/plaid";
import { shouldThrottleStoreBankRefresh } from "@/lib/plaidRefreshThrottle";
import { verifyUserCanAccessStore } from "@/lib/store-access";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

  const canAccessStore = await verifyUserCanAccessStore(supabase, storeId);
  if (!canAccessStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { data: refreshRow, error: refreshError } = await admin
    .from("store_bank_refresh")
    .select("last_refreshed_at")
    .eq("store_id", storeId)
    .maybeSingle();

  if (refreshError) {
    console.error("[plaid/refresh-store] failed to read refresh timestamp", refreshError);
    return NextResponse.json({ error: "Failed to refresh bank data" }, { status: 500 });
  }

  if (shouldThrottleStoreBankRefresh(refreshRow?.last_refreshed_at)) {
    return NextResponse.json({
      throttled: true,
      postedCount: 0,
      postedAmount: 0,
      transactionIds: [],
      synced: 0,
    });
  }

  const { error: stampError } = await admin.from("store_bank_refresh").upsert(
    { store_id: storeId, last_refreshed_at: new Date().toISOString() },
    { onConflict: "store_id" }
  );

  if (stampError) {
    console.error("[plaid/refresh-store] failed to store refresh timestamp", stampError);
    return NextResponse.json({ error: "Failed to refresh bank data" }, { status: 500 });
  }

  let synced = 0;
  const syncErrors: string[] = [];

  try {
    const connections = await getPlaidConnectionsForStore(storeId);
    for (const connection of connections) {
      try {
        await syncPlaidTransactions(connection.id);
        synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Plaid sync error";
        if (!(error instanceof PlaidNotConnectedError)) {
          logPlaidApiError("[plaid/refresh-store] connection sync failed", error, {
            storeId,
            connectionId: connection.id,
            userId: user.id,
          });
        }
        syncErrors.push(message);
      }
    }
  } catch (error) {
    logPlaidApiError("[plaid/refresh-store] failed to load connections", error, {
      storeId,
      userId: user.id,
    });
    const message = error instanceof Error ? error.message : "Failed to load bank connections";
    syncErrors.push(message);
  }

  const posted = await autoPostRevenueForStore(storeId, { actingUserId: user.id });
  if (posted.error) {
    await admin.from("store_bank_refresh").delete().eq("store_id", storeId);
    return NextResponse.json(
      { error: posted.error, synced, syncErrors, throttled: false },
      { status: 500 }
    );
  }

  return NextResponse.json({
    throttled: false,
    postedCount: posted.postedCount,
    postedAmount: posted.postedAmount,
    transactionIds: posted.transactionIds,
    synced,
    syncErrors,
  });
}
