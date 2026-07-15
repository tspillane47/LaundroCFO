import "server-only";

import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";
import type { RemovedTransaction, Transaction } from "plaid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BankImportCategory,
  CategorizationRule,
  FinancialDataSource,
  TransactionStatus,
} from "@/lib/financials";
import { categorizeWithRules } from "@/lib/financials";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  isPlaidSyncProtectedStatus,
  isPlaidSyncRemovableStatus,
  isQuickBooksDataSource,
  normalizePlaidTransaction,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
  type PlaidSyncResult,
} from "@/lib/plaid-shared";

export {
  isQuickBooksDataSource,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
  type PlaidSyncResult,
};

export type PlaidConfig = {
  clientId: string;
  clientSecret: string;
  env: "sandbox" | "production";
};

export type PlaidConnectionRow = {
  id: string;
  store_id: string;
  user_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  institution_name: string | null;
  connected_at: string;
  updated_at: string;
  sync_cursor: string | null;
};

export class PlaidNotConnectedError extends Error {
  constructor() {
    super("No Plaid connection found for this store");
    this.name = "PlaidNotConnectedError";
  }
}

export type PlaidPublicTokenExchangeResult = {
  accessToken: string;
  itemId: string;
  institutionName: string | null;
};

let plaidClient: PlaidApi | null = null;

type PlaidApiErrorBody = {
  error_code?: string;
  error_message?: string;
  error_type?: string;
  display_message?: string;
  request_id?: string;
  [key: string]: unknown;
};

function getAxiosLikeError(error: unknown): {
  message?: string;
  stack?: string;
  response?: { status?: number; statusText?: string; data?: unknown };
} | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    message?: string;
    stack?: string;
    response?: { status?: number; statusText?: string; data?: unknown };
  };

  return {
    message: candidate.message,
    stack: candidate.stack,
    response: candidate.response,
  };
}

export function logPlaidApiError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const axiosError = getAxiosLikeError(error);
  const responseData = axiosError?.response?.data;
  const plaidBody =
    responseData && typeof responseData === "object"
      ? (responseData as PlaidApiErrorBody)
      : null;

  const details = {
    context,
    ...extra,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : axiosError?.stack,
    responseStatus: axiosError?.response?.status,
    responseStatusText: axiosError?.response?.statusText,
    responseData,
    plaid: plaidBody
      ? {
          error_code: plaidBody.error_code,
          error_message: plaidBody.error_message,
          error_type: plaidBody.error_type,
          display_message: plaidBody.display_message,
          request_id: plaidBody.request_id,
        }
      : null,
  };

  console.error(`[plaid] ${context}`, JSON.stringify(details, null, 2));
  console.error(`[plaid] ${context} (raw error)`, error);
}

export function getPlaidConfig(): PlaidConfig {
  const clientId = process.env.PLAID_CLIENT_ID;
  const clientSecret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV === "production" ? "production" : "sandbox";

  if (!clientId || !clientSecret) {
    throw new Error("Missing Plaid configuration");
  }

  return { clientId, clientSecret, env };
}

export function getPlaidClient(): PlaidApi {
  if (plaidClient) {
    return plaidClient;
  }

  const { clientId, clientSecret, env } = getPlaidConfig();
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": clientSecret,
      },
    },
  });

  plaidClient = new PlaidApi(configuration);
  return plaidClient;
}

