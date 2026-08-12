export type FinancialDataConfidenceTier = "full" | "developing" | "early";

const FULL_YEAR_MONTHS = 12;
const DEVELOPING_THRESHOLD_MONTHS = 6;

export function getFinancialDataConfidenceTier(
  monthsUsed: number | null | undefined
): FinancialDataConfidenceTier {
  const months = monthsUsed ?? 0;
  if (months >= FULL_YEAR_MONTHS) return "full";
  if (months >= DEVELOPING_THRESHOLD_MONTHS) return "developing";
  return "early";
}

export function needsFinancialDataConfidenceNote(
  monthsUsed: number | null | undefined
): boolean {
  const months = monthsUsed ?? 0;
  return months > 0 && months < FULL_YEAR_MONTHS;
}

export function getFinancialDataConfidenceTierLabel(
  tier: FinancialDataConfidenceTier
): string | null {
  if (tier === "developing") return "Developing estimate";
  if (tier === "early") return "Early estimate";
  return null;
}

function monthLabel(monthsUsed: number): string {
  return monthsUsed === 1 ? "month" : "months";
}

/** Full user-facing note when valuation metrics rely on partial transaction history. */
export function getFinancialDataConfidenceMessage(monthsUsed: number): string {
  const tier = getFinancialDataConfidenceTier(monthsUsed);
  const tierLabel = getFinancialDataConfidenceTierLabel(tier);
  const base = `Based on ${monthsUsed} ${monthLabel(monthsUsed)} of transaction data — accuracy improves as more history accumulates.`;
  return tierLabel ? `${tierLabel} · ${base}` : base;
}

/** Compact label for tight layouts (store cards, KPI subs). */
export function getFinancialDataConfidenceShortMessage(monthsUsed: number): string {
  return `${monthsUsed} mo. of data`;
}

export type PortfolioFinancialDataConfidenceSummary = {
  monthsUsed: number;
  mixed: boolean;
};

export function summarizePortfolioFinancialDataConfidence(
  monthsUsedList: number[]
): PortfolioFinancialDataConfidenceSummary | null {
  const partial = monthsUsedList.filter((months) => months > 0 && months < FULL_YEAR_MONTHS);
  if (partial.length === 0) return null;

  const unique = new Set(partial);
  if (unique.size === 1) {
    return { monthsUsed: partial[0], mixed: false };
  }

  return { monthsUsed: Math.min(...partial), mixed: true };
}

export function getPortfolioFinancialDataConfidenceMessage(
  summary: PortfolioFinancialDataConfidenceSummary
): string {
  if (summary.mixed) {
    return "Some stores have less than 12 months of transaction data — portfolio estimates improve as more history accumulates.";
  }
  return getFinancialDataConfidenceMessage(summary.monthsUsed);
}

export function appendFinancialDataConfidenceNote(
  description: string,
  monthsUsed: number | null | undefined
): string {
  if (!needsFinancialDataConfidenceNote(monthsUsed)) return description;
  return `${description} ${getFinancialDataConfidenceMessage(monthsUsed!)}`;
}
