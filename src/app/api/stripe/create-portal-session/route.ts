import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  console.log("[create-portal-session] POST received");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("[create-portal-session] no authenticated user — returning 401");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[create-portal-session] authenticated user", {
    userId: user.id,
    email: user.email,
  });

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    console.log("[create-portal-session] no stripe_customer_id for user", {
      userId: user.id,
    });
    return NextResponse.json(
      { error: "No billing account found. Subscribe first to manage billing." },
      { status: 400 }
    );
  }

  const origin =
    request.headers.get("origin") ?? new URL(request.url).origin;

  try {
    const stripe = getStripe();
    console.log("[create-portal-session] creating portal session", {
      customerId: subscription.stripe_customer_id,
    });
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/account`,
    });

    if (!session.url) {
      console.error("[create-portal-session] portal session created without url", {
        sessionId: session.id,
      });
      return NextResponse.json(
        { error: "Failed to create billing portal session" },
        { status: 500 }
      );
    }

    console.log("[create-portal-session] success", {
      sessionId: session.id,
      url: session.url,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[create-portal-session] Stripe API call failed", error);
    return NextResponse.json(
      { error: "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
