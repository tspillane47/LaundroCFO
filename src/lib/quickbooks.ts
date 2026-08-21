import "server-only";

import { endOfMonth, format, parse, startOfMonth, subMonths } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyMonthlyForm,
  PL_CATEGORY_FIELDS,
  type FinancialDataSource,
  type MonthlyFinancialRecord,
  type PlCategoryField,
} from "@/lib/financials";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  classifyQuickBooksOfferingSku,
  extractOfferingSkuFromNameValues,
  QUICKBOOKS_UNSUPPORTED_PRODUCT_ERROR_CODE,
  QUICKBOOKS_UNSUPPORTED_PRODUCT_MESSAGE,
  shouldFlagUnsupportedQuickBooksProduct,
  shouldSkipMonthForQuickBooksSync,
  type QuickBooksSyncSkippedMonth,
} from "@/lib/quickbooks-shared";
import { decryptTokenIfEncrypted, encryptToken } from "@/lib/tokenEncryption";

export type { QuickBooksSyncSkippedMonth };

const FALLBACK_INTUIT_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const FALLBACK_INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const FALLBACK_INTUIT_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const INTUIT_DISCOVERY_URL_PRODUCTION =
  "https://developer.api.intuit.com/.well-known/openid_configuration";
const INTUIT_DISCOVERY_URL_SANDBOX =
  "https://developer.api.intuit.com/.well-known/openid_sandbox_configuration";
const OAUTH_DISCOVERY_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

type IntuitOAuthDiscoveryDocument = {
  authorization_endpoint?: string;
  token_endpoint?: string;
  revocation_endpoint?: string;
};

type IntuitOAuthEndpoints = {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  fetchedAt: number;
};

let cachedOAuthEndpoints: IntuitOAuthEndpoints | null = null;
let oauthEndpointsFetchPromise: Promise<IntuitOAuthEndpoints> | null = null;
const QB_SCOPE = "com.intuit.quickbooks.accounting";
const QB_API_MINOR_VERSION = "70";
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;
export const QB_OAUTH_CSRF_COOKIE = "qb_oauth_csrf";

const DEFAULT_QB_MAPPINGS: { qb_account_name: string; laundrocfo_field: PlCategoryField }[] = [
  { qb_account_name: "Laundry Income", laundrocfo_field: "revenue" },
  { qb_account_name: "Wash & Fold Income", laundrocfo_field: "revenue" },
  { qb_account_name: "Utilities", laundrocfo_field: "utilities" },
  { qb_account_name: "Electric & Gas", laundrocfo_field: "utilities" },
  { qb_account_name: "Rent Expense", laundrocfo_field: "rent" },
  { qb_account_name: "Payroll Expense", laundrocfo_field: "payroll" },
  { qb_account_name: "Repairs & Maintenance", laundrocfo_field: "repairs_maintenance" },
  { qb_account_name: "Insurance", laundrocfo_field: "insurance_expense" },
  { qb_account_name: "Supplies", laundrocfo_field: "supplies" },
  { qb_account_name: "Marketing & Advertising", laundrocfo_field: "marketing" },
  { qb_account_name: "Professional Fees", laundrocfo_field: "professional_fees" },
  { qb_account_name: "Loan Payment", laundrocfo_field: "debt_service" },
  { qb_account_name: "Miscellaneous", laundrocfo_field: "other_expenses" },
];

export type QuickBooksConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type QuickBooksOAuthState = {
  storeId: string;
  csrf: string;
};

export type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
};

export type QuickBooksConnectionRow = {
  id: string;
  store_id: string;
  user_id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  connected_at: string;
  updated_at: string;
  last_synced_at: string | null;
  last_sync_months_synced: number | null;
  last_sync_skipped_count: number | null;
  last_sync_unmapped_count: number | null;
  error_code: string | null;
  error_message: string | null;
  error_at: string | null;
};

export function getQuickBooksConfig(): QuickBooksConfig {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing QuickBooks OAuth configuration");
  }

  return { clientId, clientSecret, redirectUri };
}

export function createOAuthCsrfToken(): string {
  return crypto.randomUUID();
}

