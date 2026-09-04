import {
  annualizeTtmTotal,
  calcTtmMetrics,
  elapsedMonthlyRecords,
  monthChartLabel,
  sortRecordsAsc,
  type CalculatedMonthly,
} from "@/lib/financials";
import {
  computeStoreValuation,
  type StoreValuationContext,
} from "@/lib/getStoreValuation";
import { buildTtmChartData } from "@/lib/reportFinancials";

/** Minimum monthly_financials rows required to plot a meaningful chart or MoM delta. */
export const MIN_CHART_MONTHS = 2;

export type ValuationHistoryPoint = {
  label: string;
  value: number;
  year: number;
  month: number;
};

export type HistoryPeriod = "30d" | "90d" | "1y" | "all";

export type RevenueEbitdaChartPoint = {
  month: string;
  revenue: number;
  ebitda: number;
};

const PERIOD_MONTH_LIMITS: Record<HistoryPeriod, number | null> = {
  "30d": 2,
  "90d": 3,
  "1y": 12,
  all: null,
};

function calendarMonthsAgo(
  year: number,
  month: number,
  monthsBack: number
): { year: number; month: number } {
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() - monthsBack);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function hasEnoughChartHistory(records: CalculatedMonthly[], asOf?: Date): boolean {
  return elapsedMonthlyRecords(records, asOf).length >= MIN_CHART_MONTHS;
}

export function buildRevenueEbitdaChartData(
  records: CalculatedMonthly[]
): RevenueEbitdaChartPoint[] {
  return buildTtmChartData(records).map(({ label, revenue, ebitda }) => ({
    month: label,
    revenue,
    ebitda,
  }));
}

/**
 * Rolling TTM valuation at each month-end using monthly_financials.
 * Non-financial inputs (equipment, lease, etc.) reflect the current store context.
 */
export function buildValuationHistorySeries(
  ctx: StoreValuationContext,
  records: CalculatedMonthly[],
  asOf: Date = new Date()
): ValuationHistoryPoint[] {
  const sorted = sortRecordsAsc(elapsedMonthlyRecords(records, asOf));
  const points: ValuationHistoryPoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = Math.max(0, i - 11);
    const window = sorted.slice(windowStart, i + 1);
    const ttm = calcTtmMetrics(window);
    if (ttm.monthsUsed === 0 || ttm.ttmRevenue <= 0) continue;

    const annualEbitda = annualizeTtmTotal(ttm.ttmEbitda, ttm.monthsUsed);
    const monthlyRevenue = ttm.ttmRevenue / ttm.monthsUsed;
    const result = computeStoreValuation(ctx, { ebitda: annualEbitda, monthlyRevenue });
    const record = sorted[i];

    points.push({
      label: monthChartLabel(record.year, record.month),
      value: Math.round(result.businessValue),
      year: record.year,
      month: record.month,
    });
  }

  return points;
}

export function filterValuationHistoryByPeriod(
  series: ValuationHistoryPoint[],
  period: HistoryPeriod
): ValuationHistoryPoint[] {
  const limit = PERIOD_MONTH_LIMITS[period];
  if (limit == null) return series;
  return series.slice(-limit);
}

export function computeValuationDeltas(series: ValuationHistoryPoint[]): {
  monthlyChange: number | null;
  yearChangePct: number | null;
} {
  if (series.length < MIN_CHART_MONTHS) {
    return { monthlyChange: null, yearChangePct: null };
  }

  const latest = series[series.length - 1];
  const prior = series[series.length - 2];
  const monthlyChange = latest.value - prior.value;

  const target = calendarMonthsAgo(latest.year, latest.month, 12);
  const yearAgo = series.find((p) => p.year === target.year && p.month === target.month);
  const yearChangePct =
    yearAgo && yearAgo.value > 0
      ? ((latest.value - yearAgo.value) / yearAgo.value) * 100
      : null;

  return { monthlyChange, yearChangePct };
}

export const INSUFFICIENT_HISTORY_MESSAGE =
  "Not enough history yet — check back as data accumulates.";
