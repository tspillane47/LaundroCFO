"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  type DisclaimerVariant,
  getDisclaimerText,
  labelNeedsDisclaimer,
} from "@/lib/disclaimerText";

type DisclaimerProps = {
  variant: DisclaimerVariant;
  className?: string;
};

const variantStyles: Record<DisclaimerVariant, string> = {
  valuation: "text-[10px] text-gray-700 dark:text-slate-500 leading-snug mt-1",
  "report-footer": "text-[10px] text-gray-700 dark:text-slate-500 leading-snug",
  tooltip: "text-[11px] text-[var(--text-secondary)] leading-relaxed",
  full: "text-[13px] text-[var(--text-secondary)] leading-relaxed space-y-4",
};

export function Disclaimer({ variant, className }: DisclaimerProps) {
  if (variant === "full") {
    return (
      <div className={clsx(variantStyles.full, className)}>
        <p>{getDisclaimerText("full")}</p>
        <p className="text-[12px] text-[var(--text-muted)]">
          For complete terms, see our{" "}
          <Link href="/terms" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <p className={clsx(variantStyles[variant], className)}>
      {getDisclaimerText(variant)}
    </p>
  );
}

/** Small info icon that shows the tooltip disclaimer on hover. */
export function DisclaimerTooltip({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={clsx("relative inline-flex items-center", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border text-[9px] leading-none cursor-help select-none"
        style={{
          borderColor: "var(--border2)",
          color: "var(--text-muted)",
        }}
        aria-label="Disclaimer"
      >
        i
      </span>
      {open && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 z-50 rounded-lg px-3 py-2 shadow-lg mb-1.5 w-[220px]"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border2)",
          }}
        >
          <Disclaimer variant="tooltip" />
        </span>
      )}
    </span>
  );
}

/** Metric label with optional disclaimer tooltip for DSCR, EBITDA, multiples, and LaundroCFO Score. */
export function DisclaimerLabel({
  children,
  className,
  forceDisclaimer,
}: {
  children: string;
  className?: string;
  forceDisclaimer?: boolean;
}) {
  const show = forceDisclaimer ?? labelNeedsDisclaimer(children);

  return (
    <span className={clsx("inline-flex items-center gap-1", className)}>
      {children}
      {show && <DisclaimerTooltip />}
    </span>
  );
}
