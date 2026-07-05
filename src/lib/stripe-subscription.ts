import type Stripe from "stripe";
import type { PlanKey, SubscriptionStatus } from "@/lib/beta";
import { planFromStripeSubscription } from "@/lib/stripe";

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    case "unpaid":
      return "past_due";
    case "paused":
      return "active";
    default:
      return "incomplete";
  }
}

export function subscriptionPeriodEnd(
  subscription: Stripe.Subscription
): string | null {
  const periodEnd = subscription.items.data[0]?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

export type SubscriptionWritePayload = {
  user_id: string;
  plan: PlanKey;
  status: SubscriptionStatus;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  current_period_end: string | null;
  updated_at: string;
};

export function buildSubscriptionWritePayload(
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription
): SubscriptionWritePayload | null {
  const plan = planFromStripeSubscription(subscription);
  if (!plan) {
    return null;
  }

  return {
    user_id: userId,
    plan,
    status: mapStripeSubscriptionStatus(subscription.status),
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    current_period_end: subscriptionPeriodEnd(subscription),
    updated_at: new Date().toISOString(),
  };
}
