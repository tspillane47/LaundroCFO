import type { SupabaseClient } from "@supabase/supabase-js";

/** True when the user finished onboarding or already has stores (pre-migration users). */
export async function isOnboardingComplete(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.onboarding_completed === true) return true;

  const { count } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return (count ?? 0) > 0;
}
