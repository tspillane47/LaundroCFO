export const PLAID_QUICKBOOKS_BLOCK_MESSAGE =
  "Disconnect QuickBooks before connecting Plaid for this store.";

export type FinancialDataSourceLike = "manual" | "quickbooks" | "bank_import" | null;

export function isQuickBooksDataSource(source: FinancialDataSourceLike): boolean {
  return source === "quickbooks";
}

export function formatPlaidConnectionLabel(institutionName: string | null | undefined): string {
  return institutionName?.trim() || "Bank connected";
}

export const DEFAULT_PLAID_WEBHOOK_URL = "https://www.laundrocfo.com/api/webhooks/plaid";

export const DEFAULT_PLAID_REDIRECT_URI = "https://www.laundrocfo.com/financials";

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
