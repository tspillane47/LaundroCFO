"use client";

import clsx from "clsx";
import {
  getFinancialDataConfidenceMessage,
  getFinancialDataConfidenceShortMessage,
  getPortfolioFinancialDataConfidenceMessage,
  needsFinancialDataConfidenceNote,
  type PortfolioFinancialDataConfidenceSummary,
} from "@/lib/financialDataConfidence";

type FinancialDataConfidenceNoteProps = {
  monthsUsed?: number | null;
  portfolioSummary?: PortfolioFinancialDataConfidenceSummary | null;
  variant?: "hero" | "inline" | "compact";
  className?: string;
};

const variantStyles = {
  hero: "text-[11px] leading-relaxed text-sky-200/80 max-w-xl",
  inline: "text-[11px] leading-relaxed text-[var(--text-muted)]",
  compact: "text-[10px] leading-snug text-[var(--text-muted)]",
} as const;

export function FinancialDataConfidenceNote({
  monthsUsed,
  portfolioSummary,
  variant = "inline",
  className,
}: FinancialDataConfidenceNoteProps) {
  let message: string | null = null;

  if (portfolioSummary) {
    message = getPortfolioFinancialDataConfidenceMessage(portfolioSummary);
  } else if (needsFinancialDataConfidenceNote(monthsUsed)) {
    message =
      variant === "compact"
        ? getFinancialDataConfidenceShortMessage(monthsUsed!)
        : getFinancialDataConfidenceMessage(monthsUsed!);
  }

  if (!message) return null;

  return <p className={clsx(variantStyles[variant], className)}>{message}</p>;
}
