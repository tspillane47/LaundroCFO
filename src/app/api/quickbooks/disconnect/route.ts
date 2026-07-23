import { NextResponse } from "next/server";
import {
  deleteQuickBooksConnection,
  resetStoreFinancialDataSourceOnQuickBooksDisconnect,
  revokeQuickBooksToken,
  verifyUserOwnsStore,
} from "@/lib/quickbooks";
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
    const connection = await deleteQuickBooksConnection(storeId);

    if (connection?.refresh_token) {
      try {
        await revokeQuickBooksToken(connection.refresh_token);
      } catch (revokeError) {
        console.error("[quickbooks/disconnect] token revoke failed", revokeError);
      }
    }

    await resetStoreFinancialDataSourceOnQuickBooksDisconnect(storeId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[quickbooks/disconnect] failed", error);
    return NextResponse.json({ error: "Failed to disconnect QuickBooks" }, { status: 500 });
  }
}
