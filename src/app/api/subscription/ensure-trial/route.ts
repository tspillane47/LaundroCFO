import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchOnboardingProfile } from "@/lib/onboarding";
import { ensureAutoTrialSubscription } from "@/lib/trial-grant";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await fetchOnboardingProfile(supabase, user.id);
  const admin = createAdminSupabaseClient();
  const result = await ensureAutoTrialSubscription(admin, user.id, profile);

  return NextResponse.json(result);
}
