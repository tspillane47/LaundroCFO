import "server-only";

import {
  reverseTransactionPlLinkPosting,
  restoreTransactionPlLinkPosting,
  type BankTransaction,
  type StoreFinancialProfile,
  type TransactionPlLink,
} from "@/lib/financials";
import { getPlaidClient, getPlaidConnectionById } from "@/lib/plaid";
import {
  collectPlaidTransactionIdsToStamp,
  plaidAccountStampDateWindow,
} from "@/lib/plaid-shared";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

const STAMP_PAGE_SIZE = 500;
const STAMP_UPDATE_CHUNK = 200;
const LINK_QUERY_CHUNK = 200;

export type PlaidAccountToggleRow = {
  id: string;
  store_id: string;
  plaid_connection_id: string;
  plaid_account_id: string;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  mask: string | null;
  included: boolean;
  excluded_at: string | null;
};

export type TogglePlaidAccountInclusionResult = {
  included: boolean;
  stamped: number;
  reversed: number;
  restored: number;
  stampWarning?: string;
};

export type PlaidAccountTransactionsGetClient = {
  transactionsGet: (request: {
    access_token: string;
    start_date: string;
    end_date: string;
    options: { account_ids: string[]; count: number; offset: number };
  }) => Promise<{
    data: {
      total_transactions: number;
      transactions: Array<{ transaction_id: string }>;
    };
  }>;
};

export async function fetchPlaidTransactionIdsForAccount(
  client: PlaidAccountTransactionsGetClient,
  accessToken: string,
  plaidAccountId: string,
  window = plaidAccountStampDateWindow()
): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const response = await client.transactionsGet({
      access_token: accessToken,
      start_date: window.start_date,
      end_date: window.end_date,
      options: {
        account_ids: [plaidAccountId],
        count: STAMP_PAGE_SIZE,
        offset,
      },
    });
    total = response.data.total_transactions;
    ids.push(...collectPlaidTransactionIdsToStamp(response.data.transactions));
    offset += response.data.transactions.length;
    if (response.data.transactions.length === 0) break;
  }

  return Array.from(new Set(ids));
}

export async function stampBankTransactionsWithPlaidAccountId(params: {
  storeId: string;
  plaidAccountId: string;
  plaidTransactionIds: string[];
}): Promise<number> {
  if (params.plaidTransactionIds.length === 0) {
    return 0;
  }

  const admin = createAdminSupabaseClient();
  let stamped = 0;

  for (let i = 0; i < params.plaidTransactionIds.length; i += STAMP_UPDATE_CHUNK) {
    const chunk = params.plaidTransactionIds.slice(i, i + STAMP_UPDATE_CHUNK);
    const { data, error } = await admin
      .from("bank_transactions")
      .update({ plaid_account_id: params.plaidAccountId })
      .eq("store_id", params.storeId)
      .in("plaid_transaction_id", chunk)
      .select("id");

    if (error) {
      throw new Error(`Failed to stamp Plaid account on transactions: ${error.message}`);
    }

    stamped += data?.length ?? 0;
  }

  return stamped;
}

async function loadStoreProfile(storeId: string): Promise<StoreFinancialProfile | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("stores").select("*").eq("id", storeId).maybeSingle();
  if (error) {
    throw new Error(`Failed to load store for P&L restore: ${error.message}`);
  }
  return (data as StoreFinancialProfile | null) ?? null;
}

async function loadAccountTransactions(
  storeId: string,
  plaidAccountId: string
): Promise<BankTransaction[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("bank_transactions")
    .select("id, store_id, transaction_date, amount, category, status, excluded, plaid_account_id")
    .eq("store_id", storeId)
    .eq("plaid_account_id", plaidAccountId);

  if (error) {
    throw new Error(`Failed to load account transactions: ${error.message}`);
  }

  return (data ?? []) as BankTransaction[];
}

async function loadLinksForTransactions(transactionIds: string[]): Promise<TransactionPlLink[]> {
  if (transactionIds.length === 0) return [];

  const admin = createAdminSupabaseClient();
  const links: TransactionPlLink[] = [];

  for (let i = 0; i < transactionIds.length; i += LINK_QUERY_CHUNK) {
    const chunk = transactionIds.slice(i, i + LINK_QUERY_CHUNK);
    const { data, error } = await admin
      .from("transaction_pl_links")
      .select("*")
      .in("transaction_id", chunk);

    if (error) {
      throw new Error(`Failed to load transaction P&L links: ${error.message}`);
    }

    links.push(...((data ?? []) as TransactionPlLink[]));
  }

  return links;
}

