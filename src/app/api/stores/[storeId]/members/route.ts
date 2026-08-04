import { NextResponse } from "next/server";
import { lookupAccountByEmail, lookupEmailByUserId } from "@/lib/store-members";
import { verifyUserCanAccessStore, verifyUserOwnsStore } from "@/lib/store-access";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type RouteContext = {
  params: Promise<{ storeId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { storeId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canAccessStore = await verifyUserCanAccessStore(supabase, storeId);
  if (!canAccessStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  const isOwner = await verifyUserOwnsStore(supabase, storeId, user.id);

  const { data: rows, error } = await supabase
    .from("store_members")
    .select("user_id, added_at")
    .eq("store_id", storeId)
    .order("added_at", { ascending: true });

  if (error) {
    console.error("[stores/members GET] query failed", error);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }

  const members = await Promise.all(
    (rows ?? []).map(async (row) => ({
      user_id: row.user_id as string,
      email: (await lookupEmailByUserId(row.user_id as string)) ?? "Unknown",
      added_at: row.added_at as string,
    }))
  );

  return NextResponse.json({ members, isOwner });
}

export async function POST(request: Request, context: RouteContext) {
  const { storeId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = await verifyUserOwnsStore(supabase, storeId, user.id);
  if (!isOwner) {
    return NextResponse.json({ error: "Only the store owner can add co-owners" }, { status: 403 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (email.toLowerCase() === user.email?.toLowerCase()) {
    return NextResponse.json({ error: "You cannot add yourself as a co-owner" }, { status: 400 });
  }

  const { data: store } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  let account: { userId: string } | null;
  try {
    account = await lookupAccountByEmail(email);
  } catch (err) {
    console.error("[stores/members POST] email lookup failed", err);
    return NextResponse.json({ error: "Failed to look up account" }, { status: 500 });
  }

  if (!account) {
    return NextResponse.json(
      {
        error: "not_found",
        message: "No account found with that email. They need to create a LaundroCFO account first.",
      },
      { status: 404 }
    );
  }

  if (account.userId === store.user_id) {
    return NextResponse.json({ error: "The store owner already has access" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", account.userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "This person already has access to this store" }, { status: 409 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("store_members")
    .insert({
      store_id: storeId,
      user_id: account.userId,
      added_by: user.id,
    })
    .select("user_id, added_at")
    .single();

  if (insertError || !inserted) {
    console.error("[stores/members POST] insert failed", insertError);
    return NextResponse.json({ error: "Failed to add co-owner" }, { status: 500 });
  }

  return NextResponse.json({
    member: {
      user_id: inserted.user_id,
      email,
      added_at: inserted.added_at,
    },
  });
}
