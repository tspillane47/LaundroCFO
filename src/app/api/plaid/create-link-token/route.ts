import { NextResponse } from "next/server";
import {
  createPlaidLinkToken,
  getStoreFinancialDataSource,
  isQuickBooksDataSource,
  logPlaidApiError,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
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
    const financialDataSource = await getStoreFinancialDataSource(storeId);
    if (isQuickBooksDataSource(financialDataSource)) {
      return NextResponse.json({ error: PLAID_QUICKBOOKS_BLOCK_MESSAGE }, { status: 409 });
    }

    const linkToken = await createPlaidLinkToken(user.id);
    return NextResponse.json({ link_token: linkToken });
  } catch (error) {
    logPlaidApiError("[plaid/create-link-token] route failed", error, {
      storeId,
      userId: user.id,
    });
    return NextResponse.json({ error: "Failed to create Plaid link token" }, { status: 500 });
  }
}
