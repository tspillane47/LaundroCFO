import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANS } from "@/lib/config";
import {
  BETA_MODE_SETTING_KEY,
  parseBetaSettingValue,
  type PlanKey,
  type SubscriptionStatus,
} from "@/lib/beta";

export type AccessReason =
  | "beta"
  | "active"
  | "trialing"
  | "trial_expired"
  | "canceled"
  | "past_due"
  | "no_subscription";

export type AccessStatus = {
  plan: PlanKey | null;
  isReadOnly: boolean;
  reason: AccessReason;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  maxStores: number | null;
};

type SubscriptionRow = {
  plan: PlanKey;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

function maxStoresForPlan(plan: PlanKey | null): number | null {
  if (!plan) return 0;
  return PLANS[plan]?.maxStores ?? null;
}

async function fetchBetaMode(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", BETA_MODE_SETTING_KEY)
    .maybeSingle();

  if (error) return false;
  return parseBetaSettingValue(data?.value);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveSubscriptionAccess(
  subscription: SubscriptionRow | null,
  now = new Date()
): Pick<
  AccessStatus,
  "plan" | "isReadOnly" | "reason" | "trialEndsAt" | "currentPeriodEnd" | "maxStores"
> {
  if (!subscription) {
    return {
      plan: null,
      isReadOnly: true,
      reason: "no_subscription",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: 0,
    };
  }

  const trialEndsAt = parseDate(subscription.trial_ends_at);
  const currentPeriodEnd = parseDate(subscription.current_period_end);
  const plan = subscription.plan;
  const maxStores = maxStoresForPlan(plan);
  const base = { plan, trialEndsAt, currentPeriodEnd, maxStores };

  if (subscription.status === "active") {
    return {
      ...base,
      isReadOnly: false,
      reason: "active",
    };
  }

  if (subscription.status === "trialing") {
    const trialValid = trialEndsAt != null && trialEndsAt.getTime() > now.getTime();
    if (trialValid) {
      return {
        ...base,
        isReadOnly: false,
        reason: "trialing",
      };
    }

    return {
      ...base,
      isReadOnly: true,
      reason: "trial_expired",
    };
  }

  if (subscription.status === "canceled") {
    return {
      ...base,
      isReadOnly: true,
      reason: "canceled",
    };
  }

  if (subscription.status === "past_due") {
    return {
      ...base,
      isReadOnly: true,
      reason: "past_due",
    };
  }

  return {
    ...base,
    isReadOnly: true,
    reason: "past_due",
  };
}

export async function getAccessStatus(
  supabase: SupabaseClient,
  userId: string,
  now = new Date()
): Promise<AccessStatus> {
  const betaMode = await fetchBetaMode(supabase);

  if (betaMode) {
    return {
      plan: null,
      isReadOnly: false,
      reason: "beta",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: null,
    };
  }

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("plan, status, trial_ends_at, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      plan: null,
      isReadOnly: true,
      reason: "no_subscription",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: 0,
    };
  }

  return resolveSubscriptionAccess(subscription as SubscriptionRow | null, now);
}

export async function getUserStoreCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return 0;
  return count ?? 0;
}

export function canAddStore(access: AccessStatus, storeCount: number): boolean {
  if (access.maxStores === null) return true;
  return storeCount < access.maxStores;
}

export function planDisplayName(plan: PlanKey | null): string {
  if (!plan) return "No plan";
  return PLANS[plan]?.name ?? plan;
}

export function formatStoreLimit(maxStores: number | null): string {
  if (maxStores === null) return "Unlimited stores";
  if (maxStores === 1) return "Up to 1 store";
  return `Up to ${maxStores} stores`;
}

function daysUntil(date: Date, now = new Date()): number {
  const diffMs = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function formatAccessStatusLabel(
  reason: AccessReason,
  trialEndsAt: Date | null,
  now = new Date()
): string {
  switch (reason) {
    case "beta":
      return "Beta — All Features Free";
    case "active":
      return "Active";
    case "trialing":
      if (trialEndsAt) {
        const days = daysUntil(trialEndsAt, now);
        return days === 1 ? "Trial ends in 1 day" : `Trial ends in ${days} days`;
      }
      return "Trial active";
    case "trial_expired":
      return "Trial expired";
    case "past_due":
      return "Payment failed";
    case "canceled":
      return "Canceled";
    case "no_subscription":
      return "No subscription";
  }
}

export function readOnlyActionCopy(reason: AccessReason): { message: string; action: string } {
  switch (reason) {
    case "trial_expired":
      return {
        message: "Your free trial has ended. Subscribe to restore full access to LaundroCFO.",
        action: "Subscribe",
      };
    case "canceled":
      return {
        message: "Your subscription has been canceled. Reactivate to restore full access.",
        action: "Reactivate",
      };
    case "past_due":
      return {
        message: "Your subscription payment is past due. Update billing to restore full access.",
        action: "Reactivate",
      };
    default:
      return {
        message: "Subscribe to unlock full access to LaundroCFO.",
        action: "Subscribe",
      };
  }
}

export function storeLimitUpgradeMessage(plan: PlanKey | null): string {
  if (plan === "pro") {
    return "You've reached the store limit for your Pro plan. Upgrade to Growth to add more stores.";
  }
  if (plan === "starter") {
    return "You've reached the store limit for your Starter plan. Upgrade to Pro to add more stores.";
  }
  if (plan === "growth") {
    return "You've reached your store limit.";
  }
  return "Subscribe to add stores to your portfolio.";
}
