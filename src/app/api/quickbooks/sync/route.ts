import { NextResponse } from "next/server";
import {
  QuickBooksNotConnectedError,
  QuickBooksReconnectRequiredError,
  syncQuickBooksFinancials,
  verifyUserOwnsStore,
} from "@/lib/quickbooks";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
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
    const result = await syncQuickBooksFinancials(storeId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof QuickBooksNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof QuickBooksReconnectRequiredError) {
      return NextResponse.json({ error: error.message, reconnectRequired: true }, { status: 401 });
    }

    console.error("[quickbooks/sync] failed", error);
    return NextResponse.json({ error: "Failed to sync QuickBooks data" }, { status: 500 });
  }
}
