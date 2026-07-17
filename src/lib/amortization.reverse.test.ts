import { describe, expect, it } from "vitest";
import { calcDSCR } from "@/lib/calculations";
import {
  calcMultiPhaseLoan,
  calcPrincipalFromTargetStabilizedPayment,
  calcReverseSolveLoan,
  DEFAULT_MAX_LTV_PERCENT,
} from "@/lib/amortization";

const ANNUAL_EBITDA = 600_000;
const TARGET_DSCR = 1.25;
const EXISTING_DEBT = 0;

function roundTripDscr(
  principal: number,
  annualInterestRate: number,
  termMonths: number,
  options: {
    deferredMonths?: number;
    interestOnlyMonths?: number;
    existingAnnualDebtService?: number;
    isRefinance?: boolean;
    annualEbitda?: number;
  } = {}
): number | null {
  const forward = calcMultiPhaseLoan({
    principal,
    annualInterestRate,
    termMonths,
    deferredMonths: options.deferredMonths ?? 0,
    interestOnlyMonths: options.interestOnlyMonths ?? 0,
  });
  const existing = options.isRefinance ? 0 : (options.existingAnnualDebtService ?? EXISTING_DEBT);
  const totalDebtService = existing + forward.annualDebtService;
  return calcDSCR(options.annualEbitda ?? ANNUAL_EBITDA, totalDebtService);
}

function reverseSolveAndRoundTrip(
  overrides: Partial<Parameters<typeof calcReverseSolveLoan>[0]> & {
    annualInterestRate: number;
    termMonths: number;
    deferredMonths?: number;
    interestOnlyMonths?: number;
  }
) {
  const result = calcReverseSolveLoan({
    targetDscr: TARGET_DSCR,
    annualEbitda: ANNUAL_EBITDA,
    existingAnnualDebtService: EXISTING_DEBT,
    businessValue: 10_000_000,
    maxLtvPercent: DEFAULT_MAX_LTV_PERCENT,
    ...overrides,
  });

  const dscr = roundTripDscr(result.maxLoanAmount, overrides.annualInterestRate, overrides.termMonths, {
    deferredMonths: overrides.deferredMonths,
    interestOnlyMonths: overrides.interestOnlyMonths,
    existingAnnualDebtService: overrides.existingAnnualDebtService,
    isRefinance: overrides.isRefinance,
    annualEbitda: overrides.annualEbitda,
  });

  return { result, dscr };
}

describe("calcPrincipalFromTargetStabilizedPayment", () => {
  it("inverts plain amortizing forward calculation", () => {
    const principal = 500_000;
    const rate = 7.5;
    const term = 120;
    const forward = calcMultiPhaseLoan({ principal, annualInterestRate: rate, termMonths: term });
    const { principal: reversed } = calcPrincipalFromTargetStabilizedPayment(
      forward.stabilizedPayment,
      rate,
      term
    );
    expect(reversed).toBeCloseTo(principal, 2);
  });

  it("inverts deferred + amortizing forward calculation", () => {
    const principal = 600_000;
    const rate = 7.0;
    const term = 120;
    const deferred = 6;
    const forward = calcMultiPhaseLoan({
      principal,
      annualInterestRate: rate,
      termMonths: term,
      deferredMonths: deferred,
    });
    const { principal: reversed } = calcPrincipalFromTargetStabilizedPayment(
      forward.stabilizedPayment,
      rate,
      term,
      deferred
    );
    expect(reversed).toBeCloseTo(principal, 2);
  });

  it("inverts interest-only + amortizing forward calculation", () => {
    const principal = 500_000;
    const rate = 7.5;
    const term = 120;
    const io = 12;
    const forward = calcMultiPhaseLoan({
      principal,
      annualInterestRate: rate,
      termMonths: term,
      interestOnlyMonths: io,
    });
    const { principal: reversed } = calcPrincipalFromTargetStabilizedPayment(
      forward.stabilizedPayment,
      rate,
      term,
      0,
      io
    );
    expect(reversed).toBeCloseTo(principal, 2);
  });

  it("inverts deferred + IO + amortizing forward calculation", () => {
    const principal = 600_000;
    const rate = 7.0;
    const term = 120;
    const deferred = 6;
    const io = 12;
    const forward = calcMultiPhaseLoan({
      principal,
      annualInterestRate: rate,
      termMonths: term,
      deferredMonths: deferred,
      interestOnlyMonths: io,
    });
    const { principal: reversed } = calcPrincipalFromTargetStabilizedPayment(
      forward.stabilizedPayment,
      rate,
      term,
      deferred,
      io
    );
    expect(reversed).toBeCloseTo(principal, 2);
  });

  it("inverts interest-only-only loan (principal = payment / r)", () => {
    const principal = 400_000;
    const rate = 7.5;
    const term = 24;
    const forward = calcMultiPhaseLoan({
      principal,
      annualInterestRate: rate,
      termMonths: term,
      interestOnlyMonths: term,
    });
    const { principal: reversed } = calcPrincipalFromTargetStabilizedPayment(
      forward.stabilizedPayment,
      rate,
      term,
      0,
      term
    );
    expect(reversed).toBeCloseTo(principal, 2);
  });

  it("flags zero-rate interest-only as unbounded", () => {
    const { principal, zeroRateUnbounded } = calcPrincipalFromTargetStabilizedPayment(
      2_000,
      0,
      60,
      0,
      60
    );
    expect(zeroRateUnbounded).toBe(true);
    expect(principal).toBe(0);
  });
});

