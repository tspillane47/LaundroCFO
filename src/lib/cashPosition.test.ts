import { describe, expect, it } from "vitest";
import { formatCashPositionSubtext } from "@/components/ui/CashPositionIndicator";
import {
  computePortfolioCashPosition,
  computeStoreCashPosition,
  deriveCashPositionComposition,
  isStorePlaidLiveSynced,
} from "@/lib/cashPosition";
import type { PlaidBalanceSnapshot } from "@/lib/plaid-shared";

const manualStore = {
  id: "store-manual",
  operating_account_balance: 10_000,
  reserve_account_balance: 2_000,
  petty_cash: 500,
};

const plaidSnapshot: PlaidBalanceSnapshot = {
  cashOnHand: 15_000,
  creditCardDebt: 800,
  depositoryAccountCount: 2,
  creditAccountCount: 1,
  lastSyncedAt: "2026-08-15T10:00:00.000Z",
};

const creditOnlySnapshot: PlaidBalanceSnapshot = {
  cashOnHand: 0,
  creditCardDebt: 500,
  depositoryAccountCount: 0,
  creditAccountCount: 1,
  lastSyncedAt: "2026-08-15T10:00:00.000Z",
};

const emptySyncedSnapshot: PlaidBalanceSnapshot = {
  cashOnHand: 0,
  creditCardDebt: 0,
  depositoryAccountCount: 0,
  creditAccountCount: 0,
  lastSyncedAt: null,
};

describe("isStorePlaidLiveSynced", () => {
  it("returns true when connected with synced depository accounts", () => {
    expect(isStorePlaidLiveSynced(true, plaidSnapshot)).toBe(true);
  });

  it("returns false when connected but no depository accounts synced yet", () => {
    expect(isStorePlaidLiveSynced(true, emptySyncedSnapshot)).toBe(false);
    expect(isStorePlaidLiveSynced(true, creditOnlySnapshot)).toBe(false);
    expect(isStorePlaidLiveSynced(true, undefined)).toBe(false);
  });

  it("returns false when not connected", () => {
    expect(isStorePlaidLiveSynced(false, plaidSnapshot)).toBe(false);
  });
});

describe("computeStoreCashPosition", () => {
  it("uses Plaid cash when live-synced and ignores manual entry", () => {
    expect(computeStoreCashPosition(manualStore, true, plaidSnapshot)).toEqual({
      amount: 15_000,
      source: "plaid",
    });
  });

  it("falls back to manual when connected but not yet synced", () => {
    expect(computeStoreCashPosition(manualStore, true, emptySyncedSnapshot)).toEqual({
      amount: 12_500,
      source: "manual",
    });
  });

  it("uses manual cash when no Plaid connection", () => {
    expect(computeStoreCashPosition(manualStore, false, undefined)).toEqual({
      amount: 12_500,
      source: "manual",
    });
  });

  it("uses live Plaid zero balance when depository accounts exist", () => {
    const zeroLiveSnapshot: PlaidBalanceSnapshot = {
      ...plaidSnapshot,
      cashOnHand: 0,
    };
    expect(computeStoreCashPosition(manualStore, true, zeroLiveSnapshot)).toEqual({
      amount: 0,
      source: "plaid",
    });
  });
});

describe("computePortfolioCashPosition", () => {
  const stores = [
    manualStore,
    {
      id: "store-plaid",
      operating_account_balance: 5_000,
      reserve_account_balance: 0,
      petty_cash: 0,
    },
    {
      id: "store-pending",
      operating_account_balance: 3_000,
      reserve_account_balance: 0,
      petty_cash: 0,
    },
  ];

  it("never double-counts Plaid and manual for the same store", () => {
    const summary = computePortfolioCashPosition(
      stores,
      ["store-plaid", "store-pending"],
      {
        "store-plaid": plaidSnapshot,
        "store-pending": emptySyncedSnapshot,
      }
    );

    expect(summary.total).toBe(12_500 + 15_000 + 3_000);
    expect(summary.liveStoreCount).toBe(1);
    expect(summary.manualStoreCount).toBe(2);
    expect(summary.composition).toBe("mixed");
    expect(summary.byStoreId["store-plaid"].source).toBe("plaid");
    expect(summary.byStoreId["store-pending"].source).toBe("manual");
  });

  it("reports all_live when every store uses Plaid", () => {
    const allPlaidStores = [
      { id: "a", operating_account_balance: 1, reserve_account_balance: 0, petty_cash: 0 },
      { id: "b", operating_account_balance: 1, reserve_account_balance: 0, petty_cash: 0 },
    ];
    const summary = computePortfolioCashPosition(allPlaidStores, ["a", "b"], {
      a: { ...plaidSnapshot, cashOnHand: 1_000 },
      b: { ...plaidSnapshot, cashOnHand: 2_000 },
    });

    expect(summary.total).toBe(3_000);
    expect(summary.composition).toBe("all_live");
  });

  it("reports all_manual when no stores are live-synced", () => {
    const summary = computePortfolioCashPosition(stores, [], {});
    expect(summary.composition).toBe("all_manual");
    expect(summary.total).toBe(12_500 + 5_000 + 3_000);
  });
});

describe("deriveCashPositionComposition", () => {
  it("classifies composition states", () => {
    expect(deriveCashPositionComposition(0, 5)).toBe("all_manual");
    expect(deriveCashPositionComposition(5, 5)).toBe("all_live");
    expect(deriveCashPositionComposition(2, 5)).toBe("mixed");
  });
});

describe("formatCashPositionSubtext", () => {
  it("returns manual subtext, mixed count, or null for all live", () => {
    expect(formatCashPositionSubtext("all_manual", 0, 5)).toContain("entered");
    expect(formatCashPositionSubtext("mixed", 3, 7)).toBe("3 of 7 stores live-synced");
    expect(formatCashPositionSubtext("all_live", 7, 7)).toBeNull();
  });
});
