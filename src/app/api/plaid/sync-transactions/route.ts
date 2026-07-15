import { NextResponse } from "next/server";
import {
  logPlaidApiError,
  PlaidNotConnectedError,
  syncPlaidTransactions,
  verifyUserOwnsStore,
} from "@/lib/plaid";
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
    const result = await syncPlaidTransactions(storeId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PlaidNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    logPlaidApiError("[plaid/sync-transactions] route failed", error, { storeId, userId: user.id });
    return NextResponse.json({ error: "Failed to sync Plaid transactions" }, { status: 500 });
  }
}
