import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  buildSubscriptionWritePayload,
  mapStripeSubscriptionStatus,
  subscriptionPeriodEnd,
} from "@/lib/stripe-subscription";
import { getStripe } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

async function upsertSubscriptionFromCheckout(
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.user_id ?? session.client_reference_id;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!userId || !customerId || !subscriptionId) {
    console.error("checkout.session.completed missing required identifiers", {
      userId,
      customerId,
      subscriptionId,
    });
    return;
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const payload = buildSubscriptionWritePayload(
    userId,
    customerId,
    subscription
  );

  if (!payload) {
    console.error("checkout.session.completed could not resolve plan", {
      subscriptionId,
      priceId: subscription.items.data[0]?.price?.id,
    });
    return;
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("subscriptions").upsert(payload, {
    onConflict: "user_id",
  });

  if (error) {
    console.error("checkout.session.completed upsert failed", error);
  }
}

async function updateSubscriptionByStripeId(
  subscription: Stripe.Subscription,
  overrides?: { status?: ReturnType<typeof mapStripeSubscriptionStatus> }
) {
  const admin = createAdminSupabaseClient();
  const update = {
    status: overrides?.status ?? mapStripeSubscriptionStatus(subscription.status),
    current_period_end: subscriptionPeriodEnd(subscription),
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("subscriptions")
    .update(update)
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("subscription update failed", {
      subscriptionId: subscription.id,
      error,
    });
  }
}

async function setSubscriptionStatusByStripeId(
  stripeSubscriptionId: string,
  status: ReturnType<typeof mapStripeSubscriptionStatus>
) {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("subscriptions")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", stripeSubscriptionId);

  if (error) {
    console.error("subscription status update failed", {
      stripeSubscriptionId,
      status,
      error,
    });
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const stripeSubscriptionId =
    typeof subscriptionRef === "string"
      ? subscriptionRef
      : subscriptionRef?.id;

  if (!stripeSubscriptionId) {
    console.error("invoice.payment_failed missing subscription id", {
      invoiceId: invoice.id,
    });
    return;
  }

  await setSubscriptionStatusByStripeId(stripeSubscriptionId, "past_due");
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "Webhook secret is not configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          await upsertSubscriptionFromCheckout(session);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await updateSubscriptionByStripeId(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await setSubscriptionStatusByStripeId(subscription.id, "canceled");
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error(`Stripe webhook handler failed for ${event.type}`, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
