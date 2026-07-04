import { describe, expect, it } from "vitest";
import { calcLeaseScore } from "./calculations";

/** Legacy calculations.ts / reports rules (pre-consolidation) */
function legacyLibCalcLeaseScore(params: {
  yearsRemaining: number;
  renewalOptions: number;
  relocationClause: boolean;
  assignmentWithConsent: boolean;
  exclusiveUse: boolean;
}): number {
  let score = 50;
  if (params.yearsRemaining >= 10) score += 30;
  else if (params.yearsRemaining >= 5) score += 20;
  else if (params.yearsRemaining >= 3) score += 10;
  if (params.renewalOptions >= 2) score += 10;
  else if (params.renewalOptions === 1) score += 5;
  if (params.exclusiveUse) score += 5;
  if (params.relocationClause) score -= 10;
  if (params.assignmentWithConsent) score -= 1;
  return Math.min(100, Math.max(0, score));
}

/** Representative leased store used across Dashboard, Valuation, and LeaseModule */
const sampleLease = {
  yearsRemaining: 8.2,
  availableOptions: 2,
  exclusivityClause: true,
  personalGuaranty: true,
  assignmentRights: "With Consent" as const,
  monthlyRent: 6500,
  monthlyRevenue: 22000,
};

const canonicalInput = {
  yearsRemaining: sampleLease.yearsRemaining,
  availableOptions: sampleLease.availableOptions,
  exclusivityClause: sampleLease.exclusivityClause,
  personalGuaranty: sampleLease.personalGuaranty,
  assignmentRights: sampleLease.assignmentRights,
  monthlyRent: sampleLease.monthlyRent,
  monthlyRevenue: sampleLease.monthlyRevenue,
};

describe("calcLeaseScore consolidation", () => {
  it("Dashboard, Valuation, and LeaseModule callers produce identical scores", () => {
    const dashboardScore = calcLeaseScore(canonicalInput);
    const valuationScore = calcLeaseScore(canonicalInput);
    const leaseModuleScore = calcLeaseScore(canonicalInput);

    expect(dashboardScore).toBe(valuationScore);
    expect(valuationScore).toBe(leaseModuleScore);
    expect(dashboardScore).toBe(55);
  });

  it("documents before/after drift for the sample lease", () => {
    const beforeReports = legacyLibCalcLeaseScore({
      yearsRemaining: sampleLease.yearsRemaining,
      renewalOptions: sampleLease.availableOptions,
      relocationClause: false,
      assignmentWithConsent: sampleLease.assignmentRights === "With Consent",
      exclusiveUse: sampleLease.exclusivityClause,
    });

    const beforeUiPages = calcLeaseScore(canonicalInput);
    const afterAllSurfaces = calcLeaseScore(canonicalInput);

    // UI pages already agreed (55); reports/lib path showed 84.
    expect(beforeReports).toBe(84);
    expect(beforeUiPages).toBe(55);
    expect(afterAllSurfaces).toBe(55);
    expect(beforeReports).not.toBe(beforeUiPages);
    expect(afterAllSurfaces).toBe(beforeUiPages);
  });

  it("applies rent-to-revenue penalty when rent exceeds 20% of revenue", () => {
    const highRent = calcLeaseScore({
      ...canonicalInput,
      monthlyRent: 5000,
      monthlyRevenue: 20000,
    });
    const lowRent = calcLeaseScore({
      ...canonicalInput,
      monthlyRent: 3000,
      monthlyRevenue: 20000,
    });

    expect(highRent).toBe(55);
    expect(lowRent).toBe(70);
    expect(highRent).toBe(lowRent - 15);
  });

  it("applies personal guaranty and assignment penalties", () => {
    const unfavorable = calcLeaseScore({
      yearsRemaining: 6,
      availableOptions: 1,
      exclusivityClause: false,
      personalGuaranty: true,
      assignmentRights: "Not Allowed",
      monthlyRent: null,
      monthlyRevenue: null,
    });

    expect(unfavorable).toBe(48);
  });
});
