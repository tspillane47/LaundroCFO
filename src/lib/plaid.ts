import "server-only";

import { createHash, createPublicKey, timingSafeEqual, verify } from "crypto";
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
  DEFAULT_PLAID_WEBHOOK_URL,
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
  has_new_transactions: boolean;
  item_error_code: string | null;
  item_error_message: string | null;
  item_error_at: string | null;
};

export type PlaidWebhookPayload = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: {
    error_code?: string;
    error_message?: string;
    error_type?: string;
    display_message?: string;
  };
};

type PlaidWebhookJwk = {
  alg: string;
  kid: string;
  kty: string;
  crv?: string;
  use?: string;
  x: string;
  y: string;
};

const PLAID_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
const plaidWebhookKeyCache = new Map<string, PlaidWebhookJwk>();

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

export function getPlaidWebhookUrl(): string {
  const configuredUrl = process.env.PLAID_WEBHOOK_URL?.trim();
  if (!configuredUrl) {
    console.warn(
      "[plaid] PLAID_WEBHOOK_URL is not set; defaulting to production webhook URL. " +
        "Plaid webhooks will not reach local/dev environments unless this is configured."
    );
    return DEFAULT_PLAID_WEBHOOK_URL;
  }

  return configuredUrl;
}

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  return Buffer.from(padded, "base64");
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function fetchPlaidWebhookVerificationKey(kid: string): Promise<PlaidWebhookJwk> {
  const cached = plaidWebhookKeyCache.get(kid);
  if (cached) {
    return cached;
  }

  const client = getPlaidClient();
  const response = await client.webhookVerificationKeyGet({ key_id: kid });
  const key = response.data.key as PlaidWebhookJwk | undefined;

  if (!key?.kid || key.alg !== "ES256" || key.kty !== "EC") {
    throw new Error("Plaid webhook verification key was missing or invalid");
  }

  plaidWebhookKeyCache.set(kid, key);
  return key;
}

export async function verifyPlaidWebhookSignature(
  body: string,
  verificationHeader: string | null
): Promise<boolean> {
  if (!verificationHeader) {
    return false;
  }

  const parts = verificationHeader.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [headerPart, payloadPart, signaturePart] = parts;

  let header: { alg?: string; kid?: string };
  let payload: { iat?: number; request_body_sha256?: string };
  try {
    header = JSON.parse(decodeBase64Url(headerPart).toString("utf8")) as {
      alg?: string;
      kid?: string;
    };
    payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8")) as {
      iat?: number;
      request_body_sha256?: string;
    };
  } catch {
    return false;
  }

  if (header.alg !== "ES256" || !header.kid) {
    return false;
  }

  let jwk: PlaidWebhookJwk;
  try {
    jwk = await fetchPlaidWebhookVerificationKey(header.kid);
  } catch (error) {
    logPlaidApiError("webhook verification key fetch failed", error, { kid: header.kid });
    return false;
  }

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signedContent = `${headerPart}.${payloadPart}`;
  const signature = decodeBase64Url(signaturePart);

  const signatureValid = verify(null, Buffer.from(signedContent), {
    key: publicKey,
    dsaEncoding: "ieee-p1363",
  }, signature);

  if (!signatureValid) {
    return false;
  }

  const issuedAt = payload.iat;
  if (typeof issuedAt !== "number" || issuedAt < Math.floor(Date.now() / 1000) - PLAID_WEBHOOK_MAX_AGE_SECONDS) {
    return false;
  }

  const bodyHash = createHash("sha256").update(body).digest("hex");
  if (!payload.request_body_sha256 || !timingSafeEqualHex(bodyHash, payload.request_body_sha256)) {
    return false;
  }

  return true;
}

async function updatePlaidConnectionByItemId(
  itemId: string,
  updates: Partial<
    Pick<
      PlaidConnectionRow,
      "has_new_transactions" | "item_error_code" | "item_error_message" | "item_error_at"
    >
  >
): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("plaid_connections")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("plaid_item_id", itemId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update Plaid connection for item ${itemId}: ${error.message}`);
  }

  return Boolean(data);
}

export async function flagPlaidConnectionNewTransactions(itemId: string): Promise<void> {
  const updated = await updatePlaidConnectionByItemId(itemId, {
    has_new_transactions: true,
  });

  if (!updated) {
    console.warn("[plaid/webhook] SYNC_UPDATES_AVAILABLE for unknown item", { itemId });
  }
}

export async function setPlaidConnectionItemError(
  itemId: string,
  errorCode: string,
  errorMessage: string
): Promise<void> {
  const updated = await updatePlaidConnectionByItemId(itemId, {
    item_error_code: errorCode,
    item_error_message: errorMessage,
    item_error_at: new Date().toISOString(),
  });

  if (!updated) {
    console.warn("[plaid/webhook] ITEM ERROR for unknown item", { itemId, errorCode });
  }
}

export async function clearPlaidConnectionItemError(itemId: string): Promise<void> {
  const updated = await updatePlaidConnectionByItemId(itemId, {
    item_error_code: null,
    item_error_message: null,
    item_error_at: null,
  });

  if (!updated) {
    console.warn("[plaid/webhook] clear item error for unknown item", { itemId });
  }
}

export async function handlePlaidWebhookPayload(payload: PlaidWebhookPayload): Promise<void> {
  const webhookType = payload.webhook_type;
  const webhookCode = payload.webhook_code;
  const itemId = payload.item_id;

  if (!webhookType || !webhookCode || !itemId) {
    console.warn("[plaid/webhook] missing required webhook fields", payload);
    return;
  }

  if (webhookType === "TRANSACTIONS" && webhookCode === "SYNC_UPDATES_AVAILABLE") {
    await flagPlaidConnectionNewTransactions(itemId);
    return;
  }

  if (webhookType === "ITEM") {
    if (webhookCode === "ERROR") {
      const errorCode = payload.error?.error_code ?? "UNKNOWN";
      const errorMessage =
        payload.error?.display_message ??
        payload.error?.error_message ??
        "Your bank connection needs attention.";
      await setPlaidConnectionItemError(itemId, errorCode, errorMessage);
      return;
    }

    if (webhookCode === "LOGIN_REPAIRED") {
      await clearPlaidConnectionItemError(itemId);
    }
  }
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
  const webhookUrl = getPlaidWebhookUrl();
  const linkTokenRequest = {
    user: { client_user_id: userId },
    client_name: "LaundroCFO",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: webhookUrl,
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
          webhook: webhookUrl,
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
    has_new_transactions: false,
    item_error_code: null,
    item_error_message: null,
    item_error_at: null,
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
      has_new_transactions: false,
      item_error_code: null,
      item_error_message: null,
      item_error_at: null,
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
