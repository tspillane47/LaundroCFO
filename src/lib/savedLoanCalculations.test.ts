import { describe, expect, it } from "vitest";
import {
  buildSavedLoanForwardOutputs,
  buildSavedLoanInputs,
  buildSavedLoanReverseOutputs,
  formatSavedLoanSummaryWithInputs,
  parseSavedLoanInputs,
  savedInputsToCalculatorState,
} from "@/lib/savedLoanCalculations";

describe("savedLoanCalculations", () => {
  const forwardState = {
    calcMode: "forward" as const,
    loanAmount: 250_000,
    targetDscr: 1.25,
    maxLtvPercent: 80,
    interestRate: 7.5,
    termMonths: 120,
    interestOnlyEnabled: false,
    interestOnlyMonths: 12,
    deferredEnabled: false,
    deferredMonths: 6,
    isRefinance: false,
  };

  const reverseState = {
    ...forwardState,
    calcMode: "reverse" as const,
  };

  it("builds forward inputs and outputs snapshots", () => {
    const inputs = buildSavedLoanInputs(forwardState);
    expect(inputs).toEqual(forwardState);

    const outputs = buildSavedLoanForwardOutputs({
      monthlyPayment: 2970,
      dscr: 1.42,
      businessLtv: 62.5,
      annualDebtService: 35_640,
      totalAnnualDebtService: 35_640,
    });

    expect(outputs.calcMode).toBe("forward");
    expect(outputs.dscr).toBe(1.42);
  });

  it("builds reverse outputs snapshots", () => {
    const outputs = buildSavedLoanReverseOutputs({
      maxLoanAmount: 310_000,
      dscrBasedMaxLoan: 350_000,
      ltvBasedMaxLoan: 310_000,
      bindingConstraint: "ltv",
      maxLtvPercent: 80,
      resultingDscr: 1.31,
    });

    expect(outputs.calcMode).toBe("reverse");
    expect(outputs.bindingConstraint).toBe("ltv");
  });

  it("formats forward and reverse summaries", () => {
    const forwardOutputs = buildSavedLoanForwardOutputs({
      monthlyPayment: 2970,
      dscr: 1.42,
      businessLtv: 62.5,
      annualDebtService: 35_640,
      totalAnnualDebtService: 35_640,
    });
    expect(formatSavedLoanSummaryWithInputs(forwardState, forwardOutputs)).toBe(
      "$250,000 @ 7.5% / 10yr → DSCR 1.42x"
    );

    const reverseOutputs = buildSavedLoanReverseOutputs({
      maxLoanAmount: 310_000,
      dscrBasedMaxLoan: 350_000,
      ltvBasedMaxLoan: 310_000,
      bindingConstraint: "ltv",
      maxLtvPercent: 80,
      resultingDscr: 1.31,
    });
    expect(formatSavedLoanSummaryWithInputs(reverseState, reverseOutputs)).toBe(
      "Max loan $310,000 (LTV-limited)"
    );
  });

  it("round-trips saved inputs through parse and restore", () => {
    const parsed = parseSavedLoanInputs(forwardState);
    expect(parsed).toEqual(forwardState);
    expect(savedInputsToCalculatorState(parsed!)).toEqual(forwardState);
  });

  it("rejects invalid saved input payloads", () => {
    expect(parseSavedLoanInputs(null)).toBeNull();
    expect(parseSavedLoanInputs({ calcMode: "sideways" })).toBeNull();
  });
});
