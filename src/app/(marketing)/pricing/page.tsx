"use client";

import Link from "next/link";
import { BETA_MODE, PLANS } from "@/lib/config";

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
  const ctaLabel = BETA_MODE ? "Join Beta — Free" : "Get Started";

  return (
    <div className="pt-32 pb-24 bg-white">
      <div className="max-w-5xl mx-auto px-6 space-y-8">
        {BETA_MODE && (
          <div className="rounded-lg px-4 py-3 text-center text-[13px] font-medium border border-blue-200 bg-blue-50 text-blue-700">
            LaundroCFO is free during beta — all features unlocked
          </div>
        )}

        <div className="text-center">
          <h1 className="text-[32px] font-bold tracking-tight text-slate-900">Pricing</h1>
          <p className="text-[15px] mt-2 text-slate-500">
            {BETA_MODE
              ? "All plans are free during beta. Paid tiers launch when beta ends."
              : "Simple plans that scale with your portfolio."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier) => {
            const plan = PLANS[tier.key];
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
                    <span className="text-[14px] text-slate-400">/month</span>
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
                <Link
                  href="/signup"
                  className={
                    tier.highlighted
                      ? "w-full text-center py-2.5 text-[13px] font-semibold rounded-lg bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
                      : "w-full text-center py-2.5 text-[13px] font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors block"
                  }
                >
                  {ctaLabel}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
