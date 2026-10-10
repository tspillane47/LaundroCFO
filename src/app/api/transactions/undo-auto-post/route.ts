import { NextResponse } from "next/server";
import { undoAutoPost } from "@/lib/autoPost";
import { verifyUserCanAccessStore } from "@/lib/store-access";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { transactionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const transactionId = typeof body.transactionId === "string" ? body.transactionId : null;
  if (!transactionId) {
    return NextResponse.json({ error: "Missing transactionId" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: transaction, error: fetchError } = await admin
    .from("bank_transactions")
    .select("store_id")
    .eq("id", transactionId)
    .maybeSingle();

  if (fetchError) {
    console.error("[transactions/undo-auto-post] failed to load transaction", fetchError);
    return NextResponse.json({ error: "Failed to undo automatic post" }, { status: 500 });
  }

  if (!transaction?.store_id) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const canAccessStore = await verifyUserCanAccessStore(supabase, transaction.store_id);
  if (!canAccessStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  const result = await undoAutoPost(transactionId, user.id);
  if (!result.undone) {
    const status = result.error === "Transaction not found." ? 404 : 400;
    return NextResponse.json({ error: result.error ?? "Failed to undo automatic post" }, { status });
  }

  return NextResponse.json({ undone: true, storeId: result.storeId });
}