export function encodeOAuthState(state: QuickBooksOAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeOAuthState(value: string): QuickBooksOAuthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as QuickBooksOAuthState;
    if (typeof parsed.storeId !== "string" || typeof parsed.csrf !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getIntuitDiscoveryDocumentUrl(): string {
  const environment = process.env.QUICKBOOKS_ENVIRONMENT?.toLowerCase();
  if (environment === "production") {
    return INTUIT_DISCOVERY_URL_PRODUCTION;
  }
  return INTUIT_DISCOVERY_URL_SANDBOX;
}

function isOAuthEndpointsCacheValid(endpoints: IntuitOAuthEndpoints): boolean {
  return Date.now() - endpoints.fetchedAt < OAUTH_DISCOVERY_CACHE_TTL_MS;
}

function fallbackOAuthEndpoints(): IntuitOAuthEndpoints {
  return {
    authorizeUrl: FALLBACK_INTUIT_AUTHORIZE_URL,
    tokenUrl: FALLBACK_INTUIT_TOKEN_URL,
    revokeUrl: FALLBACK_INTUIT_REVOKE_URL,
    fetchedAt: Date.now(),
  };
}

async function fetchOAuthEndpointsFromDiscovery(): Promise<IntuitOAuthEndpoints> {
  const discoveryUrl = getIntuitDiscoveryDocumentUrl();

  try {
    const response = await fetch(discoveryUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Discovery document fetch failed (${response.status})`);
    }

    const document = (await response.json()) as IntuitOAuthDiscoveryDocument;
    const authorizeUrl = document.authorization_endpoint;
    const tokenUrl = document.token_endpoint;

    if (!authorizeUrl || !tokenUrl) {
      throw new Error("Discovery document missing authorization_endpoint or token_endpoint");
    }

    return {
      authorizeUrl,
      tokenUrl,
      revokeUrl: document.revocation_endpoint ?? FALLBACK_INTUIT_REVOKE_URL,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.warn(
      "[quickbooks] Failed to fetch Intuit OAuth discovery document; using fallback endpoint URLs",
      {
        discoveryUrl,
        message: error instanceof Error ? error.message : String(error),
      }
    );
    return fallbackOAuthEndpoints();
  }
}

async function getOAuthEndpoints(): Promise<IntuitOAuthEndpoints> {
  if (cachedOAuthEndpoints && isOAuthEndpointsCacheValid(cachedOAuthEndpoints)) {
    return cachedOAuthEndpoints;
  }

  if (!oauthEndpointsFetchPromise) {
    oauthEndpointsFetchPromise = fetchOAuthEndpointsFromDiscovery().finally(() => {
      oauthEndpointsFetchPromise = null;
    });
  }

  cachedOAuthEndpoints = await oauthEndpointsFetchPromise;
  return cachedOAuthEndpoints;
}

export function getIntuitTidFromResponse(response: Response): string | undefined {
  return response.headers.get("intuit_tid") ?? undefined;
}

export function logQuickBooksApiError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const details = {
    context,
    ...extra,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };

  console.error(`[quickbooks] ${context}`, JSON.stringify(details, null, 2));
  console.error(`[quickbooks] ${context} (raw error)`, error);
}

function logQuickBooksFetchFailure(
  context: string,
  response: Response,
  responseBody: string,
  extra?: Record<string, unknown>
): void {
  logQuickBooksApiError(
    context,
    new Error(`${context} (${response.status})`),
    {
      ...extra,
      responseStatus: response.status,
      responseStatusText: response.statusText,
      intuit_tid: getIntuitTidFromResponse(response),
      responseBody,
    }
  );
}

export async function buildAuthorizationUrl(storeId: string, csrfToken: string): Promise<string> {
  const { clientId, redirectUri } = getQuickBooksConfig();
  const { authorizeUrl } = await getOAuthEndpoints();
  const state = encodeOAuthState({ storeId, csrf: csrfToken });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: QB_SCOPE,
    state,
  });
  return `${authorizeUrl}?${params.toString()}`;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export async function exchangeAuthorizationCode(code: string): Promise<QuickBooksTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getQuickBooksConfig();
  const { tokenUrl } = await getOAuthEndpoints();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-include-refresh-token-hard-expires-in": "true",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    logQuickBooksFetchFailure("token exchange failed", response, detail);
    throw new Error(`QuickBooks token exchange failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as QuickBooksTokenResponse;
}

export async function revokeQuickBooksToken(token: string): Promise<void> {
  const { clientId, clientSecret } = getQuickBooksConfig();
  const { revokeUrl } = await getOAuthEndpoints();
  const response = await fetch(revokeUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const detail = await response.text();
    logQuickBooksFetchFailure("token revoke failed", response, detail);
    throw new Error(`QuickBooks token revoke failed (${response.status}): ${detail}`);
  }
}

function tokenExpiryFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function decryptQuickBooksConnectionRow(row: QuickBooksConnectionRow): QuickBooksConnectionRow {
  return {
    ...row,
    access_token: decryptTokenIfEncrypted(row.access_token),
    refresh_token: decryptTokenIfEncrypted(row.refresh_token),
  };
}

export async function upsertQuickBooksConnection(params: {
  storeId: string;
  userId: string;
  realmId: string;
  tokens: QuickBooksTokenResponse;
}): Promise<void> {
  const admin = createAdminSupabaseClient();
  const refreshExpiresIn = params.tokens.x_refresh_token_expires_in ?? 101 * 24 * 60 * 60;
  const payload = {
    store_id: params.storeId,
    user_id: params.userId,
    realm_id: params.realmId,
    access_token: encryptToken(params.tokens.access_token),
    refresh_token: encryptToken(params.tokens.refresh_token),
    access_token_expires_at: tokenExpiryFromNow(params.tokens.expires_in),
    refresh_token_expires_at: tokenExpiryFromNow(refreshExpiresIn),
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    error_code: null,
    error_message: null,
    error_at: null,
  };

  const { error } = await admin.from("quickbooks_connections").upsert(payload, {
    onConflict: "store_id",
  });

  if (error) {
    throw new Error(`Failed to save QuickBooks connection: ${error.message}`);
  }
}

export async function storeHasQuickBooksConnection(storeId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("quickbooks_connections")
    .select("store_id")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check QuickBooks connection: ${error.message}`);
  }

  return Boolean(data);
}

/** Heal stores stuck with financial_data_source=quickbooks but no connection row. */
export async function reconcileStoreFinancialDataSourceWithQuickBooksConnection(
  storeId: string
): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const [{ data: store, error: storeError }, hasConnection] = await Promise.all([
    admin.from("stores").select("financial_data_source").eq("id", storeId).maybeSingle(),
    storeHasQuickBooksConnection(storeId),
  ]);

  if (storeError) {
    throw new Error(`Failed to load store financial data source: ${storeError.message}`);
  }

  if (!store || store.financial_data_source !== "quickbooks" || hasConnection) {
    return false;
  }

  const { error } = await admin
    .from("stores")
    .update({ financial_data_source: "manual" satisfies FinancialDataSource })
    .eq("id", storeId);

  if (error) {
    throw new Error(`Failed to reconcile store financial data source: ${error.message}`);
  }

  return true;
}

export async function updateStoreFinancialDataSourceOnQuickBooksConnect(storeId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("stores")
    .update({ financial_data_source: "quickbooks" satisfies FinancialDataSource })
    .eq("id", storeId)
    .in("financial_data_source", ["manual", "bank_import"]);

  if (error) {
    throw new Error(`Failed to update store financial data source: ${error.message}`);
  }
}

export async function resetStoreFinancialDataSourceOnQuickBooksDisconnect(storeId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("stores")
    .update({ financial_data_source: "manual" satisfies FinancialDataSource })
    .eq("id", storeId);

  if (error) {
    throw new Error(`Failed to reset store financial data source: ${error.message}`);
  }
}

export async function deleteQuickBooksConnection(storeId: string): Promise<QuickBooksConnectionRow | null> {
  const admin = createAdminSupabaseClient();
  const { data: existing, error: fetchError } = await admin
    .from("quickbooks_connections")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to load QuickBooks connection: ${fetchError.message}`);
  }

  if (!existing) {
    return null;
  }

  const { error: deleteError } = await admin
    .from("quickbooks_connections")
    .delete()
    .eq("store_id", storeId);

  if (deleteError) {
    throw new Error(`Failed to delete QuickBooks connection: ${deleteError.message}`);
  }

  return decryptQuickBooksConnectionRow(existing as QuickBooksConnectionRow);
}

export function financialsRedirectUrl(
  origin: string,
  status: "connected" | "error" | "unsupported_product",
  reason?: string
): string {
  const url = new URL("/financials", origin);
  url.searchParams.set("tab", "quickbooks");
  url.searchParams.set("qb", status);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return url.toString();
}

export class QuickBooksReconnectRequiredError extends Error {
  constructor(message = "QuickBooks connection expired. Please reconnect QuickBooks.") {
    super(message);
    this.name = "QuickBooksReconnectRequiredError";
  }
}

export class QuickBooksNotConnectedError extends Error {
  constructor(message = "QuickBooks is not connected for this store.") {
    super(message);
    this.name = "QuickBooksNotConnectedError";
  }
}

export type QuickBooksReportColData = {
  value?: string;
  id?: string;
};

export type QuickBooksReportColumn = {
  ColTitle?: string;
  ColType?: string;
  MetaData?: { Name: string; Value: string }[];
};

export type QuickBooksReportRow = {
  type?: string;
  group?: string;
  ColData?: QuickBooksReportColData[];
  Header?: { ColData?: QuickBooksReportColData[] };
  Summary?: { ColData?: QuickBooksReportColData[] };
  Rows?: { Row?: QuickBooksReportRow[] };
};

export type QuickBooksProfitAndLossReport = {
  Header?: {
    StartPeriod?: string;
    EndPeriod?: string;
    SummarizeColumnsBy?: string;
    Option?: { Name?: string; Value?: string }[];
  };
  Columns?: { Column?: QuickBooksReportColumn[] };
  Rows?: { Row?: QuickBooksReportRow[] };
};

export type QuickBooksCompanyInfoPayload = {
  CompanyInfo?: {
    NameValue?: { Name?: string; Value?: string }[] | { Name?: string; Value?: string };
  };
  QueryResponse?: {
    CompanyInfo?:
      | { NameValue?: { Name?: string; Value?: string }[] | { Name?: string; Value?: string } }
      | { NameValue?: { Name?: string; Value?: string }[] | { Name?: string; Value?: string } }[];
  };
};

export type QuickBooksSyncOptions = {
  forceOverrideMonths?: QuickBooksSyncSkippedMonth[];
};

export type QuickBooksSyncResult = {
  monthsSynced: number;
  unmappedAccounts: string[];
  skippedMonths: QuickBooksSyncSkippedMonth[];
  unsupportedProduct?: boolean;
};

export type ParsedMonthColumn = {
  year: number;
  month: number;
  columnIndex: number;
};

export type ParsedAccountRow = {
  accountName: string;
  amountsByColumnIndex: string[];
};

export function getQuickBooksApiBaseUrl(): string {
  const environment = process.env.QUICKBOOKS_ENVIRONMENT?.toLowerCase();
  if (environment === "production") {
    return "https://quickbooks.api.intuit.com";
  }
  return "https://sandbox-quickbooks.api.intuit.com";
}

function isAccessTokenValid(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - ACCESS_TOKEN_REFRESH_BUFFER_MS > Date.now();
}

function isRefreshTokenValid(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() > Date.now();
}

async function loadQuickBooksConnection(storeId: string): Promise<QuickBooksConnectionRow> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("quickbooks_connections")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load QuickBooks connection: ${error.message}`);
  }

  if (!data) {
    throw new QuickBooksNotConnectedError();
  }

  return decryptQuickBooksConnectionRow(data as QuickBooksConnectionRow);
}

async function updateQuickBooksTokens(
  storeId: string,
  tokens: QuickBooksTokenResponse
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const refreshExpiresIn = tokens.x_refresh_token_expires_in ?? 101 * 24 * 60 * 60;
  const payload = {
    access_token: encryptToken(tokens.access_token),
    refresh_token: encryptToken(tokens.refresh_token),
    access_token_expires_at: tokenExpiryFromNow(tokens.expires_in),
    refresh_token_expires_at: tokenExpiryFromNow(refreshExpiresIn),
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("quickbooks_connections").update(payload).eq("store_id", storeId);

  if (error) {
    throw new Error(`Failed to update QuickBooks tokens: ${error.message}`);
  }
}

export async function refreshQuickBooksAccessToken(refreshToken: string): Promise<QuickBooksTokenResponse> {
  const { clientId, clientSecret } = getQuickBooksConfig();
  const { tokenUrl } = await getOAuthEndpoints();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-include-refresh-token-hard-expires-in": "true",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 400 && detail.includes("invalid_grant")) {
      logQuickBooksFetchFailure("token refresh failed (reconnect required)", response, detail);
      throw new QuickBooksReconnectRequiredError();
    }
    logQuickBooksFetchFailure("token refresh failed", response, detail);
    throw new Error(`QuickBooks token refresh failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as QuickBooksTokenResponse;
}

export async function getValidAccessToken(storeId: string): Promise<{
  accessToken: string;
  realmId: string;
  userId: string;
}> {
  const connection = await loadQuickBooksConnection(storeId);

  if (!isRefreshTokenValid(connection.refresh_token_expires_at)) {
    throw new QuickBooksReconnectRequiredError();
  }

  const nowIso = new Date().toISOString();
  const accessTokenValid = isAccessTokenValid(connection.access_token_expires_at);
  console.log("[quickbooks-token] checking access token validity", {
    storeId,
    access_token_expires_at: connection.access_token_expires_at,
    now: nowIso,
    isAccessTokenValid: accessTokenValid,
  });

  if (accessTokenValid) {
    console.log("[quickbooks-token] using cached access token (no refresh needed)", { storeId });
    return {
      accessToken: connection.access_token,
      realmId: connection.realm_id,
      userId: connection.user_id,
    };
  }

  console.log("[quickbooks-token] access token expired or near expiry — starting refresh", { storeId });
  const tokens = await refreshQuickBooksAccessToken(connection.refresh_token);
  const newAccessTokenExpiresAt = tokenExpiryFromNow(tokens.expires_in);
  await updateQuickBooksTokens(storeId, tokens);
  console.log("[quickbooks-token] refresh complete", {
    storeId,
    access_token_expires_at: newAccessTokenExpiresAt,
    expires_in: tokens.expires_in,
  });

  return {
    accessToken: tokens.access_token,
    realmId: connection.realm_id,
    userId: connection.user_id,
  };
}

export async function fetchProfitAndLossReport(params: {
  realmId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
}): Promise<QuickBooksProfitAndLossReport> {
  const baseUrl = getQuickBooksApiBaseUrl();
  const url = new URL(`${baseUrl}/v3/company/${params.realmId}/reports/ProfitAndLoss`);
  url.searchParams.set("start_date", params.startDate);
  url.searchParams.set("end_date", params.endDate);
  url.searchParams.set("summarize_column_by", "Month");
  url.searchParams.set("minorversion", QB_API_MINOR_VERSION);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 401) {
      logQuickBooksFetchFailure("P&L report failed (reconnect required)", response, detail, {
        realmId: params.realmId,
        startDate: params.startDate,
        endDate: params.endDate,
      });
      throw new QuickBooksReconnectRequiredError(
        "QuickBooks access was denied. Please reconnect QuickBooks."
      );
    }
    logQuickBooksFetchFailure("P&L report failed", response, detail, {
      realmId: params.realmId,
      startDate: params.startDate,
      endDate: params.endDate,
    });
    throw new Error(`QuickBooks P&L report failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as QuickBooksProfitAndLossReport;
}

export function extractOfferingSkuFromCompanyInfoPayload(
  payload: QuickBooksCompanyInfoPayload | null | undefined
): string | null {
  const queryCompanyInfo = payload?.QueryResponse?.CompanyInfo;
  const fromQuery = Array.isArray(queryCompanyInfo) ? queryCompanyInfo[0] : queryCompanyInfo;
  const companyInfo = payload?.CompanyInfo ?? fromQuery;
  return extractOfferingSkuFromNameValues(companyInfo?.NameValue);
}

export async function fetchCompanyOfferingSku(params: {
  realmId: string;
  accessToken: string;
}): Promise<string | null> {
  const baseUrl = getQuickBooksApiBaseUrl();
  const url = new URL(
    `${baseUrl}/v3/company/${params.realmId}/companyinfo/${params.realmId}`
  );
  url.searchParams.set("minorversion", QB_API_MINOR_VERSION);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      logQuickBooksFetchFailure("CompanyInfo fetch failed", response, detail, {
        realmId: params.realmId,
      });
      return null;
    }

    const payload = (await response.json()) as QuickBooksCompanyInfoPayload;
    return extractOfferingSkuFromCompanyInfoPayload(payload);
  } catch (error) {
    logQuickBooksApiError("CompanyInfo fetch failed", error, { realmId: params.realmId });
    return null;
  }
}

function parseMoneyValue(value: string | undefined): number {
  if (!value || value.trim() === "") {
    return 0;
  }
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAccountName(name: string): string {
  return name.trim().toLowerCase();
}

const MONTH_TITLE_FORMATS = [
  "MMM yyyy",
  "MMMM yyyy",
  "MMM yy",
  "MMMM yy",
  "yyyy-MM",
  "MM/yyyy",
] as const;

export function parseMonthColumnTitle(title: string): { year: number; month: number } | null {
  const trimmed = title.trim();
  if (!trimmed || trimmed.toLowerCase() === "total") {
    return null;
  }

  for (const pattern of MONTH_TITLE_FORMATS) {
    const parsed = parse(trimmed, pattern, new Date());
    if (!Number.isNaN(parsed.getTime())) {
      return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
    }
  }

  return null;
}

export function parseProfitAndLossMonthColumns(
  report: QuickBooksProfitAndLossReport
): ParsedMonthColumn[] {
  const columns = report.Columns?.Column ?? [];
  const monthColumns: ParsedMonthColumn[] = [];

  for (let index = 1; index < columns.length; index += 1) {
    const column = columns[index];
    const colKey = column.MetaData?.find((meta) => meta.Name === "ColKey")?.Value;
    if (colKey === "total") {
      continue;
    }

    const title = column.ColTitle ?? "";
    const parsed = parseMonthColumnTitle(title);
    if (!parsed) {
      continue;
    }

    monthColumns.push({
      year: parsed.year,
      month: parsed.month,
      columnIndex: index,
    });
  }

  return monthColumns;
}

function walkProfitAndLossRows(
  rows: QuickBooksReportRow[] | undefined,
  onDataRow: (accountName: string, amountsByColumnIndex: string[]) => void
): void {
  if (!rows) {
    return;
  }

  for (const row of rows) {
    if (row.type === "Data" && row.ColData?.[0]?.value) {
      const accountName = row.ColData[0].value.trim();
      const amounts = row.ColData.slice(1).map((col) => col.value ?? "");
      onDataRow(accountName, amounts);
    }

    if (row.Rows?.Row) {
      walkProfitAndLossRows(row.Rows.Row, onDataRow);
    }
  }
}

export function extractProfitAndLossAccountRows(
  report: QuickBooksProfitAndLossReport
): ParsedAccountRow[] {
  const rows: ParsedAccountRow[] = [];
  walkProfitAndLossRows(report.Rows?.Row, (accountName, amountsByColumnIndex) => {
    rows.push({ accountName, amountsByColumnIndex });
  });
  return rows;
}

export function profitAndLossHasNoFinancialActivity(
  report: QuickBooksProfitAndLossReport
): boolean {
  const noReportData = report.Header?.Option?.find((option) => option.Name === "NoReportData")?.Value;
  if (noReportData?.toLowerCase() === "true") {
    return true;
  }

  const accountRows = extractProfitAndLossAccountRows(report);
  if (accountRows.length === 0) {
    return true;
  }

  return accountRows.every((row) =>
    row.amountsByColumnIndex.every((value) => parseMoneyValue(value) === 0)
  );
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function createEmptySyncedMonth(year: number, month: number): Record<PlCategoryField, number> {
  return Object.fromEntries(PL_CATEGORY_FIELDS.map((field) => [field, 0])) as Record<
    PlCategoryField,
    number
  >;
}

export function mapProfitAndLossToMonthlyAmounts(params: {
  report: QuickBooksProfitAndLossReport;
  mappings: { qb_account_name: string; laundrocfo_field: PlCategoryField }[];
}): {
  monthlyAmounts: Map<string, Record<PlCategoryField, number>>;
  unmappedAccounts: string[];
} {
  const monthColumns = parseProfitAndLossMonthColumns(params.report);
  const accountRows = extractProfitAndLossAccountRows(params.report);
  const mappingLookup = new Map<string, PlCategoryField>();

  for (const mapping of params.mappings) {
    const key = normalizeAccountName(mapping.qb_account_name);
    if (key) {
      mappingLookup.set(key, mapping.laundrocfo_field);
    }
  }

  const monthlyAmounts = new Map<string, Record<PlCategoryField, number>>();
  const unmappedAccountSet = new Set<string>();

  for (const column of monthColumns) {
    monthlyAmounts.set(monthKey(column.year, column.month), createEmptySyncedMonth(column.year, column.month));
  }

  for (const accountRow of accountRows) {
    const mapping = mappingLookup.get(normalizeAccountName(accountRow.accountName));
    let hasNonZeroAmount = false;

    for (const column of monthColumns) {
      const rawAmount = accountRow.amountsByColumnIndex[column.columnIndex - 1];
      const amount = parseMoneyValue(rawAmount);
      if (amount !== 0) {
        hasNonZeroAmount = true;
      }
    }

    if (!mapping) {
      if (hasNonZeroAmount) {
        unmappedAccountSet.add(accountRow.accountName);
      }
      continue;
    }

    for (const column of monthColumns) {
      const key = monthKey(column.year, column.month);
      const monthRecord = monthlyAmounts.get(key);
      if (!monthRecord) {
        continue;
      }

      const rawAmount = accountRow.amountsByColumnIndex[column.columnIndex - 1];
      const amount = parseMoneyValue(rawAmount);
      if (amount === 0) {
        continue;
      }

      monthRecord[mapping] = (monthRecord[mapping] ?? 0) + amount;
    }
  }

  return {
    monthlyAmounts,
    unmappedAccounts: Array.from(unmappedAccountSet).sort((a, b) => a.localeCompare(b)),
  };
}

async function loadQuickBooksMappings(
  storeId: string
): Promise<{ qb_account_name: string; laundrocfo_field: PlCategoryField }[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("quickbooks_mapping")
    .select("qb_account_name, laundrocfo_category")
    .eq("store_id", storeId);

  if (error) {
    throw new Error(`Failed to load QuickBooks mappings: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return DEFAULT_QB_MAPPINGS;
  }

  return data.map((row) => ({
    qb_account_name: row.qb_account_name,
    laundrocfo_field: row.laundrocfo_category as PlCategoryField,
  }));
}

