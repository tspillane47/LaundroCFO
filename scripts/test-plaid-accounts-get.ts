/**
 * Fetch a store's Plaid access token from plaid_connections and call /accounts/get.
 *
 * Usage:
 *   set -a && source .env.local && set +a && \
 *     npx tsx scripts/test-plaid-accounts-get.ts
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   PLAID_CLIENT_ID, PLAID_SECRET
 *   TOKEN_ENCRYPTION_KEY (if tokens are encrypted at rest)
 *
 * Note: This store is connected via Plaid Sandbox (Platypus), so this script
 * always calls the Sandbox Plaid API, even when PLAID_ENV=production.
 */

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createScriptSupabaseClient } from "./createScriptSupabaseClient";
import { decryptTokenIfEncrypted } from "../src/lib/tokenEncryption";

const STORE_ID = "c7f2a6df-85d0-4c6d-8a4f-ffdb022954ed";

type PlaidConnectionSnapshot = {
  id: string;
  store_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  institution_name: string | null;
  updated_at: string;
};

function getSandboxPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const clientSecret = process.env.PLAID_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing PLAID_CLIENT_ID or PLAID_SECRET");
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": clientSecret,
      },
    },
  });

  return new PlaidApi(configuration);
}

async function fetchConnection(storeId: string): Promise<PlaidConnectionSnapshot> {
  const supabase = await createScriptSupabaseClient();
  const { data, error } = await supabase
    .from("plaid_connections")
    .select("id, store_id, plaid_item_id, plaid_access_token, institution_name, updated_at")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load plaid_connections for store ${storeId}: ${error.message}`);
  }
  if (!data?.plaid_access_token) {
    throw new Error(`No Plaid connection found for store ${storeId}`);
  }

  return {
    ...data,
    plaid_access_token: decryptTokenIfEncrypted(data.plaid_access_token),
  } as PlaidConnectionSnapshot;
}

function logConnection(connection: PlaidConnectionSnapshot): void {
  console.log("\nPlaid connection:");
  console.log(`  connection id:   ${connection.id}`);
  console.log(`  plaid_item_id:   ${connection.plaid_item_id}`);
  console.log(`  institution:     ${connection.institution_name ?? "(unknown)"}`);
  console.log(`  updated_at:      ${connection.updated_at}`);
  console.log(`  access_token:    ${connection.plaid_access_token.slice(0, 12)}…`);
}

async function main() {
  console.log(`Store: ${STORE_ID}`);

  const connection = await fetchConnection(STORE_ID);
  logConnection(connection);

  const plaid = getSandboxPlaidClient();
  console.log("\nCalling Plaid accountsGet...");

  const response = await plaid.accountsGet({
    access_token: connection.plaid_access_token,
  });

  const { accounts, item } = response.data;

  console.log(`\nItem: ${item.item_id} — ${item.institution_name ?? "(unknown institution)"}`);

  if (accounts.length === 0) {
    console.log("\nNo accounts returned.");
  } else {
    console.log(`\nAccounts (${accounts.length}):`);
    for (const account of accounts) {
      const { available, current, limit, iso_currency_code } = account.balances;
      console.log(`\n  ${account.name} (${account.official_name ?? "no official name"})`);
      console.log(`    account_id:  ${account.account_id}`);
      console.log(`    type:        ${account.type}${account.subtype ? ` / ${account.subtype}` : ""}`);
      console.log(`    mask:        ${account.mask ?? "(none)"}`);
      console.log(
        `    balances:    current=${current ?? "null"}, available=${available ?? "null"}` +
          (limit != null ? `, limit=${limit}` : "") +
          ` ${iso_currency_code ?? ""}`
      );
    }
  }

  console.log("\nFull Plaid response:");
  console.log(JSON.stringify(response.data, null, 2));
}

main().catch((error) => {
  console.error("\nScript failed:", error instanceof Error ? error.message : error);
  if (error && typeof error === "object" && "response" in error) {
    const axiosError = error as { response?: { status?: number; data?: unknown } };
    if (axiosError.response) {
      console.error("Plaid HTTP status:", axiosError.response.status);
      console.error("Plaid response body:", JSON.stringify(axiosError.response.data, null, 2));
    }
  }
  process.exit(1);
});
