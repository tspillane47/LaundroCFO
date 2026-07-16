import { describe, expect, it } from "vitest";
import {
  calcAmortizingMonthlyPayment,
  calcMultiPhaseLoan,
} from "@/lib/amortization";

/** Reference PMT for cross-checking plain amortizing loans */
function referencePmt(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 100 / 12;
  if (months <= 0 || principal <= 0) return 0;
  if (r === 0) return principal / months;
  const factor = Math.pow(1 + r, months);
  return principal * (r * factor) / (factor - 1);
}

describe("calcAmortizingMonthlyPayment", () => {
  it("matches standard PMT formula", () => {
    const principal = 500_000;
    const rate = 7.5;
    const months = 120;
    expect(calcAmortizingMonthlyPayment(principal, rate, months)).toBeCloseTo(
      referencePmt(principal, rate, months),
      6
    );
  });

  it("handles zero interest rate", () => {
    expect(calcAmortizingMonthlyPayment(120_000, 0, 60)).toBe(2_000);
  });

  it("returns 0 for invalid inputs", () => {
    expect(calcAmortizingMonthlyPayment(0, 7.5, 120)).toBe(0);
    expect(calcAmortizingMonthlyPayment(100_000, 7.5, 0)).toBe(0);
  });
});

describe("calcMultiPhaseLoan — plain amortizing (no special phases)", () => {
  it("matches calcAmortizingMonthlyPayment exactly", () => {
    const principal = 500_000;
    const rate = 7.5;
    const term = 120;

    const simple = calcAmortizingMonthlyPayment(principal, rate, term);
    const result = calcMultiPhaseLoan({ principal, annualInterestRate: rate, termMonths: term });

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].type).toBe("amortizing");
    expect(result.phases[0].months).toBe(term);
    expect(result.month1Payment).toBeCloseTo(simple, 6);
    expect(result.stabilizedPayment).toBeCloseTo(simple, 6);
    expect(result.maxMonthlyPayment).toBeCloseTo(simple, 6);
    expect(result.annualDebtService).toBeCloseTo(simple * 12, 4);
  });

  it("matches reference PMT for multiple rate/term combinations", () => {
    const cases = [
      { principal: 250_000, rate: 6.25, term: 84 },
      { principal: 1_000_000, rate: 8.0, term: 180 },
      { principal: 75_000, rate: 5.5, term: 36 },
    ];

    for (const { principal, rate, term } of cases) {
      const expected = referencePmt(principal, rate, term);
      const result = calcMultiPhaseLoan({
        principal,
        annualInterestRate: rate,
        termMonths: term,
      });
      expect(result.stabilizedPayment).toBeCloseTo(expected, 4);
      expect(result.month1Payment).toBeCloseTo(expected, 4);
    }
  });

  it("treats explicit zero special phases same as omitted", () => {
    const inputs = { principal: 300_000, annualInterestRate: 7.0, termMonths: 60 };
    const omitted = calcMultiPhaseLoan(inputs);
    const explicit = calcMultiPhaseLoan({
      ...inputs,
      deferredMonths: 0,
      interestOnlyMonths: 0,
    });
    expect(explicit.stabilizedPayment).toBeCloseTo(omitted.stabilizedPayment, 6);
    expect(explicit.phases).toHaveLength(1);
  });
});

describe("calcMultiPhaseLoan — interest-only only", () => {
  it("charges interest-only payment with no amortizing phase when IO equals term", () => {
    const principal = 400_000;
    const rate = 7.5;
    const term = 24;

    const result = calcMultiPhaseLoan({
      principal,
      annualInterestRate: rate,
      termMonths: term,
      interestOnlyMonths: term,
    });

    const expectedIo = principal * (rate / 100 / 12);
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].type).toBe("interest-only");
    expect(result.month1Payment).toBeCloseTo(expectedIo, 4);
    expect(result.stabilizedPayment).toBeCloseTo(expectedIo, 4);
    expect(result.maxMonthlyPayment).toBeCloseTo(expectedIo, 4);
  });

  it("follows IO period with amortizing for remaining term", () => {
    const principal = 500_000;
    const rate = 7.5;
    const term = 120;
    const ioMonths = 12;

    const result = calcMultiPhaseLoan({
      principal,
      annualInterestRate: rate,
      termMonths: term,
      interestOnlyMonths: ioMonths,
    });

    const ioPayment = principal * (rate / 100 / 12);
    const amortPayment = calcAmortizingMonthlyPayment(principal, rate, term - ioMonths);

    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].type).toBe("interest-only");
    expect(result.phases[0].monthlyPayment).toBeCloseTo(ioPayment, 4);
    expect(result.phases[1].type).toBe("amortizing");
    expect(result.phases[1].months).toBe(term - ioMonths);
    expect(result.month1Payment).toBeCloseTo(ioPayment, 4);
    expect(result.stabilizedPayment).toBeCloseTo(amortPayment, 4);
    expect(result.maxMonthlyPayment).toBeCloseTo(Math.max(ioPayment, amortPayment), 4);
  });
});

