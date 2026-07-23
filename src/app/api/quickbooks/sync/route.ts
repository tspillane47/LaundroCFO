import { NextResponse } from "next/server";
import {
  QuickBooksNotConnectedError,
  QuickBooksReconnectRequiredError,
  syncQuickBooksFinancials,
  verifyUserOwnsStore,
} from "@/lib/quickbooks";
import type { QuickBooksSyncSkippedMonth } from "@/lib/quickbooks-shared";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function parseForceOverrideMonths(value: unknown): QuickBooksSyncSkippedMonth[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: QuickBooksSyncSkippedMonth[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { year?: unknown }).year !== "number" ||
      typeof (entry as { month?: unknown }).month !== "number"
    ) {
      return null;
    }

    const year = (entry as { year: number }).year;
    const month = (entry as { month: number }).month;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return null;
    }

    parsed.push({ year, month });
  }

  return parsed;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { storeId?: unknown; forceOverrideMonths?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  if (!storeId) {
    return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
  }

  const forceOverrideMonths = parseForceOverrideMonths(body.forceOverrideMonths);
  if (body.forceOverrideMonths !== undefined && forceOverrideMonths === null) {
    return NextResponse.json({ error: "Invalid forceOverrideMonths" }, { status: 400 });
  }

  const ownsStore = await verifyUserOwnsStore(supabase, user.id, storeId);
  if (!ownsStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  try {
    const result = await syncQuickBooksFinancials(storeId, {
      forceOverrideMonths: forceOverrideMonths ?? undefined,
    });
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
