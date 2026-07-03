import { describe, expect, it } from "vitest";
import {
  feedItemsToPersistableAlerts,
  planStoreAlertSync,
  type StoreAlertRow,
} from "@/lib/alerts";
import { generateStoreFeed } from "@/lib/intelligence";

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
});
