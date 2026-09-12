/** Shared scheduled-vs-actual variance math. Debt page uses 5%; rent uses 10% plus a missing-actual rule. */

export const DEBT_SERVICE_VARIANCE_WARN_PCT = 5;
export const RENT_VARIANCE_WARN_PCT = 10;

export function money2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function variancePct(variance: number, scheduled: number): number {
  if (scheduled === 0) return variance === 0 ? 0 : 100;
  return Math.abs(variance / scheduled) * 100;
}

export function exceedsVarianceThreshold(
  variance: number,
  scheduled: number,
  thresholdPct: number
): boolean {
  return variancePct(variance, scheduled) > thresholdPct;
}

export type ScheduledVsActual = {
  scheduled: number;
  actual: number;
  variance: number;
  variancePct: number;
  shouldWarn: boolean;
};

/**
 * Rent: scheduled = leases.monthly_rent, actual = posted rent-category links for the month.
 * Warn when a real lease amount exists and posted rent is $0, or they differ by more than 10%.
 */
export function analyzeRentScheduledVsActual(
  scheduledLeaseRent: number,
  actualPostedRent: number
): ScheduledVsActual {
  const scheduled = money2(scheduledLeaseRent);
  const actual = money2(actualPostedRent);
  const variance = money2(actual - scheduled);
  const pct = variancePct(variance, scheduled);
  const shouldWarn = scheduled > 0 && (actual <= 0 || pct > RENT_VARIANCE_WARN_PCT);
  return {
    scheduled,
    actual,
    variance,
    variancePct: pct,
    shouldWarn,
  };
}
