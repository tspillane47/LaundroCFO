"use client";

import {
  ArrowRight,
  ArrowDown,
  Download,
  Inbox,
  Tags,
  LineChart,
} from "lucide-react";
import {
  TRANSACTION_CATEGORY_GUIDE,
  TRANSACTION_REVIEW_FLOW_STEPS,
} from "@/lib/transactionReviewGuide";

const STEP_ICONS = {
  import: Download,
  review: Inbox,
  categorize: Tags,
  post: LineChart,
} as const;

export function TransactionReviewGuide() {
  return (
    <section
      className="card p-4 sm:p-5 mt-8"
      style={{ border: "1px solid var(--border)" }}
      aria-labelledby="transaction-review-guide-title"
    >
      <div className="mb-5">
        <h2
          id="transaction-review-guide-title"
          className="text-[17px] font-semibold mb-1.5"
          style={{ color: "var(--text-primary)" }}
        >
          How Reviewing Transactions Works
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Once your bank or QuickBooks data comes in, you&apos;ll sort each transaction once. After
          that, your dashboard and P&amp;L stay up to date automatically.
        </p>
      </div>

      <div className="hidden sm:flex items-stretch gap-2 mb-6">
        {TRANSACTION_REVIEW_FLOW_STEPS.map((step, index) => {
          const Icon = STEP_ICONS[step.id];
          return (
            <div key={step.id} className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="flex-1 rounded-xl px-3 py-3 text-center min-w-0"
                style={{ background: "var(--bg-page)", border: "1px solid var(--border)" }}
              >
                <div
                  className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
                >
                  <Icon size={18} style={{ color: "var(--accent-blue)" }} aria-hidden />
                </div>
                <div className="text-[12px] font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
                  {step.label}
                </div>
                <div className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                  {step.description}
                </div>
              </div>
              {index < TRANSACTION_REVIEW_FLOW_STEPS.length - 1 && (
                <ArrowRight
                  size={16}
                  className="flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="sm:hidden space-y-2 mb-6">
        {TRANSACTION_REVIEW_FLOW_STEPS.map((step, index) => {
          const Icon = STEP_ICONS[step.id];
          return (
            <div key={step.id}>
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: "var(--bg-page)", border: "1px solid var(--border)" }}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                  style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
                >
                  <Icon size={18} style={{ color: "var(--accent-blue)" }} aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {index + 1}. {step.label}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {step.description}
                  </div>
                </div>
              </div>
              {index < TRANSACTION_REVIEW_FLOW_STEPS.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-page)", border: "1px solid var(--border)" }}
      >
        <h3 className="text-[14px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          What goes where?
        </h3>
        <ul className="space-y-2.5">
          {TRANSACTION_CATEGORY_GUIDE.map((item) => (
            <li key={item.name} className="text-[12px] leading-relaxed">
              <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                {item.name}
              </span>
              <span style={{ color: "var(--text-muted)" }}> — {item.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
