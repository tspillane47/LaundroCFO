export const PLAID_QUICKBOOKS_BLOCK_MESSAGE =
  "Disconnect QuickBooks before connecting Plaid for this store.";

export const PLAID_CONNECT_TRUST = {
  title: "Your bank connection is secure",
  cardHint: "Secured by Plaid · Read-only access",
  intro:
    "This uses Plaid, the same secure technology trusted by Venmo and most banking apps.",
  points: [
    "Read-only — LaundroCFO can see transactions, but cannot move money or make any changes.",
    "Your bank login stays with Plaid. LaundroCFO never sees or stores your credentials.",
  ],
  continueLabel: "Continue with Plaid",
  cancelLabel: "Not now",
} as const;

export type FinancialDataSourceLike = "manual" | "quickbooks" | "bank_import" | null;

export function isQuickBooksDataSource(source: FinancialDataSourceLike): boolean {
  return source === "quickbooks";
}

export function formatPlaidConnectionLabel(institutionName: string | null | undefined): string {
  return institutionName?.trim() || "Bank connected";
}

export const DEFAULT_PLAID_WEBHOOK_URL = "https://www.laundrocfo.com/api/webhooks/plaid";

export const DEFAULT_PLAID_REDIRECT_URI = "https://www.laundrocfo.com/financials";

export const PLAID_LINK_ACCOUNTS_REQUIRED_MESSAGE = "No bank accounts were selected";

export const PLAID_LINK_ACCOUNT_FILTERS = {
  depository: { account_subtypes: ["checking", "savings"] },
  credit: { account_subtypes: ["credit card"] },
} as const;

export type PlaidLinkSuccessAccountLike = {
  id: string;
  name?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
};

export type PlaidLinkSelectedAccount = {
  plaid_account_id: string;
  account_name: string;
  mask: string | null;
  account_type: string;
  account_subtype: string | null;
};

export type PlaidLinkSelectedAccountRow = PlaidLinkSelectedAccount & {
  plaid_connection_id: string;
  store_id: string;
  included: true;
  selected_via_link: true;
};

export class PlaidLinkAccountsRequiredError extends Error {
  constructor(message = PLAID_LINK_ACCOUNTS_REQUIRED_MESSAGE) {
    super(message);
    this.name = "PlaidLinkAccountsRequiredError";
  }
}

export function buildPlaidLinkTokenAccountOptions(params: {
  customizationName?: string | null;
  includeAccountFilters: boolean;
}): {
  account_filters?: typeof PLAID_LINK_ACCOUNT_FILTERS;
  link_customization_name?: string;
} {
  const customizationName = params.customizationName?.trim();
  return {
    ...(params.includeAccountFilters ? { account_filters: PLAID_LINK_ACCOUNT_FILTERS } : {}),
    ...(customizationName ? { link_customization_name: customizationName } : {}),
  };
}

export function mapPlaidLinkSuccessAccounts(
  metadata: { accounts?: PlaidLinkSuccessAccountLike[] | null }
): PlaidLinkSuccessAccountLike[] {
  return (metadata.accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name ?? null,
    mask: account.mask ?? null,
    type: account.type ?? null,
    subtype: account.subtype ?? null,
  }));
}

function readLinkAccountId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as { id?: unknown; plaid_account_id?: unknown };
  const raw = typeof record.id === "string" ? record.id : record.plaid_account_id;
  const id = typeof raw === "string" ? raw.trim() : "";
  return id || null;
}

