import "server-only";

import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinancialDataSource } from "@/lib/financials";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  isQuickBooksDataSource,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
} from "@/lib/plaid-shared";

export { isQuickBooksDataSource, PLAID_QUICKBOOKS_BLOCK_MESSAGE };

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
};

export type PlaidPublicTokenExchangeResult = {
  accessToken: string;
  itemId: string;
  institutionName: string | null;
};

let plaidClient: PlaidApi | null = null;

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
  const response = await client.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "LaundroCFO",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
  });

  const linkToken = response.data.link_token;
  if (!linkToken) {
    throw new Error("Plaid did not return a link token");
  }

  return linkToken;
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
