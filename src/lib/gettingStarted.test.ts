import { describe, expect, it } from "vitest";
import {
  buildStoreSetupStatus,
  isDebtComplete,
  isEquipmentComplete,
  isOccupancyComplete,
  isTransactionsComplete,
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

  it("marks transactions complete when bank transaction rows exist", () => {
    expect(isTransactionsComplete(0)).toBe(false);
    expect(isTransactionsComplete(3)).toBe(true);
  });

  it("builds aggregate progress for all sections", () => {
    const status = buildStoreSetupStatus({
      equipmentCount: 2,
      occupancyType: "leased",
      hasLease: true,
      hasRealEstate: false,
      loanCount: 0,
      transactionCount: 10,
    });

    expect(status.completedCount).toBe(3);
    expect(status.totalCount).toBe(4);
    expect(status.sections.find((s) => s.id === "debt")?.status).toBe("not_started");
    expect(status.sections.find((s) => s.id === "equipment")?.status).toBe("complete");
  });
});
