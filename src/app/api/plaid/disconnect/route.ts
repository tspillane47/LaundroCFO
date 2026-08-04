import { NextResponse } from "next/server";
import {
  deletePlaidConnection,
  getPlaidConnectionById,
} from "@/lib/plaid";
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
  if (!connectionId) {
    return NextResponse.json({ error: "Missing connectionId" }, { status: 400 });
  }

  const canAccessStore = await verifyUserCanAccessStore(supabase, storeId);
  if (!canAccessStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  try {
    const existing = await getPlaidConnectionById(connectionId);
    if (!existing || existing.store_id !== storeId) {
      return NextResponse.json({ error: "Bank connection not found for this store" }, { status: 404 });
    }

    const connection = await deletePlaidConnection(connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Bank connection not found for this store" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, connectionId });
  } catch (error) {
    console.error("[plaid/disconnect] failed", error);
    return NextResponse.json({ error: "Failed to disconnect bank account" }, { status: 500 });
  }
}
