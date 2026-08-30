import { describe, expect, it } from "vitest";
import { computeStoreDscr } from "@/lib/dscr";
import { computeStoreValuation, resolveStoreFinancials } from "@/lib/getStoreValuation";
import { generateStoreFeed } from "@/lib/intelligence";
import {
  buildDefaultScenarioInputs,
  calcYearsRemaining,
  computeAllInteractiveScenarios,
} from "@/lib/scenarios";

describe("scenarios alignment with valuation and dashboard", () => {
  it("matches valuation page value, TTM EBITDA, and dashboard DSCR for a test store", () => {
    const store = {
      id: "test-store",
      name: "Demo Laundromat",
      square_footage: 3200,
      occupancy_type: "leased",
      wdf_pct: 22,
      commercial_pct: 10,
      pickup_delivery_pct: 5,
      market_density: "suburban",
      store_condition: "good",
      revenue_trend: "stable",
      competition_level: "normal",
      monthly_rent: 8500,
    };

    const ttm = { ttmRevenue: 600_000, ttmEbitda: 156_000, monthsUsed: 12 };
    const resolvedFinancials = resolveStoreFinancials(store, ttm);
    const annualDebtService = 96_000;

    const leaseEndDate = "2031-06-01";
    const leaseYearsRemaining = calcYearsRemaining(leaseEndDate);
    const optionYears = 5;
    const totalLeaseControl = leaseYearsRemaining + optionYears;

    const valuationCtx = {
      store,
      equipment: [
        {
          machine_type: "Washer",
          quantity: 20,
          installation_year: 2020,
          high_speed_extract: true,
          condition: "Good",
        },
        {
          machine_type: "Dryer",
          quantity: 20,
          installation_year: 2020,
          high_speed_extract: false,
          condition: "Good",
        },
      ],
      lease: { lease_end_date: leaseEndDate, monthly_rent: 8500 },
      leaseOptions: [{ option_years: optionYears, status: "Available" }],
      realEstate: null,
      resolvedFinancials,
    };

    const scenarioCtx = {
      store,
      equipment: valuationCtx.equipment,
      totalLeaseControl,
      leaseYearsRemaining,
      availableOptionYears: optionYears,
      isOwnerOccupied: false,
      realEstateValue: 0,
      resolvedFinancials,
      annualDebtService,
    };

    const valuationPage = computeStoreValuation(valuationCtx);
    const dashboardDscr = computeStoreDscr(resolvedFinancials.annualEbitda, annualDebtService);
    const params = buildDefaultScenarioInputs(scenarioCtx);
    const scenarios = computeAllInteractiveScenarios(scenarioCtx, params);
    const baseline = scenarios.find((s) => s.id === "retool");

    expect(baseline).toBeDefined();
    expect(Math.round(valuationPage.businessValue)).toBe(baseline!.currentValue);
    expect(resolvedFinancials.annualEbitda).toBe(baseline!.currentEbitda);
    expect(dashboardDscr).toBe(baseline!.baselineDscr);

    const feed = generateStoreFeed(store, valuationCtx.lease, valuationCtx.equipment, [], {
      resolvedFinancials,
      scheduledAnnualDebtService: annualDebtService,
      valuation: {
        businessValue: valuationPage.businessValue,
        finalMultiple: valuationPage.finalMultiple,
      },
    });

    const dscrFeed = feed.find((item) => item.id === "dscr-test-store");
    expect(dscrFeed?.headline).toBe(`DSCR: ${dashboardDscr!.toFixed(2)}x`);
  });

  it("applies owner-occupied market rent after scenario ebitda overrides", () => {
    const store = {
      occupancy_type: "owner_occupied",
      square_footage: 1500,
      store_condition: "good",
      market_density: "rural",
      revenue_trend: "stable",
      competition_level: "protected",
    };
    const resolvedFinancials = resolveStoreFinancials(store, {
      ttmRevenue: 159_845.55,
      ttmEbitda: 68_079,
      monthsUsed: 12,
      ttmRent: 0,
    });
    const scenarioCtx = {
      store,
      equipment: [],
      totalLeaseControl: 15,
      leaseYearsRemaining: 15,
      availableOptionYears: 0,
      isOwnerOccupied: true,
      realEstateValue: 370_000,
      marketRentEstimate: 1500,
      resolvedFinancials,
      annualDebtService: 0,
    };
    const valuationCtx = {
      store,
      equipment: [] as [],
      lease: null,
      leaseOptions: [],
      realEstate: { estimated_value: 370_000, market_rent_estimate: 1500 },
      resolvedFinancials,
    };

    const valuationPage = computeStoreValuation(valuationCtx);
    const params = buildDefaultScenarioInputs(scenarioCtx);
    const scenarios = computeAllInteractiveScenarios(scenarioCtx, params);
    const baseline = scenarios.find((s) => s.id === "retool");
    const utility = scenarios.find((s) => s.id === "utility");
    const utilityBookEbitda =
      (resolvedFinancials.monthlyRevenue -
        (resolvedFinancials.monthlyExpenses - resolvedFinancials.monthlyRevenue * 0.03)) *
      12;
    const utilityValuation = computeStoreValuation(valuationCtx, { ebitda: utilityBookEbitda });

    expect(Math.round(valuationPage.businessValue)).toBe(baseline!.currentValue);
    expect(resolvedFinancials.annualEbitda).toBe(68_079);
    expect(valuationPage.businessValue).toBeCloseTo(
      (68_079 - 1500 * 12) * valuationPage.finalMultiple,
      0
    );
    expect(utility!.scenarioValue).toBe(Math.round(utilityValuation.businessValue));
  });
});
