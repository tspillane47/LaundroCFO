"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { TRANSACTION_REVIEW_TIPS } from "@/lib/transactionReviewGuide";
import { TransactionReviewActionCard } from "@/components/transactions/TransactionReviewActionCard";

const DISMISS_KEY = "laundrocfo_tx_review_tips_dismissed";

type TransactionReviewTipsBannerProps = {
  onDismiss: () => void;
  uncategorizedCount: number;
};

export function TransactionReviewTipsToggle({
  expanded,
  onToggle,
  className,
}: {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={clsx(
        "text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors",
        className
      )}
      style={{
        color: "var(--text-info)",
        background: expanded ? "var(--bg-info-tint)" : "transparent",
        border: "1px solid rgba(37, 99, 235, 0.2)",
      }}
    >
      {expanded ? "Hide tips" : "Review tips"}
    </button>
  );
}

export function TransactionReviewTipsBanner({
  onDismiss,
  uncategorizedCount,
}: TransactionReviewTipsBannerProps) {
  return (
    <div className="space-y-3" role="note" aria-label="Transaction review tips">
      {uncategorizedCount > 0 ? (
        <TransactionReviewActionCard count={uncategorizedCount} href={null} />
      ) : (
        <div
          className="rounded-lg px-4 py-3"
          style={{
            background: "var(--bg-success-tint)",
            border: "1px solid rgba(34, 197, 94, 0.15)",
            color: "var(--text-success)",
          }}
        >
          <p className="text-[13px] font-semibold">
            All transactions in this queue have a category — post when you&apos;re ready.
          </p>
        </div>
      )}

      <div
        className="rounded-lg px-4 py-3 flex items-start justify-between gap-4"
        style={{
          background: "var(--bg-info-tint)",
          border: "1px solid rgba(37, 99, 235, 0.15)",
          color: "var(--text-info)",
        }}
      >
        <div className="min-w-0">
          <p className="text-[12px] font-semibold mb-1">Quick reminders while you review</p>
          <ul className="space-y-1.5">
            {TRANSACTION_REVIEW_TIPS.map((tip) => (
              <li key={tip} className="text-[12px] leading-snug flex gap-2">
                <span aria-hidden>•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:opacity-70 transition-opacity"
          aria-label="Dismiss review tips for this session"
          style={{ color: "var(--text-info)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function useTransactionReviewTips() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    try {
      setVisible(sessionStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore storage failures
    }
    setVisible(false);
  }

  function show() {
    try {
      sessionStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore storage failures
    }
    setVisible(true);
  }

  return { visible, dismiss, show };
}
