import { describe, expect, it } from "vitest";
import { annualizeTtmTotal } from "@/lib/financials";
import {
  buildStoreValuationInputs,
  computeStoreValuation,
  resolveStoreFinancials,
  type StoreValuationContext,
} from "@/lib/getStoreValuation";

describe("resolveStoreFinancials", () => {
  it("annualizes partial-year EBITDA instead of using the raw sum", () => {
    const ttmEbitdaSum = 15_701.31;
    const monthsUsed = 4;
    const expectedAnnualEbitda = (ttmEbitdaSum / monthsUsed) * 12;

    const resolved = resolveStoreFinancials(
      {},
      { ttmRevenue: 100_000, ttmEbitda: ttmEbitdaSum, monthsUsed }
    );

    expect(expectedAnnualEbitda).toBeCloseTo(47_103.93, 2);
    expect(resolved.annualEbitda).toBeCloseTo(47_103.93, 2);
    expect(resolved.annualEbitda).not.toBeCloseTo(ttmEbitdaSum, 2);
  });

  it("matches the raw TTM sum when a full 12 months of data exist", () => {
    const ttmEbitda = 156_000;
    const resolved = resolveStoreFinancials(
      {},
      { ttmRevenue: 600_000, ttmEbitda, monthsUsed: 12 }
    );

    expect(resolved.annualEbitda).toBe(156_000);
    expect(resolved.annualEbitda).toBe(annualizeTtmTotal(ttmEbitda, 12));
  });

  it("returns zero annualEbitda when no TTM data is available", () => {
    expect(resolveStoreFinancials({}).annualEbitda).toBe(0);
    expect(resolveStoreFinancials({}, { ttmRevenue: 0, ttmEbitda: 0, monthsUsed: 0 }).annualEbitda).toBe(
      0
    );
  });
});

function ttmContext(storeCondition: string): StoreValuationContext {
  return {
    store: {
      occupancy_type: "leased",
      store_condition: storeCondition,
      square_footage: 2500,
    },
    equipment: [],
    lease: null,
    leaseOptions: [],
    realEstate: null,
    resolvedFinancials: {
      monthlyRevenue: 1000,
      monthlyExpenses: 400,
      annualEbitda: 7200,
      ttmMonthsUsed: 12,
      source: "ttm",
    },
  };
}

describe("buildStoreValuationInputs store_condition", () => {
  it("maps legacy average to fair so Dashboard matches the Valuation page", () => {
    expect(buildStoreValuationInputs(ttmContext("average")).storeCondition).toBe("fair");
  });

  it("passes canonical values through unchanged", () => {
    expect(buildStoreValuationInputs(ttmContext("good")).storeCondition).toBe("good");
    expect(buildStoreValuationInputs(ttmContext("excellent")).storeCondition).toBe("excellent");
  });

  it("applies the fair condition adjustment for average", () => {
    const average = computeStoreValuation(ttmContext("average"));
    const fair = computeStoreValuation(ttmContext("fair"));
    const good = computeStoreValuation(ttmContext("good"));

    expect(average.adjustments.find((a) => a.label === "Store Condition")?.value).toBe(-0.1);
    expect(fair.finalMultiple).toBe(average.finalMultiple);
    expect(good.finalMultiple).toBeCloseTo(average.finalMultiple + 0.2, 5);
  });
});
