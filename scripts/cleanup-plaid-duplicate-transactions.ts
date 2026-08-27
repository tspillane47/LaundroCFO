/**
 * Cleanup duplicate Plaid bank transactions caused by pending→posted ID migrations.
 *
 * Store-scoped wrapper around reconcilePostedPlaidDuplicatesForStore. Scans all
 * history (no 45/14-day windows) so a manual run can still catch older pairs.
 *
 * Usage:
 *   set -a && source .env.local && set +a && \
 *     npx tsx scripts/cleanup-plaid-duplicate-transactions.ts
 *   set -a && source .env.local && set +a && \
 *     npx tsx scripts/cleanup-plaid-duplicate-transactions.ts --execute
 */
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createScriptSupabaseClient } from "./createScriptSupabaseClient";
import { decryptTokenIfEncrypted } from "../src/lib/tokenEncryption";
import { reverseTransactionPlLinkPosting } from "../src/lib/financials";
import {
  fetchConnectionActiveTransactionIds,
  reconcilePostedPlaidDuplicatesForStore,
  type ConnectionFetchResult,
  type PlaidConnectionForCleanup,
} from "../src/lib/plaidDuplicateCleanup";

function getPlaidClientForScript(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const clientSecret = process.env.PLAID_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing PLAID_CLIENT_ID or PLAID_SECRET");
  }

  const env = process.env.PLAID_ENV === "production" ? "production" : "sandbox";
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": clientSecret,
        },
      },
    })
  );
}

async function loadLivePlaidIds(
  connections: PlaidConnectionForCleanup[],
  minDate: string,
  maxDate: string
): Promise<ConnectionFetchResult[]> {
  const client = getPlaidClientForScript();
  const results: ConnectionFetchResult[] = [];
  for (const connection of connections) {
    const accessToken = decryptTokenIfEncrypted(connection.plaid_access_token);
    results.push(
      await fetchConnectionActiveTransactionIds(client, connection, accessToken, minDate, maxDate)
    );
  }
  return results;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const supabase = await createScriptSupabaseClient();

  const { data: stores, error: storesError } = await supabase.from("stores").select("id, name");
  if (storesError) throw new Error(storesError.message);

  let confirmedGroups = 0;
  let applied = 0;
  let groupErrors = 0;

  for (const store of stores ?? []) {
    const storeId = store.id as string;
    const result = await reconcilePostedPlaidDuplicatesForStore(storeId, {
      supabase,
      loadLivePlaidIds,
      reverseTransactionPlLinkPosting: (supabase, params) =>
        reverseTransactionPlLinkPosting(
          supabase as Parameters<typeof reverseTransactionPlLinkPosting>[0],
          params
        ),
      execute,
      transactionDateWindowDays: null,
      createdWithinDays: null,
    });

    confirmedGroups += result.confirmedGroups;
    applied += result.applied.length;
    groupErrors += result.groupErrors.length;
  }

  if (confirmedGroups === 0 && applied === 0) {
    console.log("No posted duplicate Plaid transaction pairs found.");
    return;
  }

  if (!execute) {
    console.log(
      `\nDry run only (${confirmedGroups} confirmed group(s)). Re-run with --execute to apply these changes.`
    );
    return;
  }

  console.log(
    `\nCleanup complete. Applied ${applied} correction(s) across ${confirmedGroups} group(s)` +
      (groupErrors ? `; ${groupErrors} group(s) failed` : "") +
      "."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
