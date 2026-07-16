import { describe, expect, it } from "vitest";
import {
  formatPlaidConnectionLabel,
  formatPlaidItemErrorMessage,
  isPlaidSyncProtectedStatus,
  isPlaidSyncRemovableStatus,
  isQuickBooksDataSource,
  normalizePlaidTransaction,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
} from "@/lib/plaid-shared";

describe("Plaid connection guards", () => {
  it("blocks QuickBooks-connected stores", () => {
    expect(isQuickBooksDataSource("quickbooks")).toBe(true);
    expect(isQuickBooksDataSource("manual")).toBe(false);
    expect(isQuickBooksDataSource("bank_import")).toBe(false);
    expect(isQuickBooksDataSource(null)).toBe(false);
  });

  it("uses a clear QuickBooks disconnect message", () => {
    expect(PLAID_QUICKBOOKS_BLOCK_MESSAGE).toBe(
      "Disconnect QuickBooks before connecting Plaid for this store."
    );
  });

  it("falls back to a generic bank label when institution name is missing", () => {
    expect(formatPlaidConnectionLabel(null)).toBe("Bank connected");
    expect(formatPlaidConnectionLabel("")).toBe("Bank connected");
    expect(formatPlaidConnectionLabel("Chase")).toBe("Chase");
  });

  it("formats item error messages with friendly fallbacks", () => {
    expect(formatPlaidItemErrorMessage("ITEM_LOGIN_REQUIRED", null)).toContain("login details");
    expect(formatPlaidItemErrorMessage(null, "Custom bank error")).toBe("Custom bank error");
    expect(formatPlaidItemErrorMessage("UNKNOWN_CODE", null)).toContain("needs attention");
  });
});

describe("Plaid transaction normalization", () => {
  it("converts Plaid expense (positive amount) to app expense convention", () => {
    const result = normalizePlaidTransaction({
      transaction_id: "txn-1",
      date: "2026-01-15",
      name: "ACH DEBIT VENDOR",
      merchant_name: "Speed Queen Parts",
      amount: 125.5,
    });

    expect(result).toEqual({
      transaction_date: "2026-01-15",
      description: "Speed Queen Parts",
      amount: 125.5,
      transaction_type: "expense",
      plaid_transaction_id: "txn-1",
    });
  });

  it("converts Plaid income (negative amount) to app income convention", () => {
    const result = normalizePlaidTransaction({
      transaction_id: "txn-2",
      date: "2026-01-16",
      name: "MOBILE DEPOSIT",
      amount: -500,
    });

    expect(result).toEqual({
      transaction_date: "2026-01-16",
      description: "MOBILE DEPOSIT",
      amount: 500,
      transaction_type: "income",
      plaid_transaction_id: "txn-2",
    });
  });

  it("prefers merchant_name over name for description", () => {
    const result = normalizePlaidTransaction({
      transaction_id: "txn-3",
      date: "2026-01-17",
      name: "SQ *LAUNDROMAT",
      merchant_name: "  Main St Laundry  ",
      amount: 42,
    });

    expect(result.description).toBe("Main St Laundry");
  });
});

describe("Plaid sync status guards", () => {
  it("protects posted, reviewed, and user_classified rows from category overwrites", () => {
    expect(isPlaidSyncProtectedStatus("posted")).toBe(true);
    expect(isPlaidSyncProtectedStatus("reviewed")).toBe(true);
    expect(isPlaidSyncProtectedStatus("user_classified")).toBe(true);
    expect(isPlaidSyncProtectedStatus("needs_review")).toBe(false);
    expect(isPlaidSyncProtectedStatus(null)).toBe(false);
  });

  it("only blocks deletion for posted rows when Plaid removes a transaction", () => {
    expect(isPlaidSyncRemovableStatus("needs_review")).toBe(true);
    expect(isPlaidSyncRemovableStatus("user_classified")).toBe(true);
    expect(isPlaidSyncRemovableStatus("excluded")).toBe(true);
    expect(isPlaidSyncRemovableStatus("posted")).toBe(false);
    expect(isPlaidSyncRemovableStatus(null)).toBe(true);
  });
});
