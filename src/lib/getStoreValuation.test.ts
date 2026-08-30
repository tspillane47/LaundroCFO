import { describe, expect, it } from "vitest";
import { annualizeTtmTotal } from "@/lib/financials";
import {
  applyOwnerOccupiedMarketRentToEbitda,
  buildStoreValuationInputs,
  canShowStoreValuation,
  computeStoreValuation,
  hasRequiredOwnerOccupiedMarketRent,
  resolveOwnerOccupiedMarketRentMonthly,
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

function ownerOccupiedCtx(
  realEstate: Record<string, unknown> | null,
  resolvedOverrides: Partial<StoreValuationContext["resolvedFinancials"]> = {}
): StoreValuationContext {
  return {
    store: {
      occupancy_type: "owner_occupied",
      store_condition: "good",
      square_footage: 1500,
      market_density: "rural",
      revenue_trend: "stable",
      competition_level: "protected",
    },
    equipment: [],
    lease: null,
    leaseOptions: [],
    realEstate,
    resolvedFinancials: {
      monthlyRevenue: 13320,
      monthlyExpenses: 7647,
      monthlyRent: 0,
      annualEbitda: 68_079,
      ttmMonthsUsed: 4,
      source: "ttm",
      ...resolvedOverrides,
    },
  };
}

describe("owner-occupied market rent imputation", () => {
  it("treats 0 and missing market_rent_estimate as absent", () => {
    expect(resolveOwnerOccupiedMarketRentMonthly({ market_rent_estimate: 0 })).toBeNull();
    expect(resolveOwnerOccupiedMarketRentMonthly({ market_rent_estimate: null })).toBeNull();
    expect(resolveOwnerOccupiedMarketRentMonthly(null)).toBeNull();
    expect(hasRequiredOwnerOccupiedMarketRent({ occupancy_type: "owner_occupied" }, { market_rent_estimate: 0 })).toBe(
      false
    );
    expect(hasRequiredOwnerOccupiedMarketRent({ occupancy_type: "leased" }, null)).toBe(true);
  });

  it("does not show a valuation when owner-occupied rent is missing", () => {
    const ctx = ownerOccupiedCtx({ estimated_value: 370_000, market_rent_estimate: 0 });
    expect(canShowStoreValuation(ctx.resolvedFinancials, ctx.store, ctx.realEstate)).toBe(false);
    expect(buildStoreValuationInputs(ctx).ebitda).toBe(0);
    expect(buildStoreValuationInputs(ctx).realEstateValue).toBeUndefined();
  });

  it("deducts market rent from valuation EBITDA without changing book financials", () => {
    const ctx = ownerOccupiedCtx({ estimated_value: 370_000, market_rent_estimate: 1500 });
    const inputs = buildStoreValuationInputs(ctx);

    expect(ctx.resolvedFinancials?.annualEbitda).toBe(68_079);
    expect(inputs.ebitda).toBe(68_079 - 1500 * 12);
    expect(canShowStoreValuation(ctx.resolvedFinancials, ctx.store, ctx.realEstate)).toBe(true);
  });

  it("adds back book rent so related-party rent is not stacked on market rent", () => {
    const ctx = ownerOccupiedCtx(
      { estimated_value: 370_000, market_rent_estimate: 1500 },
      { monthlyRent: 3000, annualEbitda: 32_079 }
    );
    expect(buildStoreValuationInputs(ctx).ebitda).toBe(32_079 + 3000 * 12 - 1500 * 12);
  });

  it("applies the adjustment after an ebitda override (history / scenario path)", () => {
    const ctx = ownerOccupiedCtx({ estimated_value: 370_000, market_rent_estimate: 1500 });
    const inputs = buildStoreValuationInputs(ctx, { ebitda: 50_000 });
    expect(inputs.ebitda).toBe(50_000 - 1500 * 12);
  });

  it("keeps the +0.25x Real Estate Owned bonus unchanged", () => {
    const ctx = ownerOccupiedCtx({ estimated_value: 370_000, market_rent_estimate: 1500 });
    const result = computeStoreValuation(ctx);
    expect(result.adjustments.find((a) => a.label === "Real Estate Owned")?.value).toBe(0.25);
  });

  it("does not change leased-store EBITDA", () => {
    const inputs = buildStoreValuationInputs(ttmContext("good"));
    expect(inputs.ebitda).toBe(7200);
    expect(inputs.occupancyType).toBe("leased");
  });
});

describe("applyOwnerOccupiedMarketRentToEbitda", () => {
  it("returns the book figure for leased stores", () => {
    expect(
      applyOwnerOccupiedMarketRentToEbitda(68_079, {
        isOwnerOccupied: false,
        marketRentMonthly: 1500,
        bookRentMonthly: 0,
      })
    ).toBe(68_079);
  });
});