export async function verifyUserOwnsStore(
  supabase: SupabaseClient,
  userId: string,
  storeId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

export async function getStoreFinancialDataSource(storeId: string): Promise<FinancialDataSource | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("stores")
    .select("financial_data_source")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load store financial data source: ${error.message}`);
  }

  return (data?.financial_data_source as FinancialDataSource | undefined) ?? null;
}

export async function createPlaidLinkToken(userId: string): Promise<string> {
  const client = getPlaidClient();
  const { env } = getPlaidConfig();
  const linkTokenRequest = {
    user: { client_user_id: userId },
    client_name: "LaundroCFO",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
  };

  console.info(
    "[plaid] linkTokenCreate request",
    JSON.stringify(
      {
        env,
        request: {
          ...linkTokenRequest,
          products: linkTokenRequest.products.map(String),
          country_codes: linkTokenRequest.country_codes.map(String),
        },
      },
      null,
      2
    )
  );

  try {
    const response = await client.linkTokenCreate(linkTokenRequest);
    const linkToken = response.data.link_token;
    if (!linkToken) {
      throw new Error("Plaid did not return a link token");
    }

    return linkToken;
  } catch (error) {
    logPlaidApiError("linkTokenCreate failed", error, {
      env,
      request: {
        ...linkTokenRequest,
        products: linkTokenRequest.products.map(String),
        country_codes: linkTokenRequest.country_codes.map(String),
      },
    });
    throw error;
  }
}

async function fetchInstitutionName(accessToken: string): Promise<string | null> {
  const client = getPlaidClient();

  try {
    const itemResponse = await client.itemGet({ access_token: accessToken });
    const institutionId = itemResponse.data.item.institution_id;
    if (!institutionId) {
      return null;
    }

    const institutionResponse = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us],
    });

    return institutionResponse.data.institution.name ?? null;
  } catch (error) {
    console.error("[plaid] institution lookup failed", error);
    return null;
  }
}

export async function exchangePlaidPublicToken(
  publicToken: string
): Promise<PlaidPublicTokenExchangeResult> {
  const client = getPlaidClient();
  const response = await client.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const accessToken = response.data.access_token;
  const itemId = response.data.item_id;

  if (!accessToken || !itemId) {
    throw new Error("Plaid token exchange did not return expected credentials");
  }

  const institutionName = await fetchInstitutionName(accessToken);

  return {
    accessToken,
    itemId,
    institutionName,
  };
}

export async function upsertPlaidConnection(params: {
  storeId: string;
  userId: string;
  itemId: string;
  accessToken: string;
  institutionName: string | null;
}): Promise<void> {
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const payload = {
    store_id: params.storeId,
    user_id: params.userId,
    plaid_item_id: params.itemId,
    plaid_access_token: params.accessToken,
    institution_name: params.institutionName,
    sync_cursor: null,
    connected_at: now,
    updated_at: now,
  };

  const { error } = await admin.from("plaid_connections").upsert(payload, {
    onConflict: "store_id",
  });

  if (error) {
    throw new Error(`Failed to save Plaid connection: ${error.message}`);
  }
}

export async function updateStoreFinancialDataSourceOnPlaidConnect(storeId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("stores")
    .update({ financial_data_source: "bank_import" satisfies FinancialDataSource })
    .eq("id", storeId)
    .eq("financial_data_source", "manual");

  if (error) {
    throw new Error(`Failed to update store financial data source: ${error.message}`);
  }
}

export async function resetStoreFinancialDataSourceOnPlaidDisconnect(storeId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("stores")
    .update({ financial_data_source: "manual" satisfies FinancialDataSource })
    .eq("id", storeId)
    .eq("financial_data_source", "bank_import");

  if (error) {
    throw new Error(`Failed to reset store financial data source: ${error.message}`);
  }
}

export async function deletePlaidConnection(storeId: string): Promise<PlaidConnectionRow | null> {
  const admin = createAdminSupabaseClient();
  const { data: existing, error: fetchError } = await admin
    .from("plaid_connections")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to load Plaid connection: ${fetchError.message}`);
  }

  if (!existing) {
    return null;
  }

  const { error: deleteError } = await admin.from("plaid_connections").delete().eq("store_id", storeId);

  if (deleteError) {
    throw new Error(`Failed to delete Plaid connection: ${deleteError.message}`);
  }

  return existing as PlaidConnectionRow;
}

export async function removePlaidItem(accessToken: string): Promise<void> {
  const client = getPlaidClient();
  await client.itemRemove({ access_token: accessToken });
}

const PLAID_SYNC_PAGE_SIZE = 500;

type PlaidTransactionSyncBatch = {
  added: Transaction[];
  modified: Transaction[];
  removed: RemovedTransaction[];
  nextCursor: string;
};

