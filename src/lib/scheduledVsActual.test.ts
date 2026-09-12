import { describe, expect, it } from "vitest";
import {
  DEBT_SERVICE_VARIANCE_WARN_PCT,
  RENT_VARIANCE_WARN_PCT,
  analyzeRentScheduledVsActual,
  exceedsVarianceThreshold,
  variancePct,
} from "@/lib/scheduledVsActual";

describe("variancePct (debt page formula)", () => {
  it("returns 0 when both sides are 0", () => {
    expect(variancePct(0, 0)).toBe(0);
  });

  it("returns 100 when scheduled is 0 and actual differs", () => {
    expect(variancePct(100, 0)).toBe(100);
  });

  it("matches the debt-page 5% threshold around scheduled payments", () => {
    expect(variancePct(50, 1000)).toBe(5);
    expect(exceedsVarianceThreshold(50, 1000, DEBT_SERVICE_VARIANCE_WARN_PCT)).toBe(false);
    expect(exceedsVarianceThreshold(51, 1000, DEBT_SERVICE_VARIANCE_WARN_PCT)).toBe(true);
  });
});

describe("analyzeRentScheduledVsActual", () => {
  it("flags 7 Cool Road: lease $5,600 vs posted rent $0", () => {
    const result = analyzeRentScheduledVsActual(5600, 0);
    expect(result.scheduled).toBe(5600);
    expect(result.actual).toBe(0);
    expect(result.variance).toBe(-5600);
    expect(result.variancePct).toBe(100);
    expect(result.shouldWarn).toBe(true);
  });

  it("does not warn when lease and posted rent match", () => {
    const result = analyzeRentScheduledVsActual(5600, 5600);
    expect(result.shouldWarn).toBe(false);
    expect(result.variancePct).toBe(0);
  });

  it("warns when posted rent differs from the lease by more than 10%", () => {
    const within = analyzeRentScheduledVsActual(5600, 5100);
    expect(within.variancePct).toBeCloseTo(8.93, 1);
    expect(within.shouldWarn).toBe(false);

    const over = analyzeRentScheduledVsActual(5600, 5000);
    expect(over.variancePct).toBeCloseTo(10.71, 1);
    expect(over.variancePct).toBeGreaterThan(RENT_VARIANCE_WARN_PCT);
    expect(over.shouldWarn).toBe(true);
  });

  it("does not warn when no lease rent is on file", () => {
    expect(analyzeRentScheduledVsActual(0, 0).shouldWarn).toBe(false);
    expect(analyzeRentScheduledVsActual(0, 1200).shouldWarn).toBe(false);
  });
});
