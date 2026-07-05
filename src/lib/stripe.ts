import Stripe from "stripe";
import type { PlanKey } from "@/lib/beta";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

const PRICE_ENV_KEYS: Record<PlanKey, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  growth: "STRIPE_PRICE_GROWTH",
};

export function getStripePriceId(plan: PlanKey): string {
  const envKey = PRICE_ENV_KEYS[plan];
  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(`Missing ${envKey}`);
  }
  return priceId;
}

export function planFromPriceId(priceId: string): PlanKey | null {
  for (const plan of Object.keys(PRICE_ENV_KEYS) as PlanKey[]) {
    if (process.env[PRICE_ENV_KEYS[plan]] === priceId) {
      return plan;
    }
  }
  return null;
}

export function planFromStripeSubscription(
  subscription: Stripe.Subscription
): PlanKey | null {
  const priceId = subscription.items.data[0]?.price?.id;
  return priceId ? planFromPriceId(priceId) : null;
}
