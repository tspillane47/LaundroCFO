import { describe, expect, it } from "vitest";
import {
  buildYearRevenueEbitdaChartData,
  formatCompactChartDollar,
  yearChartHasNegative,
  yearChartValueDomain,
} from "@/lib/yearRevenueEbitdaChart";

describe("buildYearRevenueEbitdaChartData", () => {
  it("always returns 12 months and uses null for missing records", () => {
    const data = buildYearRevenueEbitdaChartData([
      { revenue: 12400, ebitda: 3100 },
      null,
      { revenue: 0, ebitda: -800 },
    ]);

    expect(data).toHaveLength(12);
    expect(data.map((d) => d.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]);
    expect(data[0]).toEqual({ label: "Jan", revenue: 12400, ebitda: 3100 });
    expect(data[1]).toEqual({ label: "Feb", revenue: null, ebitda: null });
    expect(data[2]).toEqual({ label: "Mar", revenue: 0, ebitda: -800 });
    expect(data[11]).toEqual({ label: "Dec", revenue: null, ebitda: null });
  });
});

describe("formatCompactChartDollar", () => {
  it("uses compact $12k-style labels", () => {
    expect(formatCompactChartDollar(12400)).toBe("$12k");
    expect(formatCompactChartDollar(999)).toBe("$999");
    expect(formatCompactChartDollar(-2100)).toBe("-$2k");
    expect(formatCompactChartDollar(1_200_000)).toBe("$1.2M");
  });
});

describe("yearChartValueDomain", () => {
  it("pads the max and keeps zero as the floor when all values are positive", () => {
    const [min, max] = yearChartValueDomain([
      { label: "Jan", revenue: 10000, ebitda: 2000 },
      { label: "Feb", revenue: null, ebitda: null },
    ]);
    expect(min).toBe(0);
    expect(max).toBeGreaterThan(10000);
  });

  it("extends below zero when EBITDA is negative", () => {
    const [min, max] = yearChartValueDomain([
      { label: "Jan", revenue: 8000, ebitda: -2000 },
    ]);
    expect(min).toBeLessThan(-2000);
    expect(max).toBeGreaterThan(8000);
    expect(yearChartHasNegative([{ label: "Jan", revenue: 8000, ebitda: -2000 }])).toBe(true);
  });

  it("uses a safe domain when every month is blank", () => {
    const empty = buildYearRevenueEbitdaChartData([]);
    expect(yearChartValueDomain(empty)).toEqual([0, 1]);
    expect(yearChartHasNegative(empty)).toBe(false);
  });
});
