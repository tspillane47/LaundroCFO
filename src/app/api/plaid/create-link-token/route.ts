import { NextResponse } from "next/server";
import {
  reconcileStoreFinancialDataSourceWithQuickBooksConnection,
  storeHasQuickBooksConnection,
} from "@/lib/quickbooks";
import {
  createPlaidLinkToken,
  createPlaidUpdateModeLinkToken,
  getPlaidConnectionForStore,
  logPlaidApiError,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
  verifyUserOwnsStore,
} from "@/lib/plaid";
import { isPlaidUpdateModeEligible } from "@/lib/plaid-shared";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { storeId?: unknown; updateMode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  const updateMode = body.updateMode === true;
  if (!storeId) {
    return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
  }

  const ownsStore = await verifyUserOwnsStore(supabase, user.id, storeId);
  if (!ownsStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  try {
    await reconcileStoreFinancialDataSourceWithQuickBooksConnection(storeId);
    if (await storeHasQuickBooksConnection(storeId)) {
      return NextResponse.json({ error: PLAID_QUICKBOOKS_BLOCK_MESSAGE }, { status: 409 });
    }

    if (updateMode) {
      const connection = await getPlaidConnectionForStore(storeId);
      if (!connection) {
        return NextResponse.json({ error: "No bank connection found for this store" }, { status: 404 });
      }

      if (
        connection.item_error_code &&
        !isPlaidUpdateModeEligible(connection.item_error_code)
      ) {
        return NextResponse.json(
          {
            error:
              "This connection cannot be repaired in place. Disconnect and connect a different bank account.",
          },
          { status: 409 }
        );
      }

      const linkToken = await createPlaidUpdateModeLinkToken(
        user.id,
        connection.plaid_access_token
      );
      return NextResponse.json({ link_token: linkToken, update_mode: true });
    }

    const linkToken = await createPlaidLinkToken(user.id);
    return NextResponse.json({ link_token: linkToken, update_mode: false });
  } catch (error) {
    logPlaidApiError("[plaid/create-link-token] route failed", error, {
      storeId,
      userId: user.id,
    });
    return NextResponse.json({ error: "Failed to create Plaid link token" }, { status: 500 });
  }
}
