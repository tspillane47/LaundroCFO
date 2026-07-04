import { describe, expect, it } from "vitest";
import {
  alertSeverityToToastType,
  feedItemsToPersistableAlerts,
  feedItemsToPositiveEvents,
  planStoreAlertSync,
  planToastShownUpdates,
  type StoreAlertRow,
} from "@/lib/alerts";
import { compareMonthlyRevenue } from "@/lib/alertEvaluation";
import {
  buildRevenuePeriodKey,
  generateStoreFeed,
  parseDscrFromAlertText,
} from "@/lib/intelligence";
import { computeStoreValuation } from "@/lib/getStoreValuation";

const STORE_ID = "store-123";

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    id: STORE_ID,
    name: "Test Store",
    monthly_revenue: 50000,
    monthly_expenses: 35000,
    monthly_utilities: 12000,
    avg_machine_age: 13,
    ...overrides,
  };
}

describe("positive event detection", () => {
  it("emits revenue-up when current month beats prior month", () => {
    const items = generateStoreFeed(makeStore(), undefined, [], [], {
      positiveEvents: {
        revenueUp: {
          currentRevenue: 55000,
          priorRevenue: 50000,
          periodKey: "2026-06",
        },
      },
    });

    const event = items.find((item) => item.id === `revenue-up-${STORE_ID}-2026-06`);
    expect(event?.severity).toBe("success");
    expect(event?.headline).toBe("Revenue Increased");
    expect(event?.description).toContain("10.0%");
  });

  it("emits dscr-improved when current DSCR is higher", () => {
    const items = generateStoreFeed(makeStore(), undefined, [], [], {
      positiveEvents: {
        dscrImproved: {
          currentDscr: 1.42,
          previousDscr: 1.1,
        },
      },
    });

    const event = items.find((item) => item.id === `dscr-improved-${STORE_ID}-1.42`);
    expect(event?.severity).toBe("success");
    expect(event?.headline).toBe("DSCR Improved");
    expect(event?.description).toContain("1.10x");
    expect(event?.description).toContain("1.42x");
  });

  it("compares monthly revenue using sorted financial records", () => {
    const comparison = compareMonthlyRevenue([
      { year: 2026, month: 5, revenue: 50000 } as any,
      { year: 2026, month: 6, revenue: 55000 } as any,
    ]);

    expect(comparison).toEqual({
      currentRevenue: 55000,
      priorRevenue: 50000,
      periodKey: buildRevenuePeriodKey(2026, 6),
    });
  });

  it("parses DSCR values from alert text", () => {
    expect(parseDscrFromAlertText("Current DSCR of 1.10x is below the 1.25x minimum.")).toBe(1.1);
  });

  it("maps positive events for one-time persistence", () => {
    const items = generateStoreFeed(makeStore(), undefined, [], [], {
      positiveEvents: {
        revenueUp: {
          currentRevenue: 55000,
          priorRevenue: 50000,
          periodKey: "2026-06",
        },
      },
    });

    const positive = feedItemsToPositiveEvents(items);
    expect(positive).toHaveLength(1);
    expect(positive[0].alert_key).toBe(`revenue-up-${STORE_ID}-2026-06`);
    expect(positive[0].severity).toBe("success");
  });
});

describe("toast mapping and shown tracking", () => {
  it("maps alert severities to toast colors", () => {
    expect(alertSeverityToToastType("danger", "dscr-x")).toBe("error");
    expect(alertSeverityToToastType("warning", "utility-x")).toBe("warning");
    expect(alertSeverityToToastType("info", "val-change-x")).toBe("success");
    expect(alertSeverityToToastType("success", "revenue-up-x")).toBe("success");
    expect(alertSeverityToToastType("info", "ins-premium-x")).toBe("info");
  });

  it("only marks alerts that have not been toasted yet", () => {
    const ids = planToastShownUpdates(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      new Set(["b"])
    );
    expect(ids).toEqual(["a", "c"]);
  });

  it("calling toast plan twice after marking shows nothing left to toast", () => {
    const firstPass = planToastShownUpdates([{ id: "a" }], new Set());
    expect(firstPass).toEqual(["a"]);

    const secondPass = planToastShownUpdates([{ id: "a" }], new Set(firstPass));
    expect(secondPass).toEqual([]);
  });
});

