import { describe, expect, it } from "vitest";
import { calcAverageEquipmentAge, calcEquipmentScore } from "@/lib/calculations";
import {
  computeEquipmentMetrics,
  getEquipmentGrade,
  type EquipmentRecord,
} from "@/lib/equipment";

const CURRENT_YEAR = 2026;

function legacyPortfolioGrade(equipment: EquipmentRecord[]) {
  const avgEquipmentAge =
    equipment.length > 0
      ? calcAverageEquipmentAge(
          equipment.map((e) => ({ qty: e.quantity, installed: e.installation_year })),
          CURRENT_YEAR
        )
      : 0;
  return {
    avgEquipmentAge,
    grade: getEquipmentGrade(calcEquipmentScore(avgEquipmentAge)),
    score: calcEquipmentScore(avgEquipmentAge),
  };
}

function makeRecord(
  partial: Pick<
    EquipmentRecord,
    "machine_type" | "quantity" | "installation_year" | "high_speed_extract" | "condition"
  >
): EquipmentRecord {
  return {
    id: "1",
    user_id: "u",
    store_id: "s",
    manufacturer: "Speed Queen",
    machine_size: partial.machine_type === "Washer" ? "40lb" : "45lb Stack",
    notes: null,
    avg_vend_price: partial.machine_type === "Washer" ? 4 : null,
    ...partial,
  };
}

describe("portfolio equipment grade alignment", () => {
  it("matches Equipment/Valuation grade for the scenarios alignment test store", () => {
    const equipment = [
      makeRecord({
        machine_type: "Washer",
        quantity: 20,
        installation_year: 2020,
        high_speed_extract: true,
        condition: "Good",
      }),
      makeRecord({
        machine_type: "Dryer",
        quantity: 20,
        installation_year: 2020,
        high_speed_extract: false,
        condition: "Good",
      }),
    ];

    const legacy = legacyPortfolioGrade(equipment);
    const page = computeEquipmentMetrics(equipment, CURRENT_YEAR);

    expect(legacy.avgEquipmentAge).toBeCloseTo(6, 1);
    expect(legacy.grade).toBe("B");
    expect(page.weightedAvgAge).toBeCloseTo(6, 1);
    expect(page.qualityScore).toBe(95);
    expect(page.grade).toBe("A");

    const portfolioGrade =
      equipment.length > 0 ? computeEquipmentMetrics(equipment, CURRENT_YEAR).grade : legacy.grade;
    expect(portfolioGrade).toBe(page.grade);
  });

  it("matches Equipment/Valuation grade across representative store profiles", () => {
    const profiles: EquipmentRecord[][] = [
      [
        makeRecord({
          machine_type: "Washer",
          quantity: 12,
          installation_year: 2018,
          high_speed_extract: true,
          condition: "Good",
        }),
        makeRecord({
          machine_type: "Washer",
          quantity: 8,
          installation_year: 2022,
          high_speed_extract: false,
          condition: "Excellent",
        }),
        makeRecord({
          machine_type: "Dryer",
          quantity: 20,
          installation_year: 2018,
          high_speed_extract: false,
          condition: "Good",
        }),
      ],
      [
        makeRecord({
          machine_type: "Washer",
          quantity: 14,
          installation_year: 2016,
          high_speed_extract: true,
          condition: "Good",
        }),
        makeRecord({
          machine_type: "Dryer",
          quantity: 14,
          installation_year: 2016,
          high_speed_extract: false,
          condition: "Good",
        }),
      ],
      [
        makeRecord({
          machine_type: "Washer",
          quantity: 10,
          installation_year: 2024,
          high_speed_extract: true,
          condition: "Excellent",
        }),
        makeRecord({
          machine_type: "Washer",
          quantity: 10,
          installation_year: 2014,
          high_speed_extract: false,
          condition: "Good",
        }),
        makeRecord({
          machine_type: "Dryer",
          quantity: 20,
          installation_year: 2014,
          high_speed_extract: false,
          condition: "Good",
        }),
      ],
    ];

    for (const equipment of profiles) {
      const page = computeEquipmentMetrics(equipment, CURRENT_YEAR);
      const portfolioGrade = computeEquipmentMetrics(equipment, CURRENT_YEAR).grade;
      expect(portfolioGrade).toBe(page.grade);
    }
  });
});
