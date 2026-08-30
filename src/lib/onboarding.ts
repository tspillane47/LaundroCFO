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

/** Skip redundant upsert when the profile already reflects the intended path. */
export function isOnboardingAlreadySavedForPath(
  profile: OnboardingProfile | null | undefined,
  path: OnboardingPath
): boolean {
  if (!profileIndicatesComplete(profile)) return false;
  return profile!.onboarding_path === path;
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

export class OnboardingCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingCompletionError";
  }
}

export async function completeOnboarding(
  supabase: SupabaseClient,
  userId: string,
  path: OnboardingPath
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        onboarding_completed: true,
        onboarding_path: path,
      },
      { onConflict: "id" }
    )
    .select("id, onboarding_completed, onboarding_path")
    .single();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new OnboardingCompletionError(
      "Failed to persist onboarding completion: no profile row returned"
    );
  }
}

const ONBOARDING_STATUS_INVALIDATED = "laundrocfo:onboarding-status-invalidated";

const onboardingCacheInvalidators: Array<() => void> = [];

/** Let session-cache clear its onboarding records without a circular import. */
export function registerOnboardingCacheInvalidator(fn: () => void): void {
  onboardingCacheInvalidators.push(fn);
}

/** Bust client-side onboarding status reads (e.g. useOnboardingStatus) after completion. */
export function invalidateOnboardingStatusCache(): void {
  for (const fn of onboardingCacheInvalidators) fn();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ONBOARDING_STATUS_INVALIDATED));
  }
}

export { ONBOARDING_STATUS_INVALIDATED };

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