describe("calcMultiPhaseLoan — deferred only", () => {
  it("has zero month-1 payment and capitalizes interest", () => {
    const principal = 500_000;
    const rate = 7.5;
    const deferred = 6;

    const result = calcMultiPhaseLoan({
      principal,
      annualInterestRate: rate,
      termMonths: 120,
      deferredMonths: deferred,
    });

    const capitalized = principal * Math.pow(1 + rate / 100 / 12, deferred);
    const amortPayment = calcAmortizingMonthlyPayment(capitalized, rate, 120 - deferred);

    expect(result.phases[0].type).toBe("deferred");
    expect(result.month1Payment).toBe(0);
    expect(result.phases[0].endingBalance).toBeCloseTo(capitalized, 2);
    expect(result.phases[1].type).toBe("amortizing");
    expect(result.stabilizedPayment).toBeCloseTo(amortPayment, 4);
    expect(result.maxMonthlyPayment).toBeCloseTo(amortPayment, 4);
  });

  it("defers entire term when deferred equals term", () => {
    const result = calcMultiPhaseLoan({
      principal: 200_000,
      annualInterestRate: 8,
      termMonths: 12,
      deferredMonths: 12,
    });

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].type).toBe("deferred");
    expect(result.month1Payment).toBe(0);
    expect(result.stabilizedPayment).toBe(0);
    expect(result.maxMonthlyPayment).toBe(0);
  });
});

describe("calcMultiPhaseLoan — deferred + interest-only combined", () => {
  it("runs deferred → IO → amortizing in order", () => {
    const principal = 600_000;
    const rate = 7.0;
    const term = 120;
    const deferred = 6;
    const io = 12;

    const result = calcMultiPhaseLoan({
      principal,
      annualInterestRate: rate,
      termMonths: term,
      deferredMonths: deferred,
      interestOnlyMonths: io,
    });

    const afterDeferred = principal * Math.pow(1 + rate / 100 / 12, deferred);
    const ioPayment = afterDeferred * (rate / 100 / 12);
    const amortMonths = term - deferred - io;
    const amortPayment = calcAmortizingMonthlyPayment(afterDeferred, rate, amortMonths);

    expect(result.phases.map((p) => p.type)).toEqual([
      "deferred",
      "interest-only",
      "amortizing",
    ]);
    expect(result.phases[0].months).toBe(deferred);
    expect(result.phases[1].months).toBe(io);
    expect(result.phases[2].months).toBe(amortMonths);
    expect(result.month1Payment).toBe(0);
    expect(result.stabilizedPayment).toBeCloseTo(amortPayment, 4);
    expect(result.maxMonthlyPayment).toBeCloseTo(Math.max(ioPayment, amortPayment), 4);
  });
});

describe("calcMultiPhaseLoan — edge cases", () => {
  it("clamps deferred + IO longer than total term", () => {
    const result = calcMultiPhaseLoan({
      principal: 100_000,
      annualInterestRate: 6,
      termMonths: 24,
      deferredMonths: 18,
      interestOnlyMonths: 18,
    });

    expect(result.totalTermMonths).toBe(24);
    const totalPhaseMonths = result.phases.reduce((s, p) => s + p.months, 0);
    expect(totalPhaseMonths).toBe(24);
    expect(result.phases[0].type).toBe("deferred");
    expect(result.phases[0].months).toBe(18);
    expect(result.phases[1].type).toBe("interest-only");
    expect(result.phases[1].months).toBe(6);
    expect(result.phases.some((p) => p.type === "amortizing")).toBe(false);
  });

  it("clamps interest-only longer than remaining term after deferral", () => {
    const result = calcMultiPhaseLoan({
      principal: 100_000,
      annualInterestRate: 6,
      termMonths: 36,
      deferredMonths: 12,
      interestOnlyMonths: 48,
    });

    expect(result.phases[0].months).toBe(12);
    expect(result.phases[1].months).toBe(24);
    expect(result.phases).toHaveLength(2);
    expect(result.totalTermMonths).toBe(36);
  });

  it("handles zero principal", () => {
    const result = calcMultiPhaseLoan({
      principal: 0,
      annualInterestRate: 7.5,
      termMonths: 120,
      deferredMonths: 6,
      interestOnlyMonths: 12,
    });

    expect(result.month1Payment).toBe(0);
    expect(result.stabilizedPayment).toBe(0);
    expect(result.annualDebtService).toBe(0);
  });

  it("handles zero interest rate through all phases", () => {
    const result = calcMultiPhaseLoan({
      principal: 120_000,
      annualInterestRate: 0,
      termMonths: 60,
      deferredMonths: 6,
      interestOnlyMonths: 6,
    });

    expect(result.phases[0].monthlyPayment).toBe(0);
    expect(result.phases[1].monthlyPayment).toBe(0);
    expect(result.stabilizedPayment).toBe(2_500);
    expect(result.phases[2].months).toBe(48);
  });
});
