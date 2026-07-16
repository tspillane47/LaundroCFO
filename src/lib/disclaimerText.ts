export type DisclaimerVariant = "valuation" | "report-footer" | "tooltip" | "full" | "loan-calculator";

export const DISCLAIMER_TEXT: Record<DisclaimerVariant, string> = {
  valuation:
    "Estimated value for informational purposes only. Not an appraisal, offer, or professional advice. Based on user-provided data and proprietary calculations.",
  "report-footer":
    "LaundroCFO report — estimates only, not professional advice. Verify all figures independently. See laundrocfo.com/terms.",
  tooltip:
    "Estimate based on your data and LaundroCFO calculations. Not financial, legal, tax, or lending advice.",
  full:
    "LaundroCFO is a software platform for informational and business management purposes only. All calculations, valuations, reports, projections, KPIs, and analytics are estimates based on user-provided information and proprietary calculations and should not be relied upon as professional advice.",
  "loan-calculator":
    "This is an estimate for planning purposes only. It is not a loan offer, pre-qualification, or guarantee of financing terms. Actual loan terms are determined by lenders based on full underwriting.",
};

export function getDisclaimerText(variant: DisclaimerVariant): string {
  return DISCLAIMER_TEXT[variant];
}

/** Labels that should show the disclaimer tooltip (DSCR, EBITDA, multiples, LaundroCFO Score). */
export function labelNeedsDisclaimer(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes("dscr") ||
    l.includes("ebitda") ||
    l.includes("multiple") ||
    l.includes("laundrocfo score")
  );
}
