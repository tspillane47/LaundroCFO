"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PLANS } from "@/lib/config";
import type { PlanKey } from "@/lib/beta";
import { createClient } from "@/lib/supabase";
import { useBetaMode } from "@/lib/useBetaMode";

const tiers = [
  {
    key: "starter" as const,
    highlighted: false,
    features: [
      "1 store",
      "Manual CSV import",
      "All core pages",
      "Reports",
      "Scenarios",
      "Benchmarking",
      "Alerts",
    ],
  },
  {
    key: "pro" as const,
    highlighted: true,
    badge: "Most Popular",
    features: [
      "Up to 3 stores",
      "Everything in Starter",
      "Plaid bank connection",
      "QuickBooks sync",
      "Transaction review",
    ],
  },
  {
    key: "growth" as const,
    highlighted: false,
    features: [
      "Unlimited stores",
      "Everything in Pro",
      "Network benchmarking",
      "Priority support",
      "White-label reports",
    ],
  },
];

export default function PricingPage() {
  const { betaMode } = useBetaMode();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<PlanKey | null>(null);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!cancelled) {
        setIsLoggedIn(Boolean(user));
        setCheckingAuth(false);
      }
    }

    void loadAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const startCheckout = useCallback(async (plan: PlanKey) => {
    setCheckoutError("");
    setCheckoutPlan(plan);

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout");
      }

      window.location.href = data.url;
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Could not start checkout"
      );
      setCheckoutPlan(null);
    }
  }, []);

  const ctaLabel = betaMode ? "Join Beta — Free" : "Get Started";
  const useCheckout = !betaMode && isLoggedIn;

  return (
    <div className="pt-32 pb-24 bg-[var(--bg-page)]">
      <div className="max-w-5xl mx-auto px-6 space-y-8">
        {betaMode && (
          <div className="rounded-lg px-4 py-3 text-center text-[13px] font-medium border border-blue-200 bg-blue-50 text-blue-700">
            LaundroCFO is free during beta — all features unlocked
          </div>
        )}

        <div className="text-center">
          <h1 className="text-[32px] font-bold tracking-tight text-slate-900">Pricing</h1>
          <p className="text-[15px] mt-2 text-slate-500">
            {betaMode
              ? "All plans are free during beta. Paid tiers launch when beta ends."
              : "Simple plans that scale with your portfolio."}
          </p>
        </div>

        {checkoutError && (
          <div className="rounded-lg px-4 py-3 text-center text-[13px] font-medium border border-red-200 bg-red-50 text-red-700">
            {checkoutError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier) => {
            const plan = PLANS[tier.key];
            const isLoading = checkoutPlan === tier.key;
            const buttonClassName = tier.highlighted
              ? "w-full text-center py-2.5 text-[13px] font-semibold rounded-lg bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              : "w-full text-center py-2.5 text-[13px] font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

            return (
              <div
                key={tier.key}
                className={`flex flex-col relative p-8 rounded-2xl border bg-white ${
                  tier.highlighted
                    ? "border-[#2563eb] shadow-lg ring-1 ring-[#2563eb]"
                    : "border-slate-200 hover:shadow-lg transition-shadow"
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-2.5 left-4 px-2 py-0.5 rounded text-[10px] font-semibold text-white bg-[#2563eb]">
                    {tier.badge}
                  </div>
                )}
                <div className="mb-5">
                  <h2 className="text-[16px] font-bold mb-1 text-slate-900">{plan.name}</h2>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[32px] font-extrabold tracking-tight text-slate-900">
                      ${plan.price}
                    </span>
                    <span className="text-[14px] text-[var(--text-secondary)]">/month</span>
                  </div>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-[13px] text-slate-600">
                      <span className="mt-0.5 flex-shrink-0 text-emerald-500">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                {useCheckout ? (
                  <button
                    type="button"
                    onClick={() => startCheckout(tier.key)}
                    disabled={checkingAuth || isLoading}
                    className={buttonClassName}
                  >
                    {isLoading ? "Redirecting…" : "Subscribe"}
                  </button>
                ) : (
                  <Link href="/signup" className={buttonClassName}>
                    {checkingAuth && !betaMode ? "Loading…" : ctaLabel}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
