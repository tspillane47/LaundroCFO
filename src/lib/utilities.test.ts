import { describe, expect, it } from "vitest";
import {
  computeTtmUtilityMetrics,
  resolveWasherCount,
} from "@/lib/utilities";

const AS_OF_SEP_11_2026 = new Date(2026, 8, 11);

describe("resolveWasherCount", () => {
  it("prefers equipment quantity over a zero store profile count", () => {
    expect(
      resolveWasherCount(0, [
        { machine_type: "Washer", quantity: 12 },
        { machine_type: "Washer", quantity: 2 },
        { machine_type: "Dryer", quantity: 5 },
      ])
    ).toBe(14);
  });

  it("falls back to the store profile when equipment has no washers", () => {
    expect(resolveWasherCount(21, [{ machine_type: "Dryer", quantity: 8 }])).toBe(21);
  });
});

describe("computeTtmUtilityMetrics", () => {
  it("ignores the in-progress current month and averages quarterly water across elapsed months", () => {
    const financials = [
      { year: 2026, month: 9, revenue: 2_405 },
      { year: 2026, month: 8, revenue: 14_085 },
      { year: 2026, month: 7, revenue: 12_365 },
      { year: 2026, month: 6, revenue: 14_557 },
    ];
    const utilities = [
      { year: 2026, month: 9, water: 0, gas: 1_036, electric: 0, sewer: 0, trash: 0, internet: 0 },
      { year: 2026, month: 8, water: 0, gas: 200, electric: 1_019, sewer: 0, trash: 0, internet: 0 },
      { year: 2026, month: 7, water: 0, gas: 200, electric: 1_119, sewer: 0, trash: 0, internet: 0 },
      { year: 2026, month: 6, water: 3_755, gas: 200, electric: 618, sewer: 0, trash: 0, internet: 0 },
    ];

    const metrics = computeTtmUtilityMetrics(financials, utilities, AS_OF_SEP_11_2026);

    expect(metrics.monthsUsed).toBe(3);
    expect(metrics.water).toBeCloseTo(3_755 / 3, 5);
    expect(metrics.electric).toBeCloseTo((1_019 + 1_119 + 618) / 3, 5);
    expect(metrics.waterPctOfRevenue).toBeGreaterThan(0);
    expect(metrics.electricPctOfRevenue).toBeGreaterThan(0);
  });

  it("returns null water when no elapsed month has water, instead of $0 from the current month", () => {
    const metrics = computeTtmUtilityMetrics(
      [
        { year: 2026, month: 9, revenue: 2_800 },
        { year: 2026, month: 8, revenue: 14_000 },
      ],
      [
        { year: 2026, month: 9, water: 0, gas: 1_036, electric: 0, sewer: 0, trash: 0, internet: 0 },
        { year: 2026, month: 8, water: 0, gas: 200, electric: 1_019, sewer: 0, trash: 0, internet: 0 },
      ],
      AS_OF_SEP_11_2026
    );

    expect(metrics.water).toBeNull();
    expect(metrics.waterPctOfRevenue).toBeNull();
    expect(metrics.electric).toBeCloseTo(1_019, 5);
  });
});
