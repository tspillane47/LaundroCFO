import { describe, expect, it } from "vitest";
import {
  calcMonthProvenance,
  formatPostedManualNote,
  mapPlLinkCategoryToField,
  postedRevenueTotal,
  sumPostedByField,
  type PlLinkAmount,
} from "@/lib/plProvenance";

function link(
  category: string,
  amount_applied: number,
  year = 2026,
  month = 8
): PlLinkAmount {
  return { year, month, category, amount_applied };
}

const coolRoadAugustStored = {
  revenue: 14084.54,
  self_service_revenue: 13356.5,
  wdf_revenue: 728.04,
  commercial_revenue: 0,
  vending_revenue: 0,
  other_revenue: 0,
  utilities: 9336.11,
  rent: 0,
  payroll: 715.5,
  repairs_maintenance: 0,
  insurance_expense: 2719,
  supplies: 19.23,
  marketing: 0,
  professional_fees: 0,
  software_subscriptions: 42.44,
  cc_processing_fees: 698.69,
  bank_charges: 0,
  other_expenses: 57.15,
  debt_service: 1511.46,
};

const coolRoadAugustLinks: PlLinkAmount[] = [
  link("self_service_revenue", 13356.5),
  link("wdf_revenue", 728.04),
  link("gas", 8002.13),
  link("electric", 1018.83),
  link("trash", 80),
  link("internet", 235.15),
  link("payroll", 715.5),
  link("insurance_expense", 2719),
  link("supplies", 6.41),
  link("supplies", 12.82),
  link("software_subscriptions", 42.44),
  link("cc_processing_fees", 698.69),
  link("other_expenses", 57.15),
  link("debt_service", 1511.46),
];

describe("mapPlLinkCategoryToField", () => {
  it("maps utility and bank-fee aliases onto P&L columns", () => {
    expect(mapPlLinkCategoryToField("gas")).toBe("utilities");
    expect(mapPlLinkCategoryToField("utilities")).toBe("utilities");
    expect(mapPlLinkCategoryToField("bank_fees")).toBe("bank_charges");
    expect(mapPlLinkCategoryToField("other_income")).toBe("revenue");
    expect(mapPlLinkCategoryToField("needs_review")).toBeNull();
  });
});

describe("calcMonthProvenance", () => {
  it("treats stored-minus-posted leftover as the manual portion", () => {
    const lines = calcMonthProvenance(
      { ...coolRoadAugustStored, rent: 6200, repairs_maintenance: 100, supplies: 269.23 },
      coolRoadAugustLinks
    );
    const byField = Object.fromEntries(lines.map((line) => [line.field, line]));
    expect(byField.rent).toMatchObject({ stored: 6200, posted: 0, manual: 6200 });
    expect(byField.repairs_maintenance).toMatchObject({ stored: 100, posted: 0, manual: 100 });
    expect(byField.supplies).toMatchObject({ stored: 269.23, posted: 19.23, manual: 250 });
    expect(byField.utilities.manual).toBe(0);
    expect(byField.revenue.manual).toBe(0);
  });

  it("shows no manual leftover on the corrected Cool Road August row", () => {
    const lines = calcMonthProvenance(coolRoadAugustStored, coolRoadAugustLinks);
    expect(lines.filter((line) => line.manual > 0)).toEqual([]);
    expect(lines.find((line) => line.field === "revenue")).toMatchObject({
      stored: 14084.54,
      posted: 14084.54,
      manual: 0,
    });
    expect(lines.find((line) => line.field === "supplies")).toMatchObject({
      stored: 19.23,
      posted: 19.23,
      manual: 0,
    });
  });

  it("clamps manual at 0 when posted exceeds stored", () => {
    const lines = calcMonthProvenance(
      { ...coolRoadAugustStored, payroll: 100 },
      [link("payroll", 715.5)]
    );
    expect(lines.find((line) => line.field === "payroll")).toMatchObject({
      stored: 100,
      posted: 715.5,
      manual: 0,
    });
  });

  it("rolls utility-granular links into the utilities column", () => {
    const posted = sumPostedByField([link("gas", 8002.13), link("electric", 1018.83)]);
    expect(posted.utilities).toBe(9020.96);
    expect(postedRevenueTotal({ self_service_revenue: 100, wdf_revenue: 25, revenue: 10 })).toBe(135);
  });
});

describe("formatPostedManualNote", () => {
  it("matches the P&L badge copy", () => {
    expect(formatPostedManualNote(19.23, 250)).toBe(
      "$19.23 from posted transactions + $250.00 entered manually"
    );
  });
});
