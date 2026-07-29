/**
 * Simulate a broken Plaid bank connection (ITEM_LOGIN_REQUIRED) for update-mode testing.
 *
 * Calls Plaid Sandbox /sandbox/item/reset_login via plaidClient.sandboxItemResetLogin({ access_token }).
 * Plaid should POST an ITEM / ERROR webhook (error_code ITEM_LOGIN_REQUIRED) to the Item's
 * registered webhook URL (PLAID_WEBHOOK_URL / production default).
 *
 * Usage:
 *   set -a && source .env.local && set +a && \
 *     npx tsx scripts/test-plaid-update-mode.ts
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   PLAID_CLIENT_ID, PLAID_SECRET
 *   TOKEN_ENCRYPTION_KEY (if tokens are encrypted at rest)
 *
 * Note: /sandbox/item/reset_login is Sandbox-only. This script always calls the Sandbox Plaid
 * API, even when PLAID_ENV=production. The store must be connected via a Sandbox Item.
 */

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createScriptSupabaseClient } from "./createScriptSupabaseClient";
import { decryptTokenIfEncrypted } from "../src/lib/tokenEncryption";

const STORE_ID = "c7f2a6df-85d0-4c6d-8a4f-ffdb022954ed";
const WEBHOOK_POLL_ATTEMPTS = 6;
const WEBHOOK_POLL_INTERVAL_MS = 5_000;

type PlaidConnectionSnapshot = {
  id: string;
  store_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  institution_name: string | null;
  item_error_code: string | null;
  item_error_message: string | null;
  item_error_at: string | null;
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
      "id, store_id, plaid_item_id, plaid_access_token, institution_name, item_error_code, item_error_message, item_error_at, updated_at"
    )
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

function logConnection(label: string, connection: PlaidConnectionSnapshot): void {
  console.log(`\n${label}:`);
  console.log(`  connection id:       ${connection.id}`);
  console.log(`  plaid_item_id:       ${connection.plaid_item_id}`);
  console.log(`  institution:         ${connection.institution_name ?? "(unknown)"}`);
  console.log(`  item_error_code:     ${connection.item_error_code ?? "(null)"}`);
  console.log(`  item_error_message:  ${connection.item_error_message ?? "(null)"}`);
  console.log(`  item_error_at:       ${connection.item_error_at ?? "(null)"}`);
  console.log(`  updated_at:          ${connection.updated_at}`);
  console.log(`  access_token:        ${connection.plaid_access_token.slice(0, 16)}…`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForItemErrorWebhook(
  storeId: string,
  itemId: string
): Promise<PlaidConnectionSnapshot | null> {
  for (let attempt = 1; attempt <= WEBHOOK_POLL_ATTEMPTS; attempt += 1) {
    await sleep(WEBHOOK_POLL_INTERVAL_MS);
    const connection = await fetchConnection(storeId);

    if (
      connection.item_error_code === "ITEM_LOGIN_REQUIRED" &&
      connection.plaid_item_id === itemId
    ) {
      console.log(`\nWebhook reflected in DB after ~${attempt * (WEBHOOK_POLL_INTERVAL_MS / 1000)}s.`);
      return connection;
    }

    console.log(
      `\nPoll ${attempt}/${WEBHOOK_POLL_ATTEMPTS}: item_error_code still ` +
        `${connection.item_error_code ?? "(null)"} — waiting for ITEM / ERROR webhook…`
    );
  }

  return null;
}

function printPostRunChecklist(storeId: string): void {
  console.log("\n" + "=".repeat(72));
  console.log("WHAT TO CHECK NEXT");
  console.log("=".repeat(72));

  console.log("\n1. Supabase — plaid_connections row for this store");
  console.log(`   store_id = ${storeId}`);
  console.log("   Expected after webhook delivery:");
  console.log("     • item_error_code    = ITEM_LOGIN_REQUIRED");
  console.log("     • item_error_message = populated (Plaid error text or display message)");
  console.log("     • item_error_at      = recent timestamp");
  console.log("   If still null, confirm PLAID_WEBHOOK_URL reaches /api/webhooks/plaid and");
  console.log("   check server logs for [plaid/webhook] signature or handler errors.");

  console.log("\n2. Browser — Financials → Bank Import tab");
  console.log("   • Yellow broken-connection banner should appear");
  console.log("   • Banner should offer Reconnect (update mode) and Disconnect");
  console.log("   • Click Reconnect — Plaid Link opens in update mode (same institution)");

  console.log("\n3. Plaid Link — complete abbreviated re-login");
  console.log("   Sandbox credentials: user_good / pass_good");
  console.log("   (Use whatever MFA flow Link prompts; sandbox defaults usually work.)");

  console.log("\n4. After successful Link completion");
  console.log("   • Banner should disappear (item_error_* cleared via /api/plaid/complete-update-mode)");
  console.log("   • Same plaid_item_id and access_token — no new connection row");
  console.log("   • Sync Now should work again");
  console.log("   • Optional: run scripts/test-plaid-accounts-get.ts to confirm API access");

  console.log("\n5. To reset for another test");
  console.log("   Re-run this script after repair, or disconnect and reconnect in the app.");
  console.log("=".repeat(72));
}

async function main() {
  console.log(`Store: ${STORE_ID}`);
  console.log(
    "Plaid SDK: plaidClient.sandboxItemResetLogin({ access_token }) → /sandbox/item/reset_login"
  );

  const before = await fetchConnection(STORE_ID);
  logConnection("Before reset_login", before);

  if (!before.plaid_access_token.startsWith("access-sandbox-")) {
    console.warn(
      "\nWarning: access_token does not look like a Sandbox token (expected access-sandbox-…). " +
        "reset_login only works for Sandbox Items."
    );
  }

  const plaid = getSandboxPlaidClient();
  console.log("\nCalling Plaid sandboxItemResetLogin…");

  const response = await plaid.sandboxItemResetLogin({
    access_token: before.plaid_access_token,
  });

  console.log("\nPlaid response:");
  console.log(JSON.stringify(response.data, null, 2));

  if (response.data.reset_login !== true) {
    console.warn("\nUnexpected: reset_login was not true in the Plaid response.");
  } else {
    console.log("\nItem forced into ITEM_LOGIN_REQUIRED state.");
    console.log(
      "Plaid is queuing an ITEM / ERROR webhook (error_code ITEM_LOGIN_REQUIRED) to the " +
        "webhook URL registered on this Item."
    );
  }

  console.log(
    `\nPolling plaid_connections every ${WEBHOOK_POLL_INTERVAL_MS / 1000}s (up to ` +
      `${WEBHOOK_POLL_ATTEMPTS} attempts) for webhook side effects…`
  );

  const after = await waitForItemErrorWebhook(STORE_ID, before.plaid_item_id);
  if (after) {
    logConnection("After webhook (DB)", after);
  } else {
    console.warn(
      "\nTimed out waiting for item_error_code = ITEM_LOGIN_REQUIRED in Supabase. " +
        "The reset_login call succeeded; the webhook may still be in flight or blocked."
    );
    const latest = await fetchConnection(STORE_ID);
    logConnection("Latest DB snapshot", latest);
  }

  printPostRunChecklist(STORE_ID);
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
