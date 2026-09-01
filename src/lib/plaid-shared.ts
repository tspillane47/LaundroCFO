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
  included?: boolean | null;
  plaid_account_id?: string;
};

export type PlaidAccountBalanceRowWithStore = PlaidAccountBalanceRow & {
  store_id: string;
};

export type PlaidAccountInclusionRow = {
  plaid_account_id: string;
  included?: boolean | null;
};

/** Missing `included` is treated as true so older snapshots/tests stay valid. */
export function isPlaidAccountIncludedForBalances(
  account: Pick<PlaidAccountBalanceRow, "included">
): boolean {
  return account.included !== false;
}

export function includedPlaidAccountsForBalances(
  accounts: PlaidAccountBalanceRow[]
): PlaidAccountBalanceRow[] {
  return accounts.filter(isPlaidAccountIncludedForBalances);
}

/** Fail-closed: unknown or omitted account ids are not included. */
export function isPlaidAccountIncluded(
  accountId: string | null | undefined,
  accounts: PlaidAccountInclusionRow[]
): boolean {
  const id = accountId?.trim();
  if (!id) {
    return false;
  }
  return accounts.some((account) => account.plaid_account_id === id && account.included === true);
}

export function filterPlaidAddedTransactionsToIncludedAccounts<
  T extends { account_id?: string | null },
>(added: T[], accounts: PlaidAccountInclusionRow[]): T[] {
  return added.filter((txn) => isPlaidAccountIncluded(txn.account_id, accounts));
}

export const PLAID_ACCOUNT_STAMP_LOOKBACK_DAYS = 1095;

/** Fail-open: unstamped / CSV rows stay visible. Empty excluded list is a no-op. */
export function isBankTransactionVisibleForExcludedPlaidAccounts(
  txn: { plaid_account_id?: string | null },
  excludedAccountIds: readonly string[]
): boolean {
  if (excludedAccountIds.length === 0) {
    return true;
  }
  const id = txn.plaid_account_id?.trim();
  if (!id) {
    return true;
  }
  return !excludedAccountIds.includes(id);
}

export function excludedPlaidAccountOrFilter(excludedAccountIds: readonly string[]): string | null {
  const ids = Array.from(
    new Set(excludedAccountIds.map((id) => id.trim()).filter(Boolean))
  );
  if (ids.length === 0) {
    return null;
  }
  return `plaid_account_id.is.null,plaid_account_id.not.in.(${ids.join(",")})`;
}

type ExcludedPlaidAccountRow = {
  store_id?: string | null;
  plaid_account_id?: string | null;
};

type ExcludedPlaidAccountsQuery = {
  eq: (column: string, value: string | boolean) => ExcludedPlaidAccountsQuery & Promise<ExcludedPlaidAccountsResult>;
  in: (column: string, values: readonly string[]) => ExcludedPlaidAccountsQuery;
};

type ExcludedPlaidAccountsResult = {
  data: ExcludedPlaidAccountRow[] | null;
  error: { message: string } | null;
};

type ExcludedPlaidAccountsClient = {
  from: (table: string) => {
    select: (columns: string) => ExcludedPlaidAccountsQuery;
  };
};

function asExcludedPlaidAccountsClient(supabase: unknown): ExcludedPlaidAccountsClient {
  return supabase as ExcludedPlaidAccountsClient;
}

export async function fetchExcludedPlaidAccountIds(
  supabase: unknown,
  storeId: string
): Promise<string[]> {
  const { data, error } = await asExcludedPlaidAccountsClient(supabase)
    .from("plaid_accounts")
    .select("plaid_account_id")
    .eq("store_id", storeId)
    .eq("included", false);

  if (error) {
    throw new Error(`Failed to load excluded Plaid accounts: ${error.message}`);
  }

  return (data ?? [])
    .map((row: ExcludedPlaidAccountRow) => row.plaid_account_id?.trim())
    .filter((id): id is string => Boolean(id));
}

export async function fetchExcludedPlaidAccountIdsByStore(
  supabase: unknown,
  storeIds: string[]
): Promise<Record<string, string[]>> {
  const idsByStore: Record<string, string[]> = Object.fromEntries(storeIds.map((id) => [id, []]));
  if (storeIds.length === 0) {
    return idsByStore;
  }

  const { data, error } = await asExcludedPlaidAccountsClient(supabase)
    .from("plaid_accounts")
    .select("store_id, plaid_account_id")
    .in("store_id", storeIds)
    .eq("included", false);

  if (error) {
    throw new Error(`Failed to load excluded Plaid accounts: ${error.message}`);
  }

  for (const row of (data ?? []) as ExcludedPlaidAccountRow[]) {
    const storeId = row.store_id?.trim();
    const accountId = row.plaid_account_id?.trim();
    if (!storeId || !accountId) continue;
    if (!idsByStore[storeId]) idsByStore[storeId] = [];
    idsByStore[storeId].push(accountId);
  }

  return idsByStore;
}

export function plaidAccountStampDateWindow(
  now = new Date(),
  lookbackDays = PLAID_ACCOUNT_STAMP_LOOKBACK_DAYS
): { start_date: string; end_date: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - lookbackDays);
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  };
}