describe("planStoreAlertSync", () => {
  const current = [
    {
      alert_key: `dscr-${STORE_ID}`,
      severity: "danger" as const,
      title: "DSCR Below Threshold",
      body: "Current DSCR of 1.10x is below the 1.25x minimum.",
    },
    {
      alert_key: `utility-${STORE_ID}`,
      severity: "warning" as const,
      title: "High Utility Costs",
      body: "Utilities are 24.0% of revenue — above the 20% threshold.",
    },
  ];

  it("inserts new alerts when none are active", () => {
    const plan = planStoreAlertSync(current, []);
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.toResolve).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it("is idempotent when called twice with the same active alerts", () => {
    const activeRows: StoreAlertRow[] = current.map((alert, index) => ({
      id: `row-${index}`,
      alert_key: alert.alert_key,
      title: alert.title,
      body: alert.body,
      severity: alert.severity,
    }));

    const secondPass = planStoreAlertSync(current, activeRows);
    expect(secondPass.toInsert).toHaveLength(0);
    expect(secondPass.toResolve).toHaveLength(0);
    expect(secondPass.toUpdate).toHaveLength(0);
  });

  it("resolves alerts that are no longer present", () => {
    const activeRows: StoreAlertRow[] = [
      {
        id: "row-1",
        alert_key: `dscr-${STORE_ID}`,
        title: "DSCR Below Threshold",
        body: "Current DSCR of 1.10x is below the 1.25x minimum.",
        severity: "danger",
      },
      {
        id: "row-2",
        alert_key: `utility-${STORE_ID}`,
        title: "High Utility Costs",
        body: "Utilities are 24.0% of revenue — above the 20% threshold.",
        severity: "warning",
      },
    ];

    const resolvedOnlyUtility = current.filter(
      (alert) => alert.alert_key === `utility-${STORE_ID}`
    );
    const plan = planStoreAlertSync(resolvedOnlyUtility, activeRows);

    expect(plan.toInsert).toHaveLength(0);
    expect(plan.toResolve).toHaveLength(1);
    expect(plan.toResolve[0].alert_key).toBe(`dscr-${STORE_ID}`);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it("updates active rows when title/body/severity changed", () => {
    const activeRows: StoreAlertRow[] = [
      {
        id: "row-1",
        alert_key: `dscr-${STORE_ID}`,
        title: "Old title",
        body: "Old body",
        severity: "danger",
      },
    ];

    const plan = planStoreAlertSync(
      [
        {
          alert_key: `dscr-${STORE_ID}`,
          severity: "danger",
          title: "DSCR Below Threshold",
          body: "Current DSCR of 1.10x is below the 1.25x minimum.",
        },
      ],
      activeRows
    );

    expect(plan.toInsert).toHaveLength(0);
    expect(plan.toResolve).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].alert.title).toBe("DSCR Below Threshold");
  });

  it("does not resolve point-in-time positive event rows", () => {
    const activeRows: StoreAlertRow[] = [
      {
        id: "row-positive",
        alert_key: `revenue-up-${STORE_ID}-2026-06`,
        title: "Revenue Increased",
        body: "Monthly revenue rose.",
        severity: "success",
      },
    ];

    const plan = planStoreAlertSync([], activeRows);
    expect(plan.toResolve).toHaveLength(0);
    expect(plan.toInsert).toHaveLength(0);
  });
});

describe("generateStoreFeed unified evaluator", () => {
  it("uses TTM DSCR and emits a utility alert above 20%", () => {
    const items = generateStoreFeed(makeStore(), undefined, [], [], {
      scheduledAnnualDebtService: 120000,
      resolvedFinancials: {
        monthlyRevenue: 50000,
        monthlyExpenses: 39000,
        annualEbitda: 132000,
        source: "ttm",
      },
      monthlyUtilities: 12000,
    });

    const dscr = items.find((item) => item.id === `dscr-${STORE_ID}`);
    const utility = items.find((item) => item.id === `utility-${STORE_ID}`);

    expect(dscr?.severity).toBe("danger");
    expect(dscr?.headline).toBe("DSCR Below Threshold");
    expect(dscr?.description).toContain("1.10x");

    expect(utility?.severity).toBe("warning");
    expect(utility?.headline).toBe("High Utility Costs");
    expect(utility?.description).toContain("24.0%");
  });

  it("maps only persistable severities for storage", () => {
    const items = generateStoreFeed(makeStore(), undefined, [], [], {
      scheduledAnnualDebtService: 120000,
      resolvedFinancials: {
        monthlyRevenue: 50000,
        monthlyExpenses: 39000,
        annualEbitda: 132000,
        source: "ttm",
      },
      monthlyUtilities: 12000,
    });

    const persistable = feedItemsToPersistableAlerts(items);
    const keys = persistable.map((alert) => alert.alert_key);

    expect(keys).toContain(`dscr-${STORE_ID}`);
    expect(keys).toContain(`utility-${STORE_ID}`);
    expect(keys).toContain(`equip-${STORE_ID}`);
    expect(keys).not.toContain(`rev-${STORE_ID}`);
  });

  it("uses canonical valuation when passed from getStoreValuation", () => {
    const canonical = {
      businessValue: 365732,
      finalMultiple: 4.6,
    };
    const items = generateStoreFeed(makeStore(), undefined, [], [], {
      resolvedFinancials: {
        monthlyRevenue: 50000,
        monthlyExpenses: 39000,
        annualEbitda: 132000,
        source: "ttm",
      },
      valuation: canonical,
    });

    const valItem = items.find((item) => item.id === `val-${STORE_ID}`);
    expect(valItem?.headline).toBe("Store valuation: $365,732");
    expect(valItem?.description).toContain("4.60x EBITDA multiple");
  });

  it("matches computeStoreValuation when valuation option is omitted", () => {
    const store = makeStore({ square_footage: 2500, occupancy_type: "leased" });
    const financials = {
      monthlyRevenue: 50000,
      monthlyExpenses: 39000,
      annualEbitda: 132000,
      source: "ttm" as const,
    };

    const canonical = computeStoreValuation({
      store,
      equipment: [],
      lease: null,
      leaseOptions: [],
      realEstate: null,
      resolvedFinancials: financials,
    });

    const items = generateStoreFeed(store, undefined, [], [], {
      resolvedFinancials: financials,
    });

    const valItem = items.find((item) => item.id === `val-${STORE_ID}`);
    expect(valItem?.headline).toBe(
      `Store valuation: $${Math.round(canonical.businessValue).toLocaleString()}`
    );
    expect(valItem?.description).toContain(`${canonical.finalMultiple.toFixed(2)}x EBITDA multiple`);
  });
});