export function parsePlaidLinkSelectedAccounts(input: unknown): PlaidLinkSelectedAccount[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new PlaidLinkAccountsRequiredError();
  }

  const accounts: PlaidLinkSelectedAccount[] = [];
  for (const item of input) {
    const plaidAccountId = readLinkAccountId(item);
    if (!plaidAccountId) {
      throw new PlaidLinkAccountsRequiredError();
    }
    if (typeof item !== "object" || item === null) {
      throw new PlaidLinkAccountsRequiredError();
    }
    const record = item as {
      name?: unknown;
      account_name?: unknown;
      mask?: unknown;
      type?: unknown;
      account_type?: unknown;
      subtype?: unknown;
      account_subtype?: unknown;
    };
    const rawName =
      (typeof record.name === "string" && record.name.trim()) ||
      (typeof record.account_name === "string" && record.account_name.trim()) ||
      "";
    const rawType =
      (typeof record.type === "string" && record.type.trim()) ||
      (typeof record.account_type === "string" && record.account_type.trim()) ||
      "";
    const rawSubtype =
      (typeof record.subtype === "string" && record.subtype.trim()) ||
      (typeof record.account_subtype === "string" && record.account_subtype.trim()) ||
      "";
    const rawMask = typeof record.mask === "string" ? record.mask.trim() : "";

    accounts.push({
      plaid_account_id: plaidAccountId,
      account_name: rawName || "Bank account",
      mask: rawMask || null,
      account_type: rawType || "depository",
      account_subtype: rawSubtype || null,
    });
  }

  return accounts;
}

export function parseOptionalPlaidLinkSelectedAccounts(
  input: unknown
): PlaidLinkSelectedAccount[] | null {
  if (input === undefined || input === null) {
    return null;
  }
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }
  try {
    return parsePlaidLinkSelectedAccounts(input);
  } catch {
    return null;
  }
}

export function buildPlaidLinkSelectedAccountRows(params: {
  connectionId: string;
  storeId: string;
  accounts: PlaidLinkSelectedAccount[];
}): PlaidLinkSelectedAccountRow[] {
  return params.accounts.map((account) => ({
    plaid_connection_id: params.connectionId,
    store_id: params.storeId,
    plaid_account_id: account.plaid_account_id,
    account_name: account.account_name,
    mask: account.mask,
    account_type: account.account_type,
    account_subtype: account.account_subtype,
    included: true,
    selected_via_link: true,
  }));
}

/** Item error codes that Plaid resolves via Link update mode (re-auth without a new Item). */
export function isPlaidUpdateModeEligible(
  errorCode: string | null | undefined
): boolean {
  switch (errorCode) {
    case "ITEM_LOGIN_REQUIRED":
    case "PENDING_EXPIRATION":
    case "PENDING_DISCONNECT":
    case "USER_PERMISSION_REVOKED":
      return true;
    case "ITEM_NOT_FOUND":
    case "INVALID_UPDATED_USERNAME":
      return false;
    default:
      return Boolean(errorCode?.trim());
  }
}

export function formatPlaidItemErrorMessage(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined
): string {
  if (errorMessage?.trim()) {
    return errorMessage.trim();
  }

  switch (errorCode) {
    case "ITEM_LOGIN_REQUIRED":
      return "Your bank login details have changed and need to be updated.";
    case "USER_PERMISSION_REVOKED":
      return "Access to this bank account was revoked.";
    case "PENDING_EXPIRATION":
    case "PENDING_DISCONNECT":
      return "Your bank connection is about to expire and needs to be refreshed.";
    default:
      return "Your bank connection needs attention.";
  }
}

export type PlaidBalanceSyncResult = {
  accountsSynced: number;
  accountsRemoved: number;
  ok: boolean;
  error?: string;
};

export const EMPTY_PLAID_BALANCE_SYNC_RESULT: PlaidBalanceSyncResult = {
  accountsSynced: 0,
  accountsRemoved: 0,
  ok: true,
};

export type PlaidSyncResult = {
  added: number;
  reconciled: number;
  modified: number;
  removed: number;
  skippedRemovedPosted: number;
  balances: PlaidBalanceSyncResult;
};

export type PlaidAccountBalanceRow = {
  account_type: string;
  current_balance: number | string;
  last_synced_at?: string | null;
};

export type PlaidAccountBalanceRowWithStore = PlaidAccountBalanceRow & {
  store_id: string;
};

/** Sum depository account balances for a store's synced Plaid accounts. */
export function sumPlaidCashOnHand(accounts: PlaidAccountBalanceRow[]): number {
  return accounts
    .filter((account) => account.account_type === "depository")
    .reduce((sum, account) => sum + Number(account.current_balance ?? 0), 0);
}

