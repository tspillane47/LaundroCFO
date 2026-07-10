import { describe, expect, it } from "vitest";
import {
  extractProfitAndLossAccountRows,
  getQuickBooksSyncDateRange,
  mapProfitAndLossToMonthlyAmounts,
  parseMonthColumnTitle,
  parseProfitAndLossMonthColumns,
  type QuickBooksProfitAndLossReport,
} from "@/lib/quickbooks";

const SAMPLE_MONTHLY_REPORT: QuickBooksProfitAndLossReport = {
  Header: {
    StartPeriod: "2025-01-01",
    EndPeriod: "2025-03-31",
    SummarizeColumnsBy: "Month",
  },
  Columns: {
    Column: [
      {
        ColTitle: "",
        ColType: "Account",
        MetaData: [{ Name: "ColKey", Value: "account" }],
      },
      {
        ColTitle: "Jan 2025",
        ColType: "Money",
        MetaData: [{ Name: "ColKey", Value: "Jan 2025" }],
      },
      {
        ColTitle: "Feb 2025",
        ColType: "Money",
        MetaData: [{ Name: "ColKey", Value: "Feb 2025" }],
      },
      {
        ColTitle: "Total",
        ColType: "Money",
        MetaData: [{ Name: "ColKey", Value: "total" }],
      },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Section",
        group: "Income",
        Header: { ColData: [{ value: "Income" }, { value: "" }] },
        Rows: {
          Row: [
            {
              type: "Data",
              ColData: [
                { id: "1", value: "Laundry Income" },
                { value: "10,000.00" },
                { value: "11,500.00" },
                { value: "21,500.00" },
              ],
            },
            {
              type: "Data",
              ColData: [
                { id: "2", value: "Office Supplies" },
                { value: "50.00" },
                { value: "0" },
                { value: "50.00" },
              ],
            },
          ],
        },
        Summary: { ColData: [{ value: "Total Income" }, { value: "10,050.00" }] },
      },
      {
        type: "Section",
        group: "Expenses",
        Rows: {
          Row: [
            {
              type: "Data",
              ColData: [
                { id: "3", value: "Utilities" },
                { value: "1,200.00" },
                { value: "1,100.00" },
                { value: "2,300.00" },
              ],
            },
          ],
        },
      },
    ],
  },
};

describe("parseMonthColumnTitle", () => {
  it("parses abbreviated month titles", () => {
    expect(parseMonthColumnTitle("Jan 2025")).toEqual({ year: 2025, month: 1 });
    expect(parseMonthColumnTitle("Feb 2025")).toEqual({ year: 2025, month: 2 });
  });

  it("returns null for total columns", () => {
    expect(parseMonthColumnTitle("Total")).toBeNull();
  });
});

describe("parseProfitAndLossMonthColumns", () => {
  it("extracts month columns and skips total", () => {
    expect(parseProfitAndLossMonthColumns(SAMPLE_MONTHLY_REPORT)).toEqual([
      { year: 2025, month: 1, columnIndex: 1 },
      { year: 2025, month: 2, columnIndex: 2 },
    ]);
  });
});

describe("extractProfitAndLossAccountRows", () => {
  it("walks nested section rows and returns leaf account rows", () => {
    expect(extractProfitAndLossAccountRows(SAMPLE_MONTHLY_REPORT)).toEqual([
      {
        accountName: "Laundry Income",
        amountsByColumnIndex: ["10,000.00", "11,500.00", "21,500.00"],
      },
      {
        accountName: "Office Supplies",
        amountsByColumnIndex: ["50.00", "0", "50.00"],
      },
      {
        accountName: "Utilities",
        amountsByColumnIndex: ["1,200.00", "1,100.00", "2,300.00"],
      },
    ]);
  });
});

describe("mapProfitAndLossToMonthlyAmounts", () => {
  it("aggregates mapped accounts by month and flags unmapped accounts", () => {
    const { monthlyAmounts, unmappedAccounts } = mapProfitAndLossToMonthlyAmounts({
      report: SAMPLE_MONTHLY_REPORT,
      mappings: [
        { qb_account_name: "Laundry Income", laundrocfo_field: "revenue" },
        { qb_account_name: "Utilities", laundrocfo_field: "utilities" },
      ],
    });

    expect(unmappedAccounts).toEqual(["Office Supplies"]);
    expect(monthlyAmounts.get("2025-1")).toEqual({
      revenue: 10000,
      utilities: 1200,
      rent: 0,
      payroll: 0,
      repairs_maintenance: 0,
      insurance_expense: 0,
      supplies: 0,
      marketing: 0,
      professional_fees: 0,
      software_subscriptions: 0,
      cc_processing_fees: 0,
      bank_charges: 0,
      other_expenses: 0,
      debt_service: 0,
    });
    expect(monthlyAmounts.get("2025-2")?.revenue).toBe(11500);
    expect(monthlyAmounts.get("2025-2")?.utilities).toBe(1100);
  });
});

describe("getQuickBooksSyncDateRange", () => {
  it("uses a 24-month backfill window for first sync", () => {
    const { startDate, endDate } = getQuickBooksSyncDateRange(true);
    expect(startDate).toMatch(/^\d{4}-\d{2}-01$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses current and previous month for subsequent sync", () => {
    const { startDate, endDate } = getQuickBooksSyncDateRange(false);
    expect(startDate).toMatch(/^\d{4}-\d{2}-01$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
