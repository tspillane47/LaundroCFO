import { NextResponse } from "next/server";
import {
  deletePlaidConnection,
  removePlaidItem,
  resetStoreFinancialDataSourceOnPlaidDisconnect,
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
    const connection = await deletePlaidConnection(storeId);

    if (connection?.plaid_access_token) {
      try {
        await removePlaidItem(connection.plaid_access_token);
      } catch (removeError) {
        console.error("[plaid/disconnect] item remove failed", removeError);
      }
    }

    await resetStoreFinancialDataSourceOnPlaidDisconnect(storeId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[plaid/disconnect] failed", error);
    return NextResponse.json({ error: "Failed to disconnect bank account" }, { status: 500 });
  }
}
