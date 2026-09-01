import { NextResponse } from "next/server";
import {
  PlaidAccountNotFoundError,
  togglePlaidAccountInclusion,
} from "@/lib/plaidAccountInclusion";
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

  let body: { storeId?: unknown; accountId?: unknown; included?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  const accountId = typeof body.accountId === "string" ? body.accountId : null;
  const included = typeof body.included === "boolean" ? body.included : null;

  if (!storeId) {
    return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
  }
  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }
  if (included === null) {
    return NextResponse.json({ error: "Missing included" }, { status: 400 });
  }

  const canAccessStore = await verifyUserCanAccessStore(supabase, storeId);
  if (!canAccessStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  try {
    const result = await togglePlaidAccountInclusion({
      storeId,
      userId: user.id,
      accountId,
      included,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PlaidAccountNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("[plaid/toggle-account] failed", error);
    return NextResponse.json({ error: "Failed to update bank account" }, { status: 500 });
  }
}
