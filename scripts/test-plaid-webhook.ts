/**
 * Fire a Plaid Sandbox SYNC_UPDATES_AVAILABLE webhook for a store's connected Item.
 * Plaid delivers the webhook to the Item's registered URL (production in our case).
 *
 * Usage:
 *   set -a && source .env.local && set +a && \
 *     npx tsx scripts/test-plaid-webhook.ts
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   PLAID_CLIENT_ID, PLAID_SECRET
 *
 * Note: /sandbox/item/fire_webhook is Sandbox-only. This script always calls the
 * Sandbox Plaid API, even when PLAID_ENV=production.
 */

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createScriptSupabaseClient } from "./createScriptSupabaseClient";

const STORE_ID = "c7f2a6df-85d0-4c6d-8a4f-ffdb022954ed";

type PlaidConnectionSnapshot = {
  id: string;
  store_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  institution_name: string | null;
  has_new_transactions: boolean;
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
    .select(
      "id, store_id, plaid_item_id, plaid_access_token, institution_name, has_new_transactions, updated_at"
    )
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load plaid_connections for store ${storeId}: ${error.message}`);
  }
  if (!data?.plaid_access_token) {
    throw new Error(`No Plaid connection found for store ${storeId}`);
  }

  return data as PlaidConnectionSnapshot;
}

function logConnection(label: string, connection: PlaidConnectionSnapshot): void {
  console.log(`\n${label}:`);
  console.log(`  connection id:          ${connection.id}`);
  console.log(`  plaid_item_id:          ${connection.plaid_item_id}`);
  console.log(`  institution:            ${connection.institution_name ?? "(unknown)"}`);
  console.log(`  has_new_transactions:   ${connection.has_new_transactions}`);
  console.log(`  updated_at:             ${connection.updated_at}`);
}

async function main() {
  console.log(`Store: ${STORE_ID}`);

  const before = await fetchConnection(STORE_ID);
  logConnection("Before fire_webhook", before);

  const plaid = getSandboxPlaidClient();
  console.log("\nCalling Plaid sandboxItemFireWebhook (SYNC_UPDATES_AVAILABLE)...");

  const response = await plaid.sandboxItemFireWebhook({
    access_token: before.plaid_access_token,
    webhook_code: "SYNC_UPDATES_AVAILABLE",
  });

  console.log("\nPlaid response:");
  console.log(JSON.stringify(response.data, null, 2));

  console.log(
    "\nWebhook queued. Plaid will POST to this Item's registered webhook URL " +
      "(check PLAID_WEBHOOK_URL / link token webhook in production)."
  );
  console.log(
    "Re-check plaid_connections in Supabase after a few seconds — " +
      "has_new_transactions should flip to true if the production endpoint verified and handled the event."
  );
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
