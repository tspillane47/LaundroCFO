import { describe, expect, it } from "vitest";
import {
  applyLoanDebtServiceToTtm,
  annualizeTtmTotal,
  calcTtmMetrics,
  elapsedMonthlyRecords,
  isMonthFullyElapsed,
  ttmWindowRecords,
  type CalculatedMonthly,
} from "@/lib/financials";
import { buildValuationHistorySeries } from "@/lib/valuationHistory";
import type { StoreValuationContext } from "@/lib/getStoreValuation";

const AS_OF_SEP_3_2026 = new Date(2026, 8, 3);
const AS_OF_OCT_1_2026 = new Date(2026, 9, 1);

function makeRecord(
  year: number,
  month: number,
  revenue: number,
  ebitda: number,
  extras: Partial<CalculatedMonthly> = {}
): CalculatedMonthly {
  return {
    id: `${year}-${month}`,
    store_id: "store-1",
    year,
    month,
    revenue,
    ebitda,
    self_service_revenue: 0,
    wdf_revenue: 0,
    commercial_revenue: 0,
    vending_revenue: 0,
    other_revenue: 0,
    utilities: 0,
    rent: 0,
    payroll: 0,
    repairs_maintenance: 0,
    insurance_expense: 0,
    supplies: 0,
    marketing: 0,
    professional_fees: 0,
    software_subscriptions: 0,
    cc_processing_fees: 0,
    bank_charges: 0,
    other_expenses: 0,
    debt_service: 0,
    data_source: "manual",
    manually_overridden_at: null,
    totalExpenses: revenue - ebitda,
    grossProfit: revenue,
    ebitdaMargin: revenue > 0 ? (ebitda / revenue) * 100 : 0,
    noi: ebitda,
    netCashFlow: ebitda,
    ...extras,
  };
}

describe("isMonthFullyElapsed", () => {
  it("treats the in-progress calendar month as incomplete", () => {
    expect(isMonthFullyElapsed(2026, 9, AS_OF_SEP_3_2026)).toBe(false);
    expect(isMonthFullyElapsed(2026, 9, new Date(2026, 8, 30))).toBe(false);
  });

  it("treats a month as elapsed on the first day of the following month", () => {
    expect(isMonthFullyElapsed(2026, 9, AS_OF_OCT_1_2026)).toBe(true);
    expect(isMonthFullyElapsed(2026, 8, AS_OF_SEP_3_2026)).toBe(true);
  });
});

describe("calcTtmMetrics incomplete current month", () => {
  it("uses only 4 complete months when a 5th in-progress current-month row exists", () => {
    const complete = [
      makeRecord(2026, 8, 13_000, 4_000),
      makeRecord(2026, 7, 13_000, 4_000),
      makeRecord(2026, 6, 13_000, 4_000),
      makeRecord(2026, 5, 13_000, 4_000),
    ];
    const partialCurrent = makeRecord(2026, 9, 500, 100);
    const allRows = [partialCurrent, ...complete];

    const withPartialIncludedManually = calcTtmMetrics(allRows, AS_OF_OCT_1_2026);
    const excludedManually = calcTtmMetrics(complete, AS_OF_SEP_3_2026);
    const fixed = calcTtmMetrics(allRows, AS_OF_SEP_3_2026);

    expect(allRows).toHaveLength(5);
    expect(elapsedMonthlyRecords(allRows, AS_OF_SEP_3_2026)).toHaveLength(4);
    expect(fixed.monthsUsed).toBe(4);
    expect(fixed.ttmRevenue).toBe(52_000);
    expect(fixed.ttmEbitda).toBe(16_000);
    expect(fixed.ttmRevenue).toBe(excludedManually.ttmRevenue);
    expect(fixed.ttmEbitda).toBe(excludedManually.ttmEbitda);
    expect(fixed.monthsUsed).toBe(excludedManually.monthsUsed);
    expect(withPartialIncludedManually.monthsUsed).toBe(5);
    expect(withPartialIncludedManually.ttmRevenue).toBe(52_500);
  });

  it("does not drop the in-progress month from the source P&L rows", () => {
    const rows = [
      makeRecord(2026, 9, 500, 100),
      makeRecord(2026, 8, 13_000, 4_000),
    ];
    calcTtmMetrics(rows, AS_OF_SEP_3_2026);
    expect(rows).toHaveLength(2);
    expect(rows[0].year).toBe(2026);
    expect(rows[0].month).toBe(9);
    expect(rows[0].revenue).toBe(500);
  });

  it("includes September once that month has fully elapsed", () => {
    const rows = [
      makeRecord(2026, 9, 500, 100),
      makeRecord(2026, 8, 13_000, 4_000),
    ];
    const afterMonthEnd = calcTtmMetrics(rows, AS_OF_OCT_1_2026);
    expect(afterMonthEnd.monthsUsed).toBe(2);
    expect(afterMonthEnd.ttmRevenue).toBe(13_500);
  });
});

