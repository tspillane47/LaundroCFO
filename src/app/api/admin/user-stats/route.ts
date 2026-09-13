import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAdminEmail } from "@/lib/admin";
import { fetchAdminUserStats } from "@/lib/admin-user-stats";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminSupabaseClient();
    const stats = await fetchAdminUserStats(admin);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("admin user-stats failed", error);
    return NextResponse.json({ error: "Failed to load user stats" }, { status: 500 });
  }
}