describe("calcReverseSolveLoan — round-trip DSCR verification", () => {
  it("plain amortizing: reverse principal yields target DSCR", () => {
    const { result, dscr } = reverseSolveAndRoundTrip({
      annualInterestRate: 7.5,
      termMonths: 120,
    });
    expect(result.bindingConstraint).toBe("dscr");
    expect(result.maxLoanAmount).toBeGreaterThan(0);
    expect(dscr).toBeCloseTo(TARGET_DSCR, 2);
  });

  it("with deferred period: round-trip hits target DSCR", () => {
    const { result, dscr } = reverseSolveAndRoundTrip({
      annualInterestRate: 7.5,
      termMonths: 120,
      deferredMonths: 6,
    });
    expect(result.maxLoanAmount).toBeGreaterThan(0);
    expect(dscr).toBeCloseTo(TARGET_DSCR, 2);
  });

  it("with interest-only period: round-trip hits target DSCR", () => {
    const { result, dscr } = reverseSolveAndRoundTrip({
      annualInterestRate: 7.5,
      termMonths: 120,
      interestOnlyMonths: 12,
    });
    expect(result.maxLoanAmount).toBeGreaterThan(0);
    expect(dscr).toBeCloseTo(TARGET_DSCR, 2);
  });

  it("with deferred + interest-only: round-trip hits target DSCR", () => {
    const { result, dscr } = reverseSolveAndRoundTrip({
      annualInterestRate: 7.0,
      termMonths: 120,
      deferredMonths: 6,
      interestOnlyMonths: 12,
    });
    expect(result.maxLoanAmount).toBeGreaterThan(0);
    expect(dscr).toBeCloseTo(TARGET_DSCR, 2);
  });

  it("interest-only-only term: round-trip hits target DSCR", () => {
    const { result, dscr } = reverseSolveAndRoundTrip({
      annualInterestRate: 7.5,
      termMonths: 24,
      interestOnlyMonths: 24,
    });
    expect(result.maxLoanAmount).toBeGreaterThan(0);
    expect(dscr).toBeCloseTo(TARGET_DSCR, 2);
  });
});

