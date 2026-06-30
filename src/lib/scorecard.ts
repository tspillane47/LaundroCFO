export type ScorecardVerdict = "Excellent" | "Good" | "Watch" | "Poor";

export const SCORECARD_COLORS: Record<ScorecardVerdict, string> = {
  Excellent: "#22c55e",
  Good: "#eab308",
  Watch: "#f97316",
  Poor: "#ef4444",
};

export function dscrVerdict(dscr: number | null, hasDebt = true): ScorecardVerdict | null {
  if (!hasDebt || dscr == null) return null;
  if (dscr > 2) return "Excellent";
  if (dscr >= 1.5) return "Good";
  if (dscr >= 1.25) return "Watch";
  return "Poor";
}

export function ebitdaMarginVerdict(margin: number): ScorecardVerdict {
  if (margin > 28) return "Excellent";
  if (margin >= 22) return "Good";
  if (margin >= 15) return "Watch";
  return "Poor";
}

export function equipmentScoreVerdict(score: number): ScorecardVerdict {
  if (score > 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 50) return "Watch";
  return "Poor";
}
