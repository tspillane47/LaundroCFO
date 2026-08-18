import { describe, expect, it } from "vitest";
import type { CalculatedMonthly } from "@/lib/financials";
import type { StoreValuationContext } from "@/lib/getStoreValuation";
import {
  MIN_CHART_MONTHS,
  buildRevenueEbitdaChartData,
  buildValuationHistorySeries,
  computeValuationDeltas,
  filterValuationHistoryByPeriod,
  hasEnoughChartHistory,
} from "@/lib/valuationHistory";

function makeRecord(
  year: number,
  month: number,
  revenue: number,
  ebitda: number
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
  };
}

const minimalCtx: StoreValuationContext = {
  store: {
    square_footage: 3000,
    occupancy_type: "owner_occupied",
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
  lease: null,
  leaseOptions: [],
  realEstate: { estimated_value: 500_000 },
};

describe("valuationHistory", () => {
  it("requires at least MIN_CHART_MONTHS records for chart history", () => {
    expect(MIN_CHART_MONTHS).toBe(2);
    expect(hasEnoughChartHistory([makeRecord(2025, 1, 10_000, 3_000)])).toBe(false);
    expect(
      hasEnoughChartHistory([
        makeRecord(2025, 1, 10_000, 3_000),
        makeRecord(2025, 2, 11_000, 3_200),
      ])
    ).toBe(true);
  });

  it("builds revenue/ebitda chart data from real monthly rows", () => {
    const chart = buildRevenueEbitdaChartData([
      makeRecord(2025, 1, 10_000, 3_000),
      makeRecord(2025, 2, 12_000, 3_500),
    ]);

    expect(chart).toHaveLength(2);
    expect(chart[0].revenue).toBe(10_000);
    expect(chart[1].ebitda).toBe(3_500);
  });

  it("builds a rising valuation series when EBITDA improves", () => {
    const series = buildValuationHistorySeries(minimalCtx, [
      makeRecord(2025, 1, 10_000, 2_000),
      makeRecord(2025, 2, 10_000, 2_500),
      makeRecord(2025, 3, 10_000, 3_000),
    ]);

    expect(series).toHaveLength(3);
    expect(series[2].value).toBeGreaterThan(series[0].value);
  });

  it("computes month-over-month change from the last two real points", () => {
    const series = buildValuationHistorySeries(minimalCtx, [
      makeRecord(2025, 1, 10_000, 2_000),
      makeRecord(2025, 2, 10_000, 2_500),
    ]);

    const { monthlyChange, yearChangePct } = computeValuationDeltas(series);
    expect(monthlyChange).not.toBeNull();
    expect(typeof monthlyChange).toBe("number");
    expect(yearChangePct).toBeNull();
  });

  it("filters history by period using monthly granularity", () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      label: `M${i + 1}`,
      value: 100_000 + i * 1_000,
      year: 2025,
      month: i + 1,
    }));

    expect(filterValuationHistoryByPeriod(series, "30d")).toHaveLength(2);
    expect(filterValuationHistoryByPeriod(series, "90d")).toHaveLength(3);
    expect(filterValuationHistoryByPeriod(series, "1y")).toHaveLength(6);
    expect(filterValuationHistoryByPeriod(series, "all")).toHaveLength(6);
  });
});
