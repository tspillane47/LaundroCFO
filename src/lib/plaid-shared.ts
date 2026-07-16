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

export type PlaidSyncResult = {
  added: number;
  modified: number;
  removed: number;
  skippedRemovedPosted: number;
};

/** Minimal Plaid transaction fields used for normalization (testable without server imports). */
export type PlaidTransactionLike = {
  transaction_id: string;
  date: string;
  name: string;
  merchant_name?: string | null;
  amount: number;
};

export type NormalizedPlaidTransaction = {
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: "income" | "expense";
  plaid_transaction_id: string;
};

/**
 * Plaid depository convention: positive amount = money out (expense), negative = money in (income).
 * App convention: positive amount + transaction_type income|expense.
 */
export function normalizePlaidTransaction(txn: PlaidTransactionLike): NormalizedPlaidTransaction {
  const description =
    txn.merchant_name?.trim() || txn.name?.trim() || "Unknown transaction";
  const transaction_type = txn.amount > 0 ? "expense" : txn.amount < 0 ? "income" : "expense";
  const amount = Math.abs(txn.amount);

  return {
    transaction_date: txn.date,
    description,
    amount,
    transaction_type,
    plaid_transaction_id: txn.transaction_id,
  };
}

/** Statuses where user review/classification should not be overwritten by Plaid sync. */
export function isPlaidSyncProtectedStatus(status: string | null | undefined): boolean {
  return status === "posted" || status === "reviewed" || status === "user_classified";
}

/** Unposted statuses eligible for deletion when Plaid retracts a pending transaction. */
export function isPlaidSyncRemovableStatus(status: string | null | undefined): boolean {
  return (status ?? "needs_review") !== "posted";
}
