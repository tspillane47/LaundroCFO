import { describe, expect, it } from "vitest";
import { annualizeTtmTotal } from "@/lib/financials";
import { resolveStoreFinancials } from "@/lib/getStoreValuation";

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
