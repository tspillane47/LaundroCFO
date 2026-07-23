import { NextResponse } from "next/server";
import type { PlanKey } from "@/lib/beta";
import { PLANS } from "@/lib/config";
import { getStripe, getStripePriceId } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && value in PLANS;
}

export async function POST(request: Request) {
  console.log("[create-checkout-session] POST received");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("[create-checkout-session] no authenticated user — returning 401");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[create-checkout-session] authenticated user", { userId: user.id, email: user.email });

  let body: { plan?: unknown };
  try {
    body = await request.json();
  } catch {
    console.error("[create-checkout-session] invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("[create-checkout-session] request body", body);

  if (!isPlanKey(body.plan)) {
    return NextResponse.json(
      { error: "Invalid plan. Expected starter, pro, or growth." },
      { status: 400 }
    );
  }

  const plan = body.plan;
  let priceId: string;
  try {
    priceId = getStripePriceId(plan);
    console.log("[create-checkout-session] resolved price", { plan, priceId });
  } catch (error) {
    console.error("[create-checkout-session] missing Stripe price configuration", error);
    return NextResponse.json(
      { error: "Stripe pricing is not configured" },
      { status: 500 }
    );
  }

  const { data: existingSubscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const origin =
    request.headers.get("origin") ?? new URL(request.url).origin;

  const sessionParams: Parameters<
    ReturnType<typeof getStripe>["checkout"]["sessions"]["create"]
  >[0] = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/account?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    client_reference_id: user.id,
    metadata: {
      user_id: user.id,
      plan,
    },
    subscription_data: {
      metadata: {
        user_id: user.id,
        plan,
      },
    },
  };

  if (existingSubscription?.stripe_customer_id) {
    sessionParams.customer = existingSubscription.stripe_customer_id;
  } else if (user.email) {
    sessionParams.customer_email = user.email;
  }

  try {
    const stripe = getStripe();
    console.log("[create-checkout-session] creating Stripe session", {
      plan,
      hasExistingCustomer: Boolean(existingSubscription?.stripe_customer_id),
    });
    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      console.error("[create-checkout-session] Stripe session created without url", {
        sessionId: session.id,
      });
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    console.log("[create-checkout-session] success", { sessionId: session.id, url: session.url });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[create-checkout-session] Stripe API call failed", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
