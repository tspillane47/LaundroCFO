import { NextResponse } from "next/server";
import { deleteUserAccount } from "@/lib/account-deletion";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const revokeResult = await deleteUserAccount(user.id);

    return NextResponse.json({
      ok: true,
      revokeFailures: revokeResult.failures,
    });
  } catch (error) {
    console.error("[account/delete] failed", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
