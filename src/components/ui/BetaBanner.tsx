"use client";

import { useEffect, useState } from "react";
import { BETA_MODE } from "@/lib/config";

const DISMISS_KEY = "laundrocfo_beta_banner_dismissed";

type BetaBannerProps = {
  onFeedbackClick: () => void;
};

export function BetaBanner({ onFeedbackClick }: BetaBannerProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!BETA_MODE || dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div
      className="flex-shrink-0 px-6 py-2.5 flex items-center justify-between gap-4"
      style={{
        background: "var(--bg-info-tint)",
        borderColor: "var(--border)",
        color: "var(--text-info)",
      }}
    >
      <p className="text-[12px] leading-snug">
        You are using LaundroCFO Beta — all features are free. We&apos;d love your feedback.{" "}
        <button
          type="button"
          onClick={onFeedbackClick}
          className="font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Send feedback
        </button>
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:opacity-70 transition-opacity"
        aria-label="Dismiss beta banner"
        style={{ color: "var(--text-info)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