describe("calcReverseSolveLoan — no room for new loan", () => {
  it("returns zero DSCR-based max when existing debt exceeds target DSCR budget", () => {
    const existingAnnualDebtService = ANNUAL_EBITDA / TARGET_DSCR + 50_000;
    const result = calcReverseSolveLoan({
      targetDscr: TARGET_DSCR,
      annualEbitda: ANNUAL_EBITDA,
      existingAnnualDebtService,
      annualInterestRate: 7.5,
      termMonths: 120,
      businessValue: 10_000_000,
    });

    expect(result.dscrAlreadyExceeded).toBe(true);
    expect(result.dscrBasedMaxLoan).toBe(0);
    expect(result.requiredNewAnnualDebtService).toBeLessThanOrEqual(0);
  });

  it("round-trip DSCR stays at or below target when no room for new debt", () => {
    const existingAnnualDebtService = ANNUAL_EBITDA / 1.1;
    const { result, dscr } = reverseSolveAndRoundTrip({
      annualInterestRate: 7.5,
      termMonths: 120,
      existingAnnualDebtService,
      annualEbitda: ANNUAL_EBITDA,
      businessValue: 10_000_000,
    });

    expect(result.dscrAlreadyExceeded).toBe(true);
    expect(result.dscrBasedMaxLoan).toBe(0);
    if (dscr != null) {
      expect(dscr).toBeLessThan(TARGET_DSCR);
    }
  });

  it("refinance excludes existing debt from DSCR budget", () => {
    const existingAnnualDebtService = ANNUAL_EBITDA / TARGET_DSCR + 50_000;
    const withoutRefi = calcReverseSolveLoan({
      targetDscr: TARGET_DSCR,
      annualEbitda: ANNUAL_EBITDA,
      existingAnnualDebtService,
      annualInterestRate: 7.5,
      termMonths: 120,
      businessValue: 10_000_000,
    });
    const withRefi = calcReverseSolveLoan({
      targetDscr: TARGET_DSCR,
      annualEbitda: ANNUAL_EBITDA,
      existingAnnualDebtService,
      isRefinance: true,
      annualInterestRate: 7.5,
      termMonths: 120,
      businessValue: 10_000_000,
    });

    expect(withoutRefi.dscrAlreadyExceeded).toBe(true);
    expect(withRefi.dscrAlreadyExceeded).toBe(false);
    expect(withRefi.dscrBasedMaxLoan).toBeGreaterThan(withoutRefi.dscrBasedMaxLoan);
  });
});

describe("calcReverseSolveLoan — binding constraint (DSCR vs LTV)", () => {
  it("DSCR is binding when collateral value is generous", () => {
    const result = calcReverseSolveLoan({
      targetDscr: TARGET_DSCR,
      annualEbitda: ANNUAL_EBITDA,
      existingAnnualDebtService: 0,
      annualInterestRate: 7.5,
      termMonths: 120,
      businessValue: 20_000_000,
      maxLtvPercent: 80,
    });

    expect(result.dscrBasedMaxLoan).toBeLessThan(result.ltvBasedMaxLoan);
    expect(result.bindingConstraint).toBe("dscr");
    expect(result.maxLoanAmount).toBe(result.dscrBasedMaxLoan);
  });

  it("LTV is binding when business value is low relative to DSCR capacity", () => {
    const result = calcReverseSolveLoan({
      targetDscr: TARGET_DSCR,
      annualEbitda: ANNUAL_EBITDA,
      existingAnnualDebtService: 0,
      annualInterestRate: 7.5,
      termMonths: 120,
      businessValue: 400_000,
      maxLtvPercent: 80,
    });

    expect(result.ltvBasedMaxLoan).toBeLessThan(result.dscrBasedMaxLoan);
    expect(result.bindingConstraint).toBe("ltv");
    expect(result.maxLoanAmount).toBe(result.ltvBasedMaxLoan);
  });

  it("owner-occupied uses combined business + real estate collateral for LTV cap", () => {
    const tenantOccupied = calcReverseSolveLoan({
      targetDscr: TARGET_DSCR,
      annualEbitda: ANNUAL_EBITDA,
      existingAnnualDebtService: 0,
      annualInterestRate: 7.5,
      termMonths: 120,
      businessValue: 500_000,
      realEstateValue: 500_000,
      isOwnerOccupied: false,
      maxLtvPercent: 80,
    });
    const ownerOccupied = calcReverseSolveLoan({
      targetDscr: TARGET_DSCR,
      annualEbitda: ANNUAL_EBITDA,
      existingAnnualDebtService: 0,
      annualInterestRate: 7.5,
      termMonths: 120,
      businessValue: 500_000,
      realEstateValue: 500_000,
      isOwnerOccupied: true,
      maxLtvPercent: 80,
    });

    expect(ownerOccupied.ltvBasedMaxLoan).toBe(tenantOccupied.ltvBasedMaxLoan * 2);
    expect(ownerOccupied.collateralValue).toBe(1_000_000);
  });

  it("LTV-bound round-trip DSCR is at or above target (headroom under DSCR cap)", () => {
    const { result, dscr } = reverseSolveAndRoundTrip({
      annualInterestRate: 7.5,
      termMonths: 120,
      businessValue: 400_000,
    });

    expect(result.bindingConstraint).toBe("ltv");
    expect(dscr).not.toBeNull();
    expect(dscr!).toBeGreaterThanOrEqual(TARGET_DSCR - 0.01);
  });
});
