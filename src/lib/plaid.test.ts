import { describe, expect, it } from "vitest";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import {
  buildPlaidLinkSelectedAccountRows,
  buildPlaidLinkTokenAccountOptions,
  collectPlaidTransactionIdsToStamp,
  excludedPlaidAccountOrFilter,
  fetchExcludedPlaidAccountIds,
  fetchExcludedPlaidAccountIdsByStore,
  filterPlaidAddedTransactionsToIncludedAccounts,
  formatPlaidAccountMask,
  formatPlaidAccountTypeLabel,
  formatPlaidConnectionLabel,
  formatPlaidItemErrorMessage,
  isBankTransactionVisibleForExcludedPlaidAccounts,
  isPlaidAccountIncluded,
  isPlaidSyncProtectedStatus,
  isPlaidSyncRemovableStatus,
  isPlaidUpdateModeEligible,
  isQuickBooksDataSource,
  mapPlaidLinkSuccessAccounts,
  normalizePlaidTransaction,
  parsePlaidLinkSelectedAccounts,
  planPlaidAccountBalanceWrites,
  planPlaidAddedTransactions,
  plaidAccountStampDateWindow,
  PLAID_ACCOUNT_STAMP_LOOKBACK_DAYS,
  PLAID_CONNECT_TRUST,
  PLAID_LINK_ACCOUNT_FILTERS,
  PLAID_LINK_ACCOUNTS_REQUIRED_MESSAGE,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
  PlaidLinkAccountsRequiredError,
  sumPlaidCashOnHand,
  sumPlaidCreditCardDebt,
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
      plaid_account_id: null,
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
      plaid_account_id: null,
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

  it("stamps plaid_account_id from the Plaid transaction", () => {
    const result = normalizePlaidTransaction({
      transaction_id: "txn-4",
      date: "2026-01-18",
      name: "CCD Deposit",
      amount: -484.75,
      account_id: "community-checking",
    });

    expect(result.plaid_account_id).toBe("community-checking");
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

const WATERBURY_ACCOUNTS = [
  {
    plaid_account_id: "eastrise-checking",
    included: true,
    account_type: "depository",
    current_balance: 14134.6,
  },
  {
    plaid_account_id: "community-checking",
    included: true,
    account_type: "depository",
    current_balance: 26847.81,
  },
  {
    plaid_account_id: "spark-cash",
    included: true,
    account_type: "credit",
    current_balance: 11595.62,
  },
] as const;

describe("Plaid included-account filtering", () => {
  it("is fail-closed for unknown, omitted, and excluded account ids", () => {
    expect(isPlaidAccountIncluded("eastrise-checking", WATERBURY_ACCOUNTS)).toBe(true);
    expect(isPlaidAccountIncluded("personal-checking", WATERBURY_ACCOUNTS)).toBe(false);
    expect(isPlaidAccountIncluded(null, WATERBURY_ACCOUNTS)).toBe(false);
    expect(isPlaidAccountIncluded("personal-checking", [
      { plaid_account_id: "personal-checking", included: false },
    ])).toBe(false);
  });

  it("is a no-op for Waterbury's already-included accounts", () => {
    const added = [
      { transaction_id: "eastrise-1", account_id: "eastrise-checking" },
      { transaction_id: "community-1", account_id: "community-checking" },
      { transaction_id: "spark-1", account_id: "spark-cash" },
    ];

    expect(filterPlaidAddedTransactionsToIncludedAccounts(added, [...WATERBURY_ACCOUNTS])).toEqual(
      added
    );
    expect(sumPlaidCashOnHand([...WATERBURY_ACCOUNTS])).toBeCloseTo(14134.6 + 26847.81, 2);
    expect(sumPlaidCreditCardDebt([...WATERBURY_ACCOUNTS])).toBeCloseTo(11595.62, 2);

    const plans = planPlaidAddedTransactions({
      added: filterPlaidAddedTransactionsToIncludedAccounts(
        [
          {
            transaction_id: "community-1",
            account_id: "community-checking",
            date: "2026-08-25",
            name: "CCD Deposit",
            amount: -484.75,
          },
        ],
        [...WATERBURY_ACCOUNTS]
      ),
      removedTransactionIds: [],
      existingByPlaidId: new Map(),
    });
    expect(plans).toEqual([
      {
        action: "insert",
        txn: expect.objectContaining({
          transaction_id: "community-1",
          account_id: "community-checking",
        }),
      },
    ]);

    const balancePlan = planPlaidAccountBalanceWrites({
      connectionId: "community-conn",
      storeId: "ec20b2ce-2951-4cf0-9e1c-cf5ee53bb056",
      syncedAt: "2026-08-31T00:00:00.000Z",
      existingRows: [{ id: "row-community", plaid_account_id: "community-checking" }],
      accounts: [
        {
          account_id: "community-checking",
          name: "CKCARBUS 0001",
          type: "depository",
          subtype: "checking",
          mask: "1884",
          balances: { current: 26847.81, available: 26847.81 },
        },
      ],
    });
    expect(balancePlan.updates).toHaveLength(1);
    expect(balancePlan.inserts).toHaveLength(0);
    expect(balancePlan.updates[0]).not.toHaveProperty("included");
    expect(balancePlan.staleIds).toEqual([]);
  });

  it("drops excluded and unknown accounts before insert planning", () => {
    const added = [
      {
        transaction_id: "business-1",
        account_id: "community-checking",
        date: "2026-08-25",
        name: "CCD Deposit",
        amount: -100,
      },
      {
        transaction_id: "personal-1",
        account_id: "personal-checking",
        date: "2026-08-25",
        name: "GROCERY",
        amount: 42,
      },
      {
        transaction_id: "unknown-1",
        account_id: "not-on-item",
        date: "2026-08-25",
        name: "UNKNOWN",
        amount: 10,
      },
    ];

    const accounts = [
      ...WATERBURY_ACCOUNTS,
      { plaid_account_id: "personal-checking", included: false },
    ];
    const included = filterPlaidAddedTransactionsToIncludedAccounts(added, accounts);

    expect(included.map((txn) => txn.transaction_id)).toEqual(["business-1"]);
    expect(
      planPlaidAddedTransactions({
        added: included,
        removedTransactionIds: [],
        existingByPlaidId: new Map(),
      }).map((plan) => plan.action === "insert" && plan.txn.transaction_id)
    ).toEqual(["business-1"]);
  });

  it("inserts newly discovered accountsGet rows as included: false", () => {
    const plan = planPlaidAccountBalanceWrites({
      connectionId: "eastrise-conn",
      storeId: "ec20b2ce-2951-4cf0-9e1c-cf5ee53bb056",
      syncedAt: "2026-08-31T00:00:00.000Z",
      existingRows: [{ id: "row-business", plaid_account_id: "eastrise-checking" }],
      accounts: [
        {
          account_id: "eastrise-checking",
          name: "Business Basic Checking",
          type: "depository",
          subtype: "checking",
          mask: "6849",
          balances: { current: 14134.6, available: 14134.6 },
        },
        {
          account_id: "eastrise-personal",
          name: "Personal Checking",
          type: "depository",
          subtype: "checking",
          mask: "0001",
          balances: { current: 800, available: 800 },
        },
      ],
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].plaid_account_id).toBe("eastrise-checking");
    expect(plan.updates[0]).not.toHaveProperty("included");
    expect(plan.inserts).toEqual([
      expect.objectContaining({
        plaid_account_id: "eastrise-personal",
        included: false,
        selected_via_link: false,
      }),
    ]);
  });

  it("does not add excluded depository balances to cash", () => {
    expect(
      sumPlaidCashOnHand([
        ...WATERBURY_ACCOUNTS,
        {
          plaid_account_id: "personal-checking",
          included: false,
          account_type: "depository",
          current_balance: 50_000,
        },
      ])
    ).toBeCloseTo(14134.6 + 26847.81, 2);
  });
});

describe("Plaid account-exclude visibility", () => {
  it("is a Waterbury no-op when nobody has excluded an account", () => {
    expect(excludedPlaidAccountOrFilter([])).toBeNull();
    expect(
      isBankTransactionVisibleForExcludedPlaidAccounts({ plaid_account_id: null }, [])
    ).toBe(true);
    expect(
      isBankTransactionVisibleForExcludedPlaidAccounts(
        { plaid_account_id: "eastrise-checking" },
        []
      )
    ).toBe(true);
    expect(
      isBankTransactionVisibleForExcludedPlaidAccounts(
        { plaid_account_id: "community-checking" },
        []
      )
    ).toBe(true);
    expect(
      isBankTransactionVisibleForExcludedPlaidAccounts({ plaid_account_id: "spark-cash" }, [])
    ).toBe(true);
  });

  it("fails open on unstamped or CSV rows when another account is excluded", () => {
    expect(
      isBankTransactionVisibleForExcludedPlaidAccounts({ plaid_account_id: null }, [
        "personal-checking",
      ])
    ).toBe(true);
    expect(
      isBankTransactionVisibleForExcludedPlaidAccounts({ plaid_account_id: "" }, [
        "personal-checking",
      ])
    ).toBe(true);
    expect(
      isBankTransactionVisibleForExcludedPlaidAccounts(
        { plaid_account_id: "eastrise-checking" },
        ["personal-checking"]
      )
    ).toBe(true);
  });

  it("hides rows stamped to an excluded account", () => {
    expect(
      isBankTransactionVisibleForExcludedPlaidAccounts(
        { plaid_account_id: "personal-checking" },
        ["personal-checking"]
      )
    ).toBe(false);
    expect(excludedPlaidAccountOrFilter(["personal-checking"])).toBe(
      "plaid_account_id.is.null,plaid_account_id.not.in.(personal-checking)"
    );
  });

  it("stamps from a date-windowed transactionsGet page, not a cursor change", () => {
    const window = plaidAccountStampDateWindow(new Date("2026-08-31T12:00:00.000Z"));
    expect(window.end_date).toBe("2026-08-31");
    expect(window.start_date).toBe("2023-09-01");
    expect(PLAID_ACCOUNT_STAMP_LOOKBACK_DAYS).toBe(1095);
    expect(
      collectPlaidTransactionIdsToStamp([
        { transaction_id: "txn-1" },
        { transaction_id: "txn-1" },
        { transaction_id: null },
        { transaction_id: " txn-2 " },
      ])
    ).toEqual(["txn-1", "txn-2"]);
  });

  it("formats account type and mask for Bank Import", () => {
    expect(formatPlaidAccountTypeLabel("depository", "checking")).toBe("Checking");
    expect(formatPlaidAccountTypeLabel("credit", "credit card")).toBe("Credit card");
    expect(formatPlaidAccountMask("6849")).toBe("••••6849");
    expect(formatPlaidAccountMask(null)).toBe("••••");
  });

  it("loads no extra excluded ids for Waterbury-style included accounts", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
          in: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    };

    await expect(fetchExcludedPlaidAccountIds(supabase, "waterbury")).resolves.toEqual([]);
    await expect(
      fetchExcludedPlaidAccountIdsByStore(supabase, ["waterbury"])
    ).resolves.toEqual({ waterbury: [] });
    expect(excludedPlaidAccountOrFilter([])).toBeNull();
  });
});