async function storeHasMonthlyFinancials(storeId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("monthly_financials")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);

  if (error) {
    throw new Error(`Failed to check monthly financials: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export function getQuickBooksSyncDateRange(isFirstSync: boolean): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = format(now, "yyyy-MM-dd");

  if (isFirstSync) {
    const start = startOfMonth(subMonths(now, 23));
    return {
      startDate: format(start, "yyyy-MM-dd"),
      endDate,
    };
  }

  const previousMonthStart = startOfMonth(subMonths(now, 1));
  return {
    startDate: format(previousMonthStart, "yyyy-MM-dd"),
    endDate: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

function buildMonthlyFinancialPayload(params: {
  storeId: string;
  userId: string;
  year: number;
  month: number;
  syncedFields: Record<PlCategoryField, number>;
  existing?: MonthlyFinancialRecord | null;
}): Omit<MonthlyFinancialRecord, "id"> {
  const base = params.existing
    ? {
        year: params.year,
        month: params.month,
        revenue: params.syncedFields.revenue,
        self_service_revenue: params.existing.self_service_revenue ?? 0,
        wdf_revenue: params.existing.wdf_revenue ?? 0,
        commercial_revenue: params.existing.commercial_revenue ?? 0,
        vending_revenue: params.existing.vending_revenue ?? 0,
        other_revenue: params.existing.other_revenue ?? 0,
        utilities: params.syncedFields.utilities,
        rent: params.syncedFields.rent,
        payroll: params.syncedFields.payroll,
        repairs_maintenance: params.syncedFields.repairs_maintenance,
        insurance_expense: params.syncedFields.insurance_expense,
        supplies: params.syncedFields.supplies,
        marketing: params.syncedFields.marketing,
        professional_fees: params.syncedFields.professional_fees,
        software_subscriptions: params.syncedFields.software_subscriptions,
        cc_processing_fees: params.syncedFields.cc_processing_fees,
        bank_charges: params.syncedFields.bank_charges,
        other_expenses: params.syncedFields.other_expenses,
        debt_service: params.syncedFields.debt_service,
        notes: params.existing.notes ?? null,
      }
    : {
        ...emptyMonthlyForm(),
        year: params.year,
        month: params.month,
        revenue: params.syncedFields.revenue,
        self_service_revenue: 0,
        wdf_revenue: 0,
        commercial_revenue: 0,
        vending_revenue: 0,
        other_revenue: 0,
        utilities: params.syncedFields.utilities,
        rent: params.syncedFields.rent,
        payroll: params.syncedFields.payroll,
        repairs_maintenance: params.syncedFields.repairs_maintenance,
        insurance_expense: params.syncedFields.insurance_expense,
        supplies: params.syncedFields.supplies,
        marketing: params.syncedFields.marketing,
        professional_fees: params.syncedFields.professional_fees,
        software_subscriptions: params.syncedFields.software_subscriptions,
        cc_processing_fees: params.syncedFields.cc_processing_fees,
        bank_charges: params.syncedFields.bank_charges,
        other_expenses: params.syncedFields.other_expenses,
        debt_service: params.syncedFields.debt_service,
        notes: null,
      };

  return {
    store_id: params.storeId,
    user_id: params.userId,
    ...base,
    data_source: "quickbooks" satisfies FinancialDataSource,
    manually_overridden_at: null,
  };
}

async function upsertSyncedMonthlyFinancials(params: {
  storeId: string;
  userId: string;
  monthlyAmounts: Map<string, Record<PlCategoryField, number>>;
  forceOverrideMonths?: QuickBooksSyncSkippedMonth[];
}): Promise<{ monthsSynced: number; skippedMonths: QuickBooksSyncSkippedMonth[] }> {
  const admin = createAdminSupabaseClient();
  let monthsSynced = 0;
  const skippedMonths: QuickBooksSyncSkippedMonth[] = [];

  for (const [key, syncedFields] of Array.from(params.monthlyAmounts.entries())) {
    const [yearPart, monthPart] = key.split("-");
    const year = Number.parseInt(yearPart, 10);
    const month = Number.parseInt(monthPart, 10);

    const { data: existing, error: fetchError } = await admin
      .from("monthly_financials")
      .select("*")
      .eq("store_id", params.storeId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to load monthly financials for ${year}-${month}: ${fetchError.message}`);
    }

    const existingRecord = (existing as MonthlyFinancialRecord | null) ?? null;
    if (
      shouldSkipMonthForQuickBooksSync({
        manuallyOverriddenAt: existingRecord?.manually_overridden_at,
        year,
        month,
        forceOverrideMonths: params.forceOverrideMonths,
      })
    ) {
      skippedMonths.push({ year, month });
      continue;
    }

    const payload = buildMonthlyFinancialPayload({
      storeId: params.storeId,
      userId: params.userId,
      year,
      month,
      syncedFields,
      existing: existingRecord,
    });

    if (existing?.id) {
      const { error: updateError } = await admin
        .from("monthly_financials")
        .update(payload)
        .eq("id", existing.id);

      if (updateError) {
        throw new Error(`Failed to update monthly financials for ${year}-${month}: ${updateError.message}`);
      }
    } else {
      const { error: insertError } = await admin.from("monthly_financials").insert(payload);
      if (insertError) {
        throw new Error(`Failed to insert monthly financials for ${year}-${month}: ${insertError.message}`);
      }
    }

    monthsSynced += 1;
  }

  return { monthsSynced, skippedMonths };
}