export async function reversePostedLinksForPlaidAccount(params: {
  storeId: string;
  userId: string;
  plaidAccountId: string;
}): Promise<number> {
  const store = await loadStoreProfile(params.storeId);
  const admin = createAdminSupabaseClient();
  const transactions = await loadAccountTransactions(params.storeId, params.plaidAccountId);
  const links = await loadLinksForTransactions(transactions.map((txn) => txn.id));
  let reversed = 0;

  for (const link of links) {
    const { error } = await reverseTransactionPlLinkPosting(admin, {
      storeId: params.storeId,
      userId: params.userId,
      link,
      store,
    });
    if (error) {
      throw new Error(`Failed to reverse P&L for transaction ${link.transaction_id}: ${error}`);
    }

    const { error: deleteError } = await admin
      .from("transaction_pl_links")
      .delete()
      .eq("id", link.id);

    if (deleteError) {
      throw new Error(`Failed to delete P&L link ${link.id}: ${deleteError.message}`);
    }

    reversed += 1;
  }

  return reversed;
}

export async function restorePostedLinksForPlaidAccount(params: {
  storeId: string;
  userId: string;
  plaidAccountId: string;
}): Promise<number> {
  const store = await loadStoreProfile(params.storeId);
  const admin = createAdminSupabaseClient();
  const transactions = await loadAccountTransactions(params.storeId, params.plaidAccountId);
  const existingLinks = await loadLinksForTransactions(transactions.map((txn) => txn.id));
  const linkedIds = new Set(existingLinks.map((link) => link.transaction_id));
  let restored = 0;

  for (const transaction of transactions) {
    if (linkedIds.has(transaction.id)) continue;

    const result = await restoreTransactionPlLinkPosting(admin, {
      storeId: params.storeId,
      userId: params.userId,
      transaction,
      store,
    });

    if (result.error) {
      throw new Error(`Failed to restore P&L for transaction ${transaction.id}: ${result.error}`);
    }

    if (result.restored) {
      restored += 1;
    }
  }

  return restored;
}

export async function togglePlaidAccountInclusion(params: {
  storeId: string;
  userId: string;
  accountId: string;
  included: boolean;
}): Promise<TogglePlaidAccountInclusionResult> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("plaid_accounts")
    .select(
      "id, store_id, plaid_connection_id, plaid_account_id, account_name, account_type, account_subtype, mask, included, excluded_at"
    )
    .eq("id", params.accountId)
    .eq("store_id", params.storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Plaid account: ${error.message}`);
  }

  const account = data as PlaidAccountToggleRow | null;
  if (!account) {
    throw new PlaidAccountNotFoundError();
  }

  if (account.included === params.included) {
    return { included: account.included, stamped: 0, reversed: 0, restored: 0 };
  }

  if (!params.included) {
    let stamped = 0;
    let stampWarning: string | undefined;

    try {
      const connection = await getPlaidConnectionById(account.plaid_connection_id);
      if (!connection || connection.store_id !== params.storeId) {
        throw new Error("Bank connection not found for this store");
      }

      const plaidTransactionIds = await fetchPlaidTransactionIdsForAccount(
        getPlaidClient(),
        connection.plaid_access_token,
        account.plaid_account_id
      );
      stamped = await stampBankTransactionsWithPlaidAccountId({
        storeId: params.storeId,
        plaidAccountId: account.plaid_account_id,
        plaidTransactionIds,
      });
    } catch (stampError) {
      stampWarning =
        stampError instanceof Error
          ? stampError.message
          : "Failed to stamp historical transactions for this account.";
      console.warn("[plaid/toggle-account] stamp failed", stampError);
    }

    const reversed = await reversePostedLinksForPlaidAccount({
      storeId: params.storeId,
      userId: params.userId,
      plaidAccountId: account.plaid_account_id,
    });

    const { error: updateError } = await admin
      .from("plaid_accounts")
      .update({
        included: false,
        excluded_at: new Date().toISOString(),
      })
      .eq("id", account.id)
      .eq("store_id", params.storeId);

    if (updateError) {
      throw new Error(`Failed to exclude Plaid account: ${updateError.message}`);
    }

    return { included: false, stamped, reversed, restored: 0, stampWarning };
  }

  const { error: updateError } = await admin
    .from("plaid_accounts")
    .update({
      included: true,
      excluded_at: null,
    })
    .eq("id", account.id)
    .eq("store_id", params.storeId);

  if (updateError) {
    throw new Error(`Failed to re-include Plaid account: ${updateError.message}`);
  }

  const restored = await restorePostedLinksForPlaidAccount({
    storeId: params.storeId,
    userId: params.userId,
    plaidAccountId: account.plaid_account_id,
  });

  return { included: true, stamped: 0, reversed: 0, restored };
}

export class PlaidAccountNotFoundError extends Error {
  constructor() {
    super("Bank account not found for this store");
    this.name = "PlaidAccountNotFoundError";
  }
}
