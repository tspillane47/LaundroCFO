import { NextResponse } from "next/server";
import {
  exchangePlaidPublicToken,
  getStoreFinancialDataSource,
  isQuickBooksDataSource,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
  updateStoreFinancialDataSourceOnPlaidConnect,
  upsertPlaidConnection,
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

  let body: { storeId?: unknown; public_token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  const publicToken = typeof body.public_token === "string" ? body.public_token : null;

  if (!storeId) {
    return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
  }
  if (!publicToken) {
    return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
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

    const exchangeResult = await exchangePlaidPublicToken(publicToken);

    await upsertPlaidConnection({
      storeId,
      userId: user.id,
      itemId: exchangeResult.itemId,
      accessToken: exchangeResult.accessToken,
      institutionName: exchangeResult.institutionName,
    });

    await updateStoreFinancialDataSourceOnPlaidConnect(storeId);

    return NextResponse.json({
      ok: true,
      institution_name: exchangeResult.institutionName,
    });
  } catch (error) {
    console.error("[plaid/exchange-token] failed", error);
    return NextResponse.json({ error: "Failed to connect bank account" }, { status: 500 });
  }
}
