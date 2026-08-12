import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingPath = "own" | "join";

export type OnboardingProfile = {
  onboarding_completed: boolean | null;
  onboarding_path: OnboardingPath | null;
};

export type OnboardingStatus = {
  complete: boolean;
  path: OnboardingPath | null;
};

/** Instruction shown to users waiting for a store owner to grant access. */
export const JOIN_STORE_SETTINGS_HINT =
  "Ask the store owner to add you in Settings → Manage Access, using this email:";

function profileIndicatesComplete(profile: OnboardingProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.onboarding_completed === true) return true;
  if (profile.onboarding_path === "join") return true;
  return false;
}

export async function fetchOnboardingProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("onboarding_completed, onboarding_path")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    onboarding_completed: data.onboarding_completed ?? false,
    onboarding_path: (data.onboarding_path as OnboardingPath | null) ?? null,
  };
}

export async function getOnboardingStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingStatus> {
  const profile = await fetchOnboardingProfile(supabase, userId);

  if (profileIndicatesComplete(profile)) {
    return {
      complete: true,
      path: profile?.onboarding_path ?? (profile?.onboarding_completed ? "own" : "join"),
    };
  }

  const { count } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) > 0) {
    return { complete: true, path: "own" };
  }

  return { complete: false, path: profile?.onboarding_path ?? null };
}

/** True when the user finished onboarding or already has stores (pre-migration users). */
export async function isOnboardingComplete(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const status = await getOnboardingStatus(supabase, userId);
  return status.complete;
}

export async function completeOnboarding(
  supabase: SupabaseClient,
  userId: string,
  path: OnboardingPath
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({
      onboarding_completed: true,
      onboarding_path: path,
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

export function isJoiningOnboardingPath(path: OnboardingPath | null | undefined): boolean {
  return path === "join";
}

/** Join-path users are waiting for co-owner access, not their own store subscription. */
export function isEligibleForAutoTrial(
  profile: Pick<OnboardingProfile, "onboarding_path"> | null | undefined
): boolean {
  return !isJoiningOnboardingPath(profile?.onboarding_path);
}

export const JOIN_PATH_STORE_CREATION_MESSAGE =
  "You're set up to join a store someone else owns. Ask the store owner to add you in Settings → Manage Access, or choose \"Set up your own store\" from Portfolio to switch paths.";
