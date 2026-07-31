import { describe, expect, it } from "vitest";
import {
  buildFinancialDataOptions,
  buildStoreSetupStatus,
  isDebtComplete,
  isEquipmentComplete,
  isFinancialDataComplete,
  isOccupancyComplete,
} from "@/lib/gettingStarted";

describe("gettingStarted status helpers", () => {
  it("marks equipment complete when inventory rows exist", () => {
    expect(isEquipmentComplete(0)).toBe(false);
    expect(isEquipmentComplete(1)).toBe(true);
  });

  it("marks occupancy complete based on occupancy type and related records", () => {
    expect(isOccupancyComplete(null, false, false)).toBe(false);
    expect(isOccupancyComplete("leased", false, false)).toBe(false);
    expect(isOccupancyComplete("leased", true, false)).toBe(true);
    expect(isOccupancyComplete("owner_occupied", false, false)).toBe(false);
    expect(isOccupancyComplete("owner_occupied", false, true)).toBe(true);
  });

  it("marks debt complete when loan rows exist", () => {
    expect(isDebtComplete(0)).toBe(false);
    expect(isDebtComplete(2)).toBe(true);
  });

  it("marks financial data complete when any connection or transactions exist", () => {
    expect(isFinancialDataComplete(false, false, 0)).toBe(false);
    expect(isFinancialDataComplete(true, false, 0)).toBe(true);
    expect(isFinancialDataComplete(false, true, 0)).toBe(true);
    expect(isFinancialDataComplete(false, false, 3)).toBe(true);
  });

  it("builds financial data options with connected flags", () => {
    const options = buildFinancialDataOptions({
      hasQuickBooks: true,
      hasPlaid: false,
      hasTransactions: true,
    });

    expect(options.find((o) => o.id === "quickbooks")?.connected).toBe(true);
    expect(options.find((o) => o.id === "plaid")?.connected).toBe(false);
    expect(options.find((o) => o.id === "csv")?.connected).toBe(true);
  });

  it("builds aggregate progress for all sections", () => {
    const status = buildStoreSetupStatus({
      equipmentCount: 2,
      occupancyType: "leased",
      hasLease: true,
      hasRealEstate: false,
      loanCount: 0,
      hasQuickBooks: true,
      hasPlaid: false,
      transactionCount: 0,
    });

    expect(status.completedCount).toBe(3);
    expect(status.totalCount).toBe(4);
    expect(status.sections.find((s) => s.id === "debt")?.status).toBe("not_started");
    expect(status.sections.find((s) => s.id === "financials")?.status).toBe("complete");
    expect(status.sections.find((s) => s.id === "financials")?.financialOptions).toHaveLength(3);
  });
});
