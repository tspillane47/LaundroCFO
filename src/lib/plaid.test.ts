import { describe, expect, it } from "vitest";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import {
  buildPlaidLinkSelectedAccountRows,
  buildPlaidLinkTokenAccountOptions,
  formatPlaidConnectionLabel,
  formatPlaidItemErrorMessage,
  isPlaidSyncProtectedStatus,
  isPlaidSyncRemovableStatus,
  isPlaidUpdateModeEligible,
  isQuickBooksDataSource,
  mapPlaidLinkSuccessAccounts,
  normalizePlaidTransaction,
  parsePlaidLinkSelectedAccounts,
  PLAID_CONNECT_TRUST,
  PLAID_LINK_ACCOUNT_FILTERS,
  PLAID_LINK_ACCOUNTS_REQUIRED_MESSAGE,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
  PlaidLinkAccountsRequiredError,
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

  it("explains Plaid trust in a short, read-only reassurance", () => {
    expect(PLAID_CONNECT_TRUST.title).toMatch(/secure/i);
    expect(PLAID_CONNECT_TRUST.intro).toMatch(/Plaid/);
    expect(PLAID_CONNECT_TRUST.intro).toMatch(/Venmo/);
    expect(PLAID_CONNECT_TRUST.points.join(" ")).toMatch(/read-only/i);
    expect(PLAID_CONNECT_TRUST.points.join(" ")).toMatch(/cannot move money/i);
    expect(PLAID_CONNECT_TRUST.points.join(" ")).toMatch(/never sees or stores/i);
    expect(PLAID_CONNECT_TRUST.continueLabel).toBe("Continue with Plaid");
    expect(PLAID_CONNECT_TRUST.cardHint).toBe("Secured by Plaid · Read-only access");
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

  it("identifies item errors eligible for Plaid update mode", () => {
    expect(isPlaidUpdateModeEligible("ITEM_LOGIN_REQUIRED")).toBe(true);
    expect(isPlaidUpdateModeEligible("PENDING_EXPIRATION")).toBe(true);
    expect(isPlaidUpdateModeEligible("USER_PERMISSION_REVOKED")).toBe(true);
    expect(isPlaidUpdateModeEligible("ITEM_NOT_FOUND")).toBe(false);
    expect(isPlaidUpdateModeEligible("INVALID_UPDATED_USERNAME")).toBe(false);
    expect(isPlaidUpdateModeEligible(null)).toBe(false);
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
      pending_transaction_id: null,
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
      pending_transaction_id: null,
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

describe("Plaid Link account selection", () => {
  it("includes checking/savings and credit card filters on new-item tokens", () => {
    const options = buildPlaidLinkTokenAccountOptions({ includeAccountFilters: true });

    expect(options.account_filters).toEqual({
      depository: { account_subtypes: ["checking", "savings"] },
      credit: { account_subtypes: ["credit card"] },
    });
    expect(options.account_filters).toEqual(PLAID_LINK_ACCOUNT_FILTERS);
    expect(options).not.toHaveProperty("link_customization_name");
  });

  it("adds link_customization_name when set and omits filters in update mode", () => {
    expect(
      buildPlaidLinkTokenAccountOptions({
        includeAccountFilters: true,
        customizationName: "  laundrocfo_multi_select  ",
      })
    ).toEqual({
      account_filters: PLAID_LINK_ACCOUNT_FILTERS,
      link_customization_name: "laundrocfo_multi_select",
    });

    expect(
      buildPlaidLinkTokenAccountOptions({
        includeAccountFilters: false,
        customizationName: "laundrocfo_multi_select",
      })
    ).toEqual({
      link_customization_name: "laundrocfo_multi_select",
    });
  });

  it("rejects missing or empty Link account selections", () => {
    expect(() => parsePlaidLinkSelectedAccounts(undefined)).toThrow(PlaidLinkAccountsRequiredError);
    expect(() => parsePlaidLinkSelectedAccounts([])).toThrow(PLAID_LINK_ACCOUNTS_REQUIRED_MESSAGE);
    expect(() => parsePlaidLinkSelectedAccounts([{ name: "Checking" }])).toThrow(
      PLAID_LINK_ACCOUNTS_REQUIRED_MESSAGE
    );
  });

  it("builds upsert rows with selected Link account fields", () => {
    const accounts = parsePlaidLinkSelectedAccounts([
      {
        id: "acc-checking",
        name: "Business Basic Checking",
        mask: "6849",
        type: "depository",
        subtype: "checking",
      },
    ]);

    expect(
      buildPlaidLinkSelectedAccountRows({
        connectionId: "conn-1",
        storeId: "store-1",
        accounts,
      })
    ).toEqual([
      {
        plaid_connection_id: "conn-1",
        store_id: "store-1",
        plaid_account_id: "acc-checking",
        account_name: "Business Basic Checking",
        mask: "6849",
        account_type: "depository",
        account_subtype: "checking",
        included: true,
        selected_via_link: true,
      },
    ]);
  });

  it("maps onSuccess metadata.accounts for the exchange-token request", () => {
    const metadata = {
      institution: { name: "Community Bank N.A.", institution_id: "ins_1" },
      accounts: [
        {
          id: "acc-1",
          name: "CKCARBUS 0001",
          mask: "1884",
          type: "depository",
          subtype: "checking",
        },
      ],
      link_session_id: "session-1",
    } as PlaidLinkOnSuccessMetadata;

    expect(mapPlaidLinkSuccessAccounts(metadata)).toEqual([
      {
        id: "acc-1",
        name: "CKCARBUS 0001",
        mask: "1884",
        type: "depository",
        subtype: "checking",
      },
    ]);
  });
});