/** Sum credit account balances for a store's synced Plaid accounts (net debt, not clamped). */
export function sumPlaidCreditCardDebt(accounts: PlaidAccountBalanceRow[]): number {
  return accounts
    .filter((account) => account.account_type === "credit")
    .reduce((sum, account) => sum + Number(account.current_balance ?? 0), 0);
}

export function countPlaidAccountsByType(accounts: PlaidAccountBalanceRow[], accountType: string): number {
  return accounts.filter((account) => account.account_type === accountType).length;
}

export function getLatestPlaidAccountSyncAt(accounts: PlaidAccountBalanceRow[]): string | null {
  let latest: string | null = null;

  for (const account of accounts) {
    const syncedAt = account.last_synced_at;
    if (!syncedAt) continue;
    if (!latest || syncedAt > latest) {
      latest = syncedAt;
    }
  }

  return latest;
}

export type PlaidBalanceSnapshot = {
  cashOnHand: number;
  creditCardDebt: number;
  depositoryAccountCount: number;
  creditAccountCount: number;
  lastSyncedAt: string | null;
};

export function buildPlaidBalanceSnapshot(accounts: PlaidAccountBalanceRow[]): PlaidBalanceSnapshot {
  return {
    cashOnHand: sumPlaidCashOnHand(accounts),
    creditCardDebt: sumPlaidCreditCardDebt(accounts),
    depositoryAccountCount: countPlaidAccountsByType(accounts, "depository"),
    creditAccountCount: countPlaidAccountsByType(accounts, "credit"),
    lastSyncedAt: getLatestPlaidAccountSyncAt(accounts),
  };
}

export type PortfolioPlaidBalanceSnapshot = PlaidBalanceSnapshot & {
  connectedStoreCount: number;
};

export function buildPortfolioPlaidBalanceSnapshot(
  accounts: PlaidAccountBalanceRowWithStore[],
  connectedStoreCount: number
): PortfolioPlaidBalanceSnapshot {
  return {
    ...buildPlaidBalanceSnapshot(accounts),
    connectedStoreCount,
  };
}

export function groupPlaidBalanceSnapshotsByStore(
  accounts: PlaidAccountBalanceRowWithStore[]
): Record<string, PlaidBalanceSnapshot> {
  const accountsByStore: Record<string, PlaidAccountBalanceRow[]> = {};

  for (const account of accounts) {
    if (!accountsByStore[account.store_id]) {
      accountsByStore[account.store_id] = [];
    }
    accountsByStore[account.store_id].push(account);
  }

  const snapshotsByStoreId: Record<string, PlaidBalanceSnapshot> = {};
  for (const [storeId, storeAccounts] of Object.entries(accountsByStore)) {
    snapshotsByStoreId[storeId] = buildPlaidBalanceSnapshot(storeAccounts);
  }

  return snapshotsByStoreId;
}

/** Minimal Plaid transaction fields used for normalization (testable without server imports). */
export type PlaidTransactionLike = {
  transaction_id: string;
  date: string;
  name: string;
  merchant_name?: string | null;
  amount: number;
  pending_transaction_id?: string | null;
};

export type NormalizedPlaidTransaction = {
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: "income" | "expense";
  plaid_transaction_id: string;
  pending_transaction_id: string | null;
};

/** Max difference allowed when matching same-batch fallback reconciliations by amount. */
export const PLAID_AMOUNT_MATCH_TOLERANCE = 0.01;

export type ExistingPlaidBankRow = {
  id: string;
  plaid_transaction_id: string | null;
  status: string | null;
  description: string | null;
  transaction_date?: string | null;
  amount?: number | null;
};

export type PlaidAddedReconciliationPath = "pending_transaction_id" | "same_batch_fallback";

export type PlaidAddedReconciliationPlan =
  | { action: "insert"; txn: PlaidTransactionLike }
  | {
      action: "reconcile";
      txn: PlaidTransactionLike;
      existingRowId: string;
      path: PlaidAddedReconciliationPath;
      previousPlaidTransactionId: string;
    };

export function plaidAmountsMatch(
  left: number,
  right: number,
  tolerance = PLAID_AMOUNT_MATCH_TOLERANCE
): boolean {
  return Math.abs(left - right) <= tolerance;
}

