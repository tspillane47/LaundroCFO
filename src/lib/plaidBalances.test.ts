import { describe, expect, it } from "vitest";
import {
  buildPlaidBalanceSnapshot,
  buildPortfolioPlaidBalanceSnapshot,
  groupPlaidBalanceSnapshotsByStore,
  sumPlaidCashOnHand,
  sumPlaidCreditCardDebt,
  type PlaidAccountBalanceRow,
  type PlaidAccountBalanceRowWithStore,
} from "@/lib/plaid-shared";

const sampleAccounts: PlaidAccountBalanceRow[] = [
  {
    account_type: "depository",
    current_balance: 12_500.45,
    last_synced_at: "2026-08-15T10:00:00.000Z",
  },
  {
    account_type: "depository",
    current_balance: 2_000,
    last_synced_at: "2026-08-15T11:00:00.000Z",
  },
  {
    account_type: "credit",
    current_balance: 1_250.75,
    last_synced_at: "2026-08-15T09:30:00.000Z",
  },
  {
    account_type: "credit",
    current_balance: -150,
    last_synced_at: "2026-08-15T09:45:00.000Z",
  },
  {
    account_type: "loan",
    current_balance: 50_000,
    last_synced_at: "2026-08-15T08:00:00.000Z",
  },
];

describe("Plaid balance aggregation", () => {
  it("sums only depository accounts for cash on hand", () => {
    expect(sumPlaidCashOnHand(sampleAccounts)).toBeCloseTo(14_500.45, 2);
  });

  it("sums only credit accounts for credit card debt", () => {
    expect(sumPlaidCreditCardDebt(sampleAccounts)).toBeCloseTo(1_100.75, 2);
  });

  it("includes negative credit balances without clamping to zero", () => {
    const accounts: PlaidAccountBalanceRow[] = [
      { account_type: "credit", current_balance: 500 },
      { account_type: "credit", current_balance: -750 },
    ];

    expect(sumPlaidCreditCardDebt(accounts)).toBe(-250);
  });

  it("builds a multi-account snapshot with latest sync timestamp", () => {
    expect(buildPlaidBalanceSnapshot(sampleAccounts)).toEqual({
      cashOnHand: 14_500.45,
      creditCardDebt: 1_100.75,
      depositoryAccountCount: 2,
      creditAccountCount: 2,
      lastSyncedAt: "2026-08-15T11:00:00.000Z",
    });
  });

  it("returns zero totals when no matching account types exist", () => {
    const accounts: PlaidAccountBalanceRow[] = [
      { account_type: "investment", current_balance: 10_000 },
    ];

    expect(sumPlaidCashOnHand(accounts)).toBe(0);
    expect(sumPlaidCreditCardDebt(accounts)).toBe(0);
    expect(buildPlaidBalanceSnapshot(accounts)).toEqual({
      cashOnHand: 0,
      creditCardDebt: 0,
      depositoryAccountCount: 0,
      creditAccountCount: 0,
      lastSyncedAt: null,
    });
  });
});

describe("Portfolio Plaid balance aggregation", () => {
  const multiStoreAccounts: PlaidAccountBalanceRowWithStore[] = [
    {
      store_id: "store-a",
      account_type: "depository",
      current_balance: 10_000,
      last_synced_at: "2026-08-15T10:00:00.000Z",
    },
    {
      store_id: "store-a",
      account_type: "credit",
      current_balance: 500,
      last_synced_at: "2026-08-15T10:30:00.000Z",
    },
    {
      store_id: "store-b",
      account_type: "depository",
      current_balance: 7_500,
      last_synced_at: "2026-08-15T11:00:00.000Z",
    },
    {
      store_id: "store-b",
      account_type: "credit",
      current_balance: -200,
      last_synced_at: "2026-08-15T09:00:00.000Z",
    },
  ];

  it("sums cash and credit across multiple stores for the portfolio snapshot", () => {
    expect(buildPortfolioPlaidBalanceSnapshot(multiStoreAccounts, 2)).toEqual({
      cashOnHand: 17_500,
      creditCardDebt: 300,
      depositoryAccountCount: 2,
      creditAccountCount: 2,
      lastSyncedAt: "2026-08-15T11:00:00.000Z",
      connectedStoreCount: 2,
    });
  });

  it("groups per-store snapshots for store cards", () => {
    expect(groupPlaidBalanceSnapshotsByStore(multiStoreAccounts)).toEqual({
      "store-a": {
        cashOnHand: 10_000,
        creditCardDebt: 500,
        depositoryAccountCount: 1,
        creditAccountCount: 1,
        lastSyncedAt: "2026-08-15T10:30:00.000Z",
      },
      "store-b": {
        cashOnHand: 7_500,
        creditCardDebt: -200,
        depositoryAccountCount: 1,
        creditAccountCount: 1,
        lastSyncedAt: "2026-08-15T11:00:00.000Z",
      },
    });
  });
});
