import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";
import { BETA_MODE_SETTING_KEY } from "@/lib/beta";

export async function POST() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("app_settings")
    .update({ value: true, updated_at: new Date().toISOString() })
    .eq("key", BETA_MODE_SETTING_KEY);

  if (error) {
    console.error("enable-beta failed", error);
    return NextResponse.json({ error: "Failed to enable beta mode" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, betaMode: true });
}
