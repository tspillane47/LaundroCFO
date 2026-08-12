import { describe, expect, it } from "vitest";
import {
  appendFinancialDataConfidenceNote,
  getFinancialDataConfidenceMessage,
  getFinancialDataConfidenceTier,
  needsFinancialDataConfidenceNote,
  summarizePortfolioFinancialDataConfidence,
} from "@/lib/financialDataConfidence";

describe("financialDataConfidence", () => {
  it("does not flag full-year data", () => {
    expect(needsFinancialDataConfidenceNote(12)).toBe(false);
    expect(getFinancialDataConfidenceTier(12)).toBe("full");
  });

  it("labels early and developing tiers", () => {
    expect(getFinancialDataConfidenceTier(4)).toBe("early");
    expect(getFinancialDataConfidenceTier(8)).toBe("developing");
  });

  it("builds an informational message for partial data", () => {
    expect(getFinancialDataConfidenceMessage(4)).toContain("Early estimate");
    expect(getFinancialDataConfidenceMessage(4)).toContain("4 months");
    expect(getFinancialDataConfidenceMessage(8)).toContain("Developing estimate");
  });

  it("summarizes mixed portfolio confidence", () => {
    expect(summarizePortfolioFinancialDataConfidence([12, 4, 8])).toEqual({
      monthsUsed: 4,
      mixed: true,
    });
    expect(summarizePortfolioFinancialDataConfidence([4, 4])).toEqual({
      monthsUsed: 4,
      mixed: false,
    });
    expect(summarizePortfolioFinancialDataConfidence([12, 12])).toBeNull();
  });

  it("appends confidence notes to feed descriptions", () => {
    const result = appendFinancialDataConfidenceNote("Based on 4.0x EBITDA multiple.", 4);
    expect(result).toContain("Based on 4.0x EBITDA multiple.");
    expect(result).toContain("4 months");
  });
});