export function collectPlaidTransactionIdsToStamp(
  transactions: Array<{ transaction_id?: string | null }>
): string[] {
  return Array.from(
    new Set(
      transactions
        .map((txn) => txn.transaction_id?.trim())
        .filter((id): id is string => Boolean(id))
    )
  );
}

export function formatPlaidAccountTypeLabel(
  type: string | null | undefined,
  subtype?: string | null
): string {
  const sub = subtype?.trim().toLowerCase();
  if (sub === "credit card") return "Credit card";
  if (sub === "checking") return "Checking";
  if (sub === "savings") return "Savings";
  if (sub) {
    return sub.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  if (type === "depository") return "Depository";
  if (type === "credit") return "Credit";
  return type?.trim() || "Account";
}

export function formatPlaidAccountMask(mask?: string | null): string {
  const digits = mask?.replace(/\D/g, "").slice(-4);
  return digits ? `••••${digits}` : "••••";
}

/** Sum depository account balances for a store's synced Plaid accounts. */
export function sumPlaidCashOnHand(accounts: PlaidAccountBalanceRow[]): number {
  return includedPlaidAccountsForBalances(accounts)
    .filter((account) => account.account_type === "depository")
    .reduce((sum, account) => sum + Number(account.current_balance ?? 0), 0);
}

/** Sum credit account balances for a store's synced Plaid accounts (net debt, not clamped). */
export function sumPlaidCreditCardDebt(accounts: PlaidAccountBalanceRow[]): number {
  return includedPlaidAccountsForBalances(accounts)
    .filter((account) => account.account_type === "credit")
    .reduce((sum, account) => sum + Number(account.current_balance ?? 0), 0);
}

export function countPlaidAccountsByType(accounts: PlaidAccountBalanceRow[], accountType: string): number {
  return includedPlaidAccountsForBalances(accounts).filter(
    (account) => account.account_type === accountType
  ).length;
}

export function getLatestPlaidAccountSyncAt(accounts: PlaidAccountBalanceRow[]): string | null {
  let latest: string | null = null;

  for (const account of includedPlaidAccountsForBalances(accounts)) {
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

export type PlaidAccountsGetLike = {
  account_id: string;
  name: string;
  type: string;
  subtype?: string | null;
  mask?: string | null;
  balances: {
    current?: number | null;
    available?: number | null;
  };
};

export type ExistingPlaidAccountBalanceRow = {
  id: string;
  plaid_account_id: string;
};

export type PlaidAccountBalanceWriteRow = {
  plaid_connection_id: string;
  store_id: string;
  plaid_account_id: string;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  mask: string | null;
  current_balance: number;
  available_balance: number | null;
  last_synced_at: string;
};

export type PlaidAccountBalanceInsertRow = PlaidAccountBalanceWriteRow & {
  included: false;
  selected_via_link: false;
};

export function planPlaidAccountBalanceWrites(params: {
  connectionId: string;
  storeId: string;
  syncedAt: string;
  accounts: PlaidAccountsGetLike[];
  existingRows: ExistingPlaidAccountBalanceRow[];
}): {
  updates: PlaidAccountBalanceWriteRow[];
  inserts: PlaidAccountBalanceInsertRow[];
  staleIds: string[];
} {
  const existingByPlaidId = new Map(
    params.existingRows.map((row) => [row.plaid_account_id, row] as const)
  );
  const returnedIds = new Set(params.accounts.map((account) => account.account_id));

  const updates: PlaidAccountBalanceWriteRow[] = [];
  const inserts: PlaidAccountBalanceInsertRow[] = [];

  for (const account of params.accounts) {
    const row: PlaidAccountBalanceWriteRow = {
      plaid_connection_id: params.connectionId,
      store_id: params.storeId,
      plaid_account_id: account.account_id,
      account_name: account.name,
      account_type: account.type,
      account_subtype: account.subtype ?? null,
      mask: account.mask ?? null,
      current_balance: account.balances.current ?? 0,
      available_balance: account.balances.available ?? null,
      last_synced_at: params.syncedAt,
    };

    if (existingByPlaidId.has(account.account_id)) {
      updates.push(row);
    } else {
      inserts.push({
        ...row,
        included: false,
        selected_via_link: false,
      });
    }
  }

  return {
    updates,
    inserts,
    staleIds: params.existingRows
      .filter((row) => !returnedIds.has(row.plaid_account_id))
      .map((row) => row.id),
  };
}

/** Minimal Plaid transaction fields used for normalization (testable without server imports). */
export type PlaidTransactionLike = {
  transaction_id: string;
  date: string;
  name: string;
  merchant_name?: string | null;
  amount: number;
  pending_transaction_id?: string | null;
  account_id?: string | null;
};

export type NormalizedPlaidTransaction = {
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: "income" | "expense";
  plaid_transaction_id: string;
  pending_transaction_id: string | null;
  plaid_account_id: string | null;
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
  const plaidAccountId = txn.account_id?.trim();

  return {
    transaction_date: txn.date,
    description,
    amount,
    transaction_type,
    plaid_transaction_id: txn.transaction_id,
    pending_transaction_id: pendingTransactionId ? pendingTransactionId : null,
    plaid_account_id: plaidAccountId ? plaidAccountId : null,
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