async function loadPlaidConnection(storeId: string): Promise<PlaidConnectionRow> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("plaid_connections")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Plaid connection: ${error.message}`);
  }

  if (!data) {
    throw new PlaidNotConnectedError();
  }

  return data as PlaidConnectionRow;
}

async function loadCategorizationRules(userId: string): Promise<CategorizationRule[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("categorization_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load categorization rules: ${error.message}`);
  }

  return (data ?? []) as CategorizationRule[];
}

async function fetchAllPlaidTransactionUpdates(
  accessToken: string,
  cursor: string | null
): Promise<PlaidTransactionSyncBatch> {
  const client = getPlaidClient();
  let currentCursor: string | undefined = cursor ?? undefined;
  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: RemovedTransaction[] = [];

  while (true) {
    let response;
    try {
      response = await client.transactionsSync({
        access_token: accessToken,
        cursor: currentCursor,
        count: PLAID_SYNC_PAGE_SIZE,
      });
    } catch (error) {
      logPlaidApiError("transactionsSync failed", error, {
        hasCursor: Boolean(currentCursor),
      });
      throw error;
    }

    const data = response.data;
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);
    currentCursor = data.next_cursor;

    if (!data.has_more) {
      break;
    }
  }

  return {
    added,
    modified,
    removed,
    nextCursor: currentCursor ?? "",
  };
}

type ExistingBankTransactionRow = {
  id: string;
  plaid_transaction_id: string | null;
  status: TransactionStatus | null;
  description: string | null;
};