async function setQuickBooksConnectionError(
  storeId: string,
  errorCode: string,
  errorMessage: string
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("quickbooks_connections")
    .update({
      error_code: errorCode,
      error_message: errorMessage,
      error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);

  if (error) {
    throw new Error(`Failed to record QuickBooks connection error: ${error.message}`);
  }
}

export async function persistQuickBooksSyncError(
  storeId: string,
  error: unknown
): Promise<void> {
  if (error instanceof QuickBooksNotConnectedError) {
    return;
  }

  if (!(error instanceof QuickBooksReconnectRequiredError)) {
    try {
      const connection = await loadQuickBooksConnection(storeId);
      if (connection.error_code === QUICKBOOKS_UNSUPPORTED_PRODUCT_ERROR_CODE) {
        return;
      }
    } catch {
      // Fall through and persist the new error.
    }
  }

  let errorCode = "SYNC_FAILED";
  let errorMessage = "Failed to sync QuickBooks data.";

  if (error instanceof QuickBooksReconnectRequiredError) {
    errorCode = "RECONNECT_REQUIRED";
    errorMessage = error.message;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  await setQuickBooksConnectionError(storeId, errorCode, errorMessage);
}

async function recordQuickBooksSyncHistory(params: {
  storeId: string;
  monthsSynced: number;
  skippedCount: number;
  unmappedCount: number;
  keepError?: boolean;
}): Promise<void> {
  const admin = createAdminSupabaseClient();
  const payload: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    last_sync_months_synced: params.monthsSynced,
    last_sync_skipped_count: params.skippedCount,
    last_sync_unmapped_count: params.unmappedCount,
    updated_at: new Date().toISOString(),
  };

  if (!params.keepError) {
    payload.error_code = null;
    payload.error_message = null;
    payload.error_at = null;
  }

  const { error } = await admin
    .from("quickbooks_connections")
    .update(payload)
    .eq("store_id", params.storeId);

  if (error) {
    throw new Error(`Failed to record QuickBooks sync history: ${error.message}`);
  }
}

async function markUnsupportedQuickBooksProduct(storeId: string): Promise<void> {
  await setQuickBooksConnectionError(
    storeId,
    QUICKBOOKS_UNSUPPORTED_PRODUCT_ERROR_CODE,
    QUICKBOOKS_UNSUPPORTED_PRODUCT_MESSAGE
  );
}

export async function flagUnsupportedQuickBooksProductIfDetected(params: {
  storeId: string;
  realmId: string;
  accessToken: string;
}): Promise<boolean> {
  const offeringSku = await fetchCompanyOfferingSku({
    realmId: params.realmId,
    accessToken: params.accessToken,
  });

  if (classifyQuickBooksOfferingSku(offeringSku) !== "unsupported") {
    return false;
  }

  console.warn("[quickbooks] connected realm looks like an unsupported Self-Employed/Solopreneur product", {
    storeId: params.storeId,
    realmId: params.realmId,
    offeringSku,
  });
  await markUnsupportedQuickBooksProduct(params.storeId);
  return true;
}

export async function syncQuickBooksFinancials(
  storeId: string,
  options: QuickBooksSyncOptions = {}
): Promise<QuickBooksSyncResult> {
  try {
    const { accessToken, realmId, userId } = await getValidAccessToken(storeId);
    const mappings = await loadQuickBooksMappings(storeId);
    const isFirstSync = !(await storeHasMonthlyFinancials(storeId));
    const { startDate, endDate } = getQuickBooksSyncDateRange(isFirstSync);

    const offeringSku = await fetchCompanyOfferingSku({ realmId, accessToken });
    const skuClassification = classifyQuickBooksOfferingSku(offeringSku);

    if (skuClassification === "unsupported") {
      console.warn("[quickbooks] skipping P&L sync for unsupported QuickBooks product", {
        storeId,
        realmId,
        offeringSku,
      });
      await recordQuickBooksSyncHistory({
        storeId,
        monthsSynced: 0,
        skippedCount: 0,
        unmappedCount: 0,
        keepError: true,
      });
      await markUnsupportedQuickBooksProduct(storeId);
      return {
        monthsSynced: 0,
        unmappedAccounts: [],
        skippedMonths: [],
        unsupportedProduct: true,
      };
    }

    const report = await fetchProfitAndLossReport({
      realmId,
      accessToken,
      startDate,
      endDate,
    });

    if (
      shouldFlagUnsupportedQuickBooksProduct({
        skuClassification,
        profitAndLossIsEmpty: profitAndLossHasNoFinancialActivity(report),
        isFirstSync,
      })
    ) {
      console.warn("[quickbooks] first sync found no P&L activity; treating as likely Self-Employed", {
        storeId,
        realmId,
        offeringSku,
        startDate,
        endDate,
      });
      await recordQuickBooksSyncHistory({
        storeId,
        monthsSynced: 0,
        skippedCount: 0,
        unmappedCount: 0,
        keepError: true,
      });
      await markUnsupportedQuickBooksProduct(storeId);
      return {
        monthsSynced: 0,
        unmappedAccounts: [],
        skippedMonths: [],
        unsupportedProduct: true,
      };
    }

    const { monthlyAmounts, unmappedAccounts } = mapProfitAndLossToMonthlyAmounts({
      report,
      mappings,
    });

    const { monthsSynced, skippedMonths } = await upsertSyncedMonthlyFinancials({
      storeId,
      userId,
      monthlyAmounts,
      forceOverrideMonths: options.forceOverrideMonths,
    });

    await recordQuickBooksSyncHistory({
      storeId,
      monthsSynced,
      skippedCount: skippedMonths.length,
      unmappedCount: unmappedAccounts.length,
    });

    return {
      monthsSynced,
      unmappedAccounts,
      skippedMonths,
    };
  } catch (error) {
    try {
      await persistQuickBooksSyncError(storeId, error);
    } catch (persistError) {
      console.error("[quickbooks] failed to persist connection error after sync failure", {
        storeId,
        persistError,
      });
    }
    throw error;
  }
}

export function resetQuickBooksOAuthDiscoveryCacheForTests(): void {
  cachedOAuthEndpoints = null;
  oauthEndpointsFetchPromise = null;
}
