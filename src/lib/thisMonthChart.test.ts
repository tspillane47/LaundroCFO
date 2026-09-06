import { describe, expect, it } from "vitest";
import {
  buildThisMonthChartModel,
  classifyThisMonthBucket,
  formatLocalIsoDate,
  thisMonthEmptyMessage,
  thisMonthTickInterval,
} from "@/lib/thisMonthChart";

const AS_OF = new Date(2026, 8, 6); // Sep 6, 2026

describe("classifyThisMonthBucket", () => {
  it("treats revenue categories as revenue and operating costs as opex", () => {
    expect(classifyThisMonthBucket("self_service_revenue")).toBe("revenue");
    expect(classifyThisMonthBucket("other_income")).toBe("revenue");
    expect(classifyThisMonthBucket("rent")).toBe("opex");
    expect(classifyThisMonthBucket("electric")).toBe("opex");
    expect(classifyThisMonthBucket("bank_fees")).toBe("opex");
  });

  it("skips uncategorized rows and debt service so EBITDA stays above the line", () => {
    expect(classifyThisMonthBucket("needs_review")).toBe("skip");
    expect(classifyThisMonthBucket(null)).toBe("skip");
    expect(classifyThisMonthBucket("debt_service")).toBe("skip");
  });
});

describe("buildThisMonthChartModel", () => {
  it("builds a day-by-day running total from $0 through today only", () => {
    const model = buildThisMonthChartModel(
      [
        { transaction_date: "2026-09-01", amount: 400, category: "self_service_revenue" },
        { transaction_date: "2026-09-01", amount: 80, category: "supplies" },
        { transaction_date: "2026-09-03", amount: 250, category: "wdf_revenue" },
        { transaction_date: "2026-09-06", amount: 100, category: "electric" },
        { transaction_date: "2026-09-07", amount: 900, category: "self_service_revenue" },
        { transaction_date: "2026-08-31", amount: 500, category: "self_service_revenue" },
      ],
      AS_OF
    );

    expect(model.points).toHaveLength(6);
    expect(model.points.map((p) => p.label)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(model.points[0]).toEqual({ label: "1", revenue: 400, ebitda: 320 });
    expect(model.points[1]).toEqual({ label: "2", revenue: 400, ebitda: 320 });
    expect(model.points[2]).toEqual({ label: "3", revenue: 650, ebitda: 570 });
    expect(model.points[5]).toEqual({ label: "6", revenue: 650, ebitda: 470 });
    expect(model.latestRevenue).toBe(650);
    expect(model.latestEbitda).toBe(470);
    expect(model.monthLabel).toBe("September");
    expect(model.throughLabel).toBe("through Sep 6");
    expect(model.hasCategorizedActivity).toBe(true);
  });

  it("starts at $0 on day 1 when nothing has posted yet", () => {
    const model = buildThisMonthChartModel(
      [{ transaction_date: "2026-09-04", amount: 200, category: "self_service_revenue" }],
      AS_OF
    );
    expect(model.points[0]).toEqual({ label: "1", revenue: 0, ebitda: 0 });
    expect(model.points[3]).toEqual({ label: "4", revenue: 200, ebitda: 200 });
  });

  it("ignores excluded, uncategorized, and debt-service rows", () => {
    const model = buildThisMonthChartModel(
      [
        { transaction_date: "2026-09-02", amount: 300, category: "self_service_revenue", excluded: true },
        { transaction_date: "2026-09-02", amount: 300, category: "needs_review" },
        { transaction_date: "2026-09-02", amount: 900, category: "debt_service" },
        { transaction_date: "2026-09-02", amount: 50, category: "rent", status: "excluded" },
      ],
      AS_OF
    );
    expect(model.hasAnyTransactions).toBe(true);
    expect(model.hasCategorizedActivity).toBe(false);
    expect(model.points[1]).toEqual({ label: "2", revenue: 0, ebitda: 0 });
    expect(thisMonthEmptyMessage(model)).toMatch(/Categorize this month/);
  });
});

describe("thisMonth helpers", () => {
  it("formats local ISO dates without UTC shifting", () => {
    expect(formatLocalIsoDate(new Date(2026, 8, 6))).toBe("2026-09-06");
  });

  it("thins x-axis ticks as the month fills in", () => {
    expect(thisMonthTickInterval(6)).toBe(0);
    expect(thisMonthTickInterval(16)).toBe(1);
    expect(thisMonthTickInterval(28)).toBe(2);
  });
});
