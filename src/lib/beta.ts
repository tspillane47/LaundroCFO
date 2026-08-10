import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANS } from "@/lib/config";

export const TRIAL_LENGTH_DAYS = 14;

export const BETA_MODE_SETTING_KEY = "beta_mode";

export const DEFAULT_TRIAL_PLAN = "starter" satisfies PlanKey;

export type PlanKey = keyof typeof PLANS;

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export function parseBetaSettingValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return false;
}

/** Resolve beta mode from an app_settings query. Read errors fail closed (beta off). */
export function resolveBetaModeFromQuery(result: {
  data: { value: unknown } | null;
  error: unknown;
}): boolean {
  if (result.error) return false;
  return parseBetaSettingValue(result.data?.value);
}

/** Read beta_mode from app_settings. Works for anonymous and authenticated clients. */
export async function fetchBetaModeSetting(supabase: SupabaseClient): Promise<boolean> {
  const result = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", BETA_MODE_SETTING_KEY)
    .maybeSingle();

  return resolveBetaModeFromQuery(result);
}

export function trialEndsAtFromNow(now = new Date()): string {
  const endsAt = new Date(now);
  endsAt.setUTCDate(endsAt.getUTCDate() + TRIAL_LENGTH_DAYS);
  return endsAt.toISOString();
}
