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
    <div className="space-y-6 max-w-5xl mx-auto">
      {BETA_MODE && (
        <div
          className="rounded-lg px-4 py-3 text-center text-[13px] font-medium border"
          style={{
            background: "var(--bg-info-tint)",
            borderColor: "var(--border)",
            color: "var(--text-info)",
          }}
        >
          LaundroCFO is free during beta — all features unlocked
        </div>
      )}

      <div className="text-center">
        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Pricing
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
          {BETA_MODE
            ? "All plans are free during beta. Paid tiers launch when beta ends."
            : "Simple plans that scale with your portfolio."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const plan = PLANS[tier.key];
          return (
            <div
              key={tier.key}
              className="card flex flex-col relative"
              style={
                tier.highlighted
                  ? { borderColor: "var(--text-info)", boxShadow: "0 0 0 1px var(--text-info)" }
                  : undefined
              }
            >
              {tier.badge && (
                <div
                  className="absolute -top-2.5 left-4 px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                  style={{ background: "#3b82f6" }}
                >
                  {tier.badge}
                </div>
              )}
              <div className="mb-5">
                <h2 className="text-[16px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                  {plan.name}
                </h2>
                <div className="flex items-baseline gap-1">
                  <span className="text-[32px] font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
                    ${plan.price}
                  </span>
                  <span className="text-[14px]" style={{ color: "var(--text-muted)" }}>
                    /month
                  </span>
                </div>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span className="mt-0.5 flex-shrink-0" style={{ color: "var(--text-success)" }}>
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={tier.highlighted ? "btn-primary w-full text-center py-2.5 text-[13px]" : "btn-outline w-full text-center py-2.5 text-[13px] block"}
              >
                {ctaLabel}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