describe("King Street / Waterbury investigation fixtures", () => {
  const kingStreet = [
    makeRecord(2026, 9, 623.71, 607.35),
    makeRecord(2026, 8, 6_850.83, -3_315.93),
    makeRecord(2026, 7, 9_119.67, 1_114.27),
    makeRecord(2026, 6, 9_467.01, 4_626.96),
  ];

  it("matches the investigation's manually-excluded TTM for King Street Laundry", () => {
    const incorrect = calcTtmMetrics(kingStreet, AS_OF_OCT_1_2026);
    const excluded = calcTtmMetrics(kingStreet.slice(1), AS_OF_SEP_3_2026);
    const fixed = calcTtmMetrics(kingStreet, AS_OF_SEP_3_2026);

    expect(incorrect.monthsUsed).toBe(4);
    expect(incorrect.ttmRevenue).toBeCloseTo(26_061.22, 2);
    expect(incorrect.ttmEbitda).toBeCloseTo(3_032.65, 2);

    expect(excluded.monthsUsed).toBe(3);
    expect(excluded.ttmRevenue).toBeCloseTo(25_437.51, 2);
    expect(excluded.ttmEbitda).toBeCloseTo(2_425.30, 2);

    expect(fixed.monthsUsed).toBe(excluded.monthsUsed);
    expect(fixed.ttmRevenue).toBeCloseTo(excluded.ttmRevenue, 2);
    expect(fixed.ttmEbitda).toBeCloseTo(excluded.ttmEbitda, 2);
    expect(annualizeTtmTotal(fixed.ttmEbitda, fixed.monthsUsed)).toBeCloseTo(9_701.2, 2);
  });

  it("matches the investigation's manually-excluded TTM and DSCR for Waterbury Laundromat", () => {
    const completeAvgRevenue = 13_543.06;
    const completeAvgEbitda = 23_348.16 / 4;
    const waterbury = [
      makeRecord(2026, 9, 1_526.42, 986.04),
      makeRecord(2026, 8, completeAvgRevenue, completeAvgEbitda),
      makeRecord(2026, 7, completeAvgRevenue, completeAvgEbitda),
      makeRecord(2026, 6, completeAvgRevenue, completeAvgEbitda),
      makeRecord(2026, 5, completeAvgRevenue, completeAvgEbitda),
    ];
    const annualDebt = 70_044.48 / 3.861855424556388;

    const incorrect = applyLoanDebtServiceToTtm(calcTtmMetrics(waterbury, AS_OF_OCT_1_2026), annualDebt);
    const excluded = applyLoanDebtServiceToTtm(
      calcTtmMetrics(waterbury.slice(1), AS_OF_SEP_3_2026),
      annualDebt
    );
    const fixed = applyLoanDebtServiceToTtm(calcTtmMetrics(waterbury, AS_OF_SEP_3_2026), annualDebt);

    expect(incorrect.monthsUsed).toBe(5);
    expect(annualizeTtmTotal(incorrect.ttmEbitda, incorrect.monthsUsed)).toBeCloseTo(58_402.08, 2);
    expect(incorrect.dscr).toBeCloseTo(3.22, 2);

    expect(excluded.monthsUsed).toBe(4);
    expect(annualizeTtmTotal(excluded.ttmEbitda, excluded.monthsUsed)).toBeCloseTo(70_044.48, 2);
    expect(excluded.dscr).toBeCloseTo(3.86, 2);

    expect(fixed.monthsUsed).toBe(4);
    expect(fixed.ttmRevenue).toBeCloseTo(excluded.ttmRevenue, 2);
    expect(fixed.ttmEbitda).toBeCloseTo(excluded.ttmEbitda, 2);
    expect(fixed.dscr).toBeCloseTo(excluded.dscr ?? 0, 6);
    expect(annualizeTtmTotal(fixed.ttmEbitda, fixed.monthsUsed)).toBeCloseTo(70_044.48, 2);
  });
});

describe("TTM window helpers used by valuation / DSCR", () => {
  it("ttmWindowRecords drops the current month and keeps the prior 12 elapsed months", () => {
    const rows = [
      makeRecord(2026, 9, 1, 1),
      ...Array.from({ length: 14 }, (_, i) => {
        const date = new Date(2026, 7 - i, 1);
        return makeRecord(date.getFullYear(), date.getMonth() + 1, 100, 10);
      }),
    ];
    const window = ttmWindowRecords(rows, AS_OF_SEP_3_2026);
    expect(window).toHaveLength(12);
    expect(window[0].year).toBe(2026);
    expect(window[0].month).toBe(8);
    expect(window.some((r) => r.year === 2026 && r.month === 9)).toBe(false);
  });

  it("DSCR annualizes from elapsed months only", () => {
    const records = [
      makeRecord(2026, 9, 500, 100),
      makeRecord(2026, 8, 10_000, 4_000),
      makeRecord(2026, 7, 10_000, 4_000),
      makeRecord(2026, 6, 10_000, 4_000),
      makeRecord(2026, 5, 10_000, 4_000),
    ];
    const ttm = applyLoanDebtServiceToTtm(calcTtmMetrics(records, AS_OF_SEP_3_2026), 12_000);
    expect(ttm.monthsUsed).toBe(4);
    expect(ttm.ttmEbitda).toBe(16_000);
    expect(ttm.dscr).toBeCloseTo(annualizeTtmTotal(16_000, 4) / 12_000, 6);
  });

  it("valuation history does not emit a point for the in-progress month", () => {
    const ctx: StoreValuationContext = {
      store: {
        square_footage: 3000,
        occupancy_type: "leased",
        market_density: "suburban",
        store_condition: "good",
        revenue_trend: "stable",
        competition_level: "normal",
        self_service_pct: 100,
        wdf_pct: 0,
        commercial_pct: 0,
        pickup_delivery_pct: 0,
      },
      equipment: [],
      lease: { lease_end_date: "2035-01-01" },
      leaseOptions: [],
      realEstate: null,
    };
    const series = buildValuationHistorySeries(
      ctx,
      [
        makeRecord(2026, 6, 10_000, 3_000),
        makeRecord(2026, 7, 10_000, 3_000),
        makeRecord(2026, 8, 10_000, 3_000),
        makeRecord(2026, 9, 400, 50),
      ],
      AS_OF_SEP_3_2026
    );
    expect(series).toHaveLength(3);
    expect(series[series.length - 1]).toMatchObject({ year: 2026, month: 8 });
  });
});
