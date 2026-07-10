import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

const INTUIT_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const INTUIT_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const QB_SCOPE = "com.intuit.quickbooks.accounting";
export const QB_OAUTH_CSRF_COOKIE = "qb_oauth_csrf";

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

export function buildAuthorizationUrl(storeId: string, csrfToken: string): string {
  const { clientId, redirectUri } = getQuickBooksConfig();
  const state = encodeOAuthState({ storeId, csrf: csrfToken });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: QB_SCOPE,
    state,
  });
  return `${INTUIT_AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export async function exchangeAuthorizationCode(code: string): Promise<QuickBooksTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getQuickBooksConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(INTUIT_TOKEN_URL, {
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
    throw new Error(`QuickBooks token exchange failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as QuickBooksTokenResponse;
}

export async function revokeQuickBooksToken(token: string): Promise<void> {
  const { clientId, clientSecret } = getQuickBooksConfig();
  const response = await fetch(INTUIT_REVOKE_URL, {
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
    throw new Error(`QuickBooks token revoke failed (${response.status}): ${detail}`);
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

function tokenExpiryFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
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
    access_token: params.tokens.access_token,
    refresh_token: params.tokens.refresh_token,
    access_token_expires_at: tokenExpiryFromNow(params.tokens.expires_in),
    refresh_token_expires_at: tokenExpiryFromNow(refreshExpiresIn),
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("quickbooks_connections").upsert(payload, {
    onConflict: "store_id",
  });

  if (error) {
    throw new Error(`Failed to save QuickBooks connection: ${error.message}`);
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

  return existing as QuickBooksConnectionRow;
}

export function financialsRedirectUrl(origin: string, status: "connected" | "error", reason?: string): string {
  const url = new URL("/financials", origin);
  url.searchParams.set("tab", "quickbooks");
  url.searchParams.set("qb", status);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return url.toString();
}
