import { BETA_MODE, PLANS } from "@/lib/config";

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
  return BETA_MODE;
}

export function trialEndsAtFromNow(now = new Date()): string {
  const endsAt = new Date(now);
  endsAt.setUTCDate(endsAt.getUTCDate() + TRIAL_LENGTH_DAYS);
  return endsAt.toISOString();
}