export function isPlaidPostedTransitionRemovalCandidate(
  status: string | null | undefined
): boolean {
  return !isPlaidSyncRemovableStatus(status);
}

/**
 * Plaid depository convention: positive amount = money out (expense), negative = money in (income).
 * App convention: positive amount + transaction_type income|expense.
 */
export function normalizePlaidTransaction(txn: PlaidTransactionLike): NormalizedPlaidTransaction {
  const description =
    txn.merchant_name?.trim() || txn.name?.trim() || "Unknown transaction";
  const transaction_type = txn.amount > 0 ? "expense" : txn.amount < 0 ? "income" : "expense";
  const amount = Math.abs(txn.amount);

  const pendingTransactionId = txn.pending_transaction_id?.trim();

  return {
    transaction_date: txn.date,
    description,
    amount,
    transaction_type,
    plaid_transaction_id: txn.transaction_id,
    pending_transaction_id: pendingTransactionId ? pendingTransactionId : null,
  };
}

/**
 * Decide whether each added Plaid transaction should insert a new bank row or
 * reconcile onto an existing row (pending→posted ID migration).
 */
export function planPlaidAddedTransactions(params: {
  added: PlaidTransactionLike[];
  removedTransactionIds: string[];
  existingByPlaidId: Map<string, ExistingPlaidBankRow>;
}): PlaidAddedReconciliationPlan[] {
  const { added, removedTransactionIds, existingByPlaidId } = params;
  const usedExistingRowIds = new Set<string>();
  const usedRemovedIds = new Set<string>();
  const plans: PlaidAddedReconciliationPlan[] = [];

  for (const txn of added) {
    if (existingByPlaidId.has(txn.transaction_id)) {
      continue;
    }

    const normalized = normalizePlaidTransaction(txn);
    if (normalized.amount === 0) {
      continue;
    }

    const pendingMatch =
      normalized.pending_transaction_id &&
      existingByPlaidId.get(normalized.pending_transaction_id);

    if (pendingMatch && !usedExistingRowIds.has(pendingMatch.id)) {
      usedExistingRowIds.add(pendingMatch.id);
      plans.push({
        action: "reconcile",
        txn,
        existingRowId: pendingMatch.id,
        path: "pending_transaction_id",
        previousPlaidTransactionId: pendingMatch.plaid_transaction_id ?? normalized.pending_transaction_id!,
      });
      continue;
    }

    let fallbackMatch: ExistingPlaidBankRow | undefined;
    let fallbackRemovedId: string | undefined;

    for (const removedId of removedTransactionIds) {
      if (usedRemovedIds.has(removedId)) {
        continue;
      }

      const existing = existingByPlaidId.get(removedId);
      if (!existing || usedExistingRowIds.has(existing.id)) {
        continue;
      }

      if (!isPlaidPostedTransitionRemovalCandidate(existing.status)) {
        continue;
      }

      const existingDate = existing.transaction_date ?? null;
      const existingAmount = existing.amount ?? null;
      if (
        existingDate !== normalized.transaction_date ||
        existingAmount === null ||
        !plaidAmountsMatch(existingAmount, normalized.amount)
      ) {
        continue;
      }

      fallbackMatch = existing;
      fallbackRemovedId = removedId;
      break;
    }

    if (fallbackMatch && fallbackRemovedId) {
      usedExistingRowIds.add(fallbackMatch.id);
      usedRemovedIds.add(fallbackRemovedId);
      plans.push({
        action: "reconcile",
        txn,
        existingRowId: fallbackMatch.id,
        path: "same_batch_fallback",
        previousPlaidTransactionId: fallbackMatch.plaid_transaction_id ?? fallbackRemovedId,
      });
      continue;
    }

    plans.push({ action: "insert", txn });
  }

  return plans;
}

/** Statuses where user review/classification should not be overwritten by Plaid sync. */
export function isPlaidSyncProtectedStatus(status: string | null | undefined): boolean {
  return status === "posted" || status === "reviewed" || status === "user_classified";
}

/** Unposted statuses eligible for deletion when Plaid retracts a pending transaction. */
export function isPlaidSyncRemovableStatus(status: string | null | undefined): boolean {
  return (status ?? "needs_review") !== "posted";
}