async function loadExistingPlaidTransactions(
  storeId: string,
  plaidTransactionIds: string[]
): Promise<Map<string, ExistingBankTransactionRow>> {
  if (plaidTransactionIds.length === 0) {
    return new Map();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("bank_transactions")
    .select("id, plaid_transaction_id, status, description")
    .eq("store_id", storeId)
    .in("plaid_transaction_id", plaidTransactionIds);

  if (error) {
    throw new Error(`Failed to load existing Plaid transactions: ${error.message}`);
  }

  const map = new Map<string, ExistingBankTransactionRow>();
  for (const row of data ?? []) {
    if (row.plaid_transaction_id) {
      map.set(row.plaid_transaction_id, row as ExistingBankTransactionRow);
    }
  }
  return map;
}

async function insertPlaidAddedTransactions(params: {
  storeId: string;
  userId: string;
  added: Transaction[];
  rules: CategorizationRule[];
  existingByPlaidId: Map<string, ExistingBankTransactionRow>;
}): Promise<number> {
  const { storeId, userId, added, rules, existingByPlaidId } = params;
  const admin = createAdminSupabaseClient();

  const rows = added
    .filter((txn) => !existingByPlaidId.has(txn.transaction_id))
    .map((txn) => {
      const normalized = normalizePlaidTransaction(txn);
      if (normalized.amount === 0) {
        return null;
      }

      const { category } = categorizeWithRules(
        normalized.description,
        normalized.transaction_type,
        normalized.amount,
        rules
      );

      return {
        store_id: storeId,
        user_id: userId,
        transaction_date: normalized.transaction_date,
        description: normalized.description,
        amount: normalized.amount,
        category: category as BankImportCategory,
        transaction_type: normalized.transaction_type,
        original_category: category as BankImportCategory,
        plaid_transaction_id: normalized.plaid_transaction_id,
        status: "needs_review" satisfies TransactionStatus,
        is_reviewed: false,
        excluded: false,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return 0;
  }

  const { error } = await admin.from("bank_transactions").insert(rows);
  if (error) {
    throw new Error(`Failed to insert Plaid transactions: ${error.message}`);
  }

  return rows.length;
}

async function applyPlaidModifiedTransactions(params: {
  storeId: string;
  modified: Transaction[];
  rules: CategorizationRule[];
  existingByPlaidId: Map<string, ExistingBankTransactionRow>;
}): Promise<number> {
  const { storeId, modified, rules, existingByPlaidId } = params;
  const admin = createAdminSupabaseClient();
  let modifiedCount = 0;

  for (const txn of modified) {
    const existing = existingByPlaidId.get(txn.transaction_id);
    if (!existing) {
      console.warn("[plaid/sync] modified transaction not found locally", {
        storeId,
        plaid_transaction_id: txn.transaction_id,
      });
      continue;
    }

    const normalized = normalizePlaidTransaction(txn);
    if (normalized.amount === 0) {
      continue;
    }

    const status = existing.status ?? "needs_review";

    if (isPlaidSyncProtectedStatus(status)) {
      if (normalized.description !== (existing.description ?? "")) {
        const { error } = await admin
          .from("bank_transactions")
          .update({
            description: normalized.description,
            modified_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) {
          throw new Error(`Failed to update protected Plaid transaction: ${error.message}`);
        }
        modifiedCount += 1;
      } else {
        console.info("[plaid/sync] skipped modified transaction with protected status", {
          storeId,
          plaid_transaction_id: txn.transaction_id,
          status,
        });
      }
      continue;
    }

    const { category } = categorizeWithRules(
      normalized.description,
      normalized.transaction_type,
      normalized.amount,
      rules
    );

    const { error } = await admin
      .from("bank_transactions")
      .update({
        transaction_date: normalized.transaction_date,
        description: normalized.description,
        amount: normalized.amount,
        transaction_type: normalized.transaction_type,
        category: category as BankImportCategory,
        modified_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Failed to update Plaid transaction: ${error.message}`);
    }

    modifiedCount += 1;
  }

  return modifiedCount;
}

async function applyPlaidRemovedTransactions(params: {
  storeId: string;
  removed: RemovedTransaction[];
  existingByPlaidId: Map<string, ExistingBankTransactionRow>;
}): Promise<{ removed: number; skippedRemovedPosted: number }> {
  const { storeId, removed, existingByPlaidId } = params;
  const admin = createAdminSupabaseClient();
  let removedCount = 0;
  let skippedRemovedPosted = 0;

  for (const txn of removed) {
    const existing = existingByPlaidId.get(txn.transaction_id);
    if (!existing) {
      continue;
    }

    const status = existing.status ?? "needs_review";

    if (!isPlaidSyncRemovableStatus(status)) {
      skippedRemovedPosted += 1;
      console.warn("[plaid/sync] Plaid removed a transaction that is already posted", {
        storeId,
        plaid_transaction_id: txn.transaction_id,
        bank_transaction_id: existing.id,
        status,
      });
      continue;
    }

    const { error } = await admin.from("bank_transactions").delete().eq("id", existing.id);
    if (error) {
      throw new Error(`Failed to delete removed Plaid transaction: ${error.message}`);
    }

    removedCount += 1;
  }

  return { removed: removedCount, skippedRemovedPosted };
}

async function persistPlaidSyncCursor(storeId: string, syncCursor: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("plaid_connections")
    .update({
      sync_cursor: syncCursor,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);

  if (error) {
    throw new Error(`Failed to persist Plaid sync cursor: ${error.message}`);
  }
}

export async function syncPlaidTransactions(storeId: string): Promise<PlaidSyncResult> {
  const connection = await loadPlaidConnection(storeId);
  const rules = await loadCategorizationRules(connection.user_id);

  const batch = await fetchAllPlaidTransactionUpdates(
    connection.plaid_access_token,
    connection.sync_cursor
  );

  const allPlaidIds = [
    ...batch.added.map((txn) => txn.transaction_id),
    ...batch.modified.map((txn) => txn.transaction_id),
    ...batch.removed.map((txn) => txn.transaction_id),
  ];

  const existingByPlaidId = await loadExistingPlaidTransactions(storeId, allPlaidIds);

  const added = await insertPlaidAddedTransactions({
    storeId,
    userId: connection.user_id,
    added: batch.added,
    rules,
    existingByPlaidId,
  });

  const modified = await applyPlaidModifiedTransactions({
    storeId,
    modified: batch.modified,
    rules,
    existingByPlaidId,
  });

  const { removed, skippedRemovedPosted } = await applyPlaidRemovedTransactions({
    storeId,
    removed: batch.removed,
    existingByPlaidId,
  });

  await persistPlaidSyncCursor(storeId, batch.nextCursor);

  return { added, modified, removed, skippedRemovedPosted };
}
