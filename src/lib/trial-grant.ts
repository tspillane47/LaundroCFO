import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TRIAL_PLAN, trialEndsAtFromNow } from "@/lib/beta";
import { isEligibleForAutoTrial, type OnboardingProfile } from "@/lib/onboarding";

export type EnsureAutoTrialReason =
  | "created"
  | "already_subscribed"
  | "join_path"
  | "insert_failed";

export type EnsureAutoTrialResult = {
  granted: boolean;
  reason: EnsureAutoTrialReason;
};

export type EnsureAutoTrialOptions = {
  now?: Date;
  /** When set (e.g. end-beta batch), all grants share the same trial end timestamp. */
  trialEndsAt?: string;
};

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

export function buildAutoTrialSubscriptionRow(
  userId: string,
  trialEndsAt: string
): {
  user_id: string;
  plan: typeof DEFAULT_TRIAL_PLAN;
  status: "trialing";
  trial_ends_at: string;
} {
  return {
    user_id: userId,
    plan: DEFAULT_TRIAL_PLAN,
    status: "trialing",
    trial_ends_at: trialEndsAt,
  };
}

/**
 * Idempotently grant a local 14-day Starter trial when the user has no subscription row.
 * Skips join-path users (same rule as end-beta batch grants).
 */
export async function ensureAutoTrialSubscription(
  admin: SupabaseClient,
  userId: string,
  profile: Pick<OnboardingProfile, "onboarding_path"> | null | undefined,
  options: EnsureAutoTrialOptions = {}
): Promise<EnsureAutoTrialResult> {
  if (!isEligibleForAutoTrial(profile)) {
    return { granted: false, reason: "join_path" };
  }

  const { data: existing, error: selectError } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    console.error("ensureAutoTrialSubscription select failed", selectError);
    return { granted: false, reason: "insert_failed" };
  }

  if (existing) {
    return { granted: false, reason: "already_subscribed" };
  }

  const trialEndsAt = options.trialEndsAt ?? trialEndsAtFromNow(options.now);

  const { error: insertError } = await admin
    .from("subscriptions")
    .insert(buildAutoTrialSubscriptionRow(userId, trialEndsAt));

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      return { granted: false, reason: "already_subscribed" };
    }

    console.error("ensureAutoTrialSubscription insert failed", insertError);
    return { granted: false, reason: "insert_failed" };
  }

  return { granted: true, reason: "created" };
}
