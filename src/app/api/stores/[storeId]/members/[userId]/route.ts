import { NextResponse } from "next/server";
import { verifyUserOwnsStore } from "@/lib/store-access";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type RouteContext = {
  params: Promise<{ storeId: string; userId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { storeId, userId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = await verifyUserOwnsStore(supabase, storeId, user.id);
  if (!isOwner) {
    return NextResponse.json({ error: "Only the store owner can remove co-owners" }, { status: 403 });
  }

  const { data: deleted, error } = await supabase
    .from("store_members")
    .delete()
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.error("[stores/members DELETE] delete failed", error);
    return NextResponse.json({ error: "Failed to remove co-owner" }, { status: 500 });
  }

  if (!deleted) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
