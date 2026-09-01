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

  it("is a no-op for Waterbury-shaped already-included accounts", () => {
    const waterbury: PlaidAccountBalanceRow[] = [
      { account_type: "depository", current_balance: 14134.6, included: true },
      { account_type: "depository", current_balance: 26847.81, included: true },
      { account_type: "credit", current_balance: 11595.62, included: true },
    ];
    const withoutFlag: PlaidAccountBalanceRow[] = waterbury.map(({ included: _included, ...row }) => row);

    expect(sumPlaidCashOnHand(waterbury)).toBeCloseTo(sumPlaidCashOnHand(withoutFlag), 2);
    expect(sumPlaidCashOnHand(waterbury)).toBeCloseTo(14134.6 + 26847.81, 2);
    expect(sumPlaidCreditCardDebt(waterbury)).toBeCloseTo(11595.62, 2);
    expect(buildPlaidBalanceSnapshot(waterbury)).toMatchObject({
      cashOnHand: 14134.6 + 26847.81,
      creditCardDebt: 11595.62,
      depositoryAccountCount: 2,
      creditAccountCount: 1,
    });
  });

  it("excludes included: false accounts from cash and credit totals", () => {
    const accounts: PlaidAccountBalanceRow[] = [
      { account_type: "depository", current_balance: 14134.6, included: true },
      { account_type: "depository", current_balance: 50_000, included: false },
      { account_type: "credit", current_balance: 11595.62, included: true },
      { account_type: "credit", current_balance: 9_000, included: false },
    ];

    expect(sumPlaidCashOnHand(accounts)).toBeCloseTo(14134.6, 2);
    expect(sumPlaidCreditCardDebt(accounts)).toBeCloseTo(11595.62, 2);
    expect(buildPlaidBalanceSnapshot(accounts)).toMatchObject({
      depositoryAccountCount: 1,
      creditAccountCount: 1,
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
