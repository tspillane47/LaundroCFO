/**
 * One-off migration: encrypt plaintext OAuth tokens already stored in the database.
 *
 * Targets:
 *   quickbooks_connections.access_token, refresh_token
 *   plaid_connections.plaid_access_token
 *
 * Skips values that already match the iv:authTag:ciphertext (base64) format.
 *
 * Usage (dry-run — recommended first):
 *   set -a && source .env.local && set +a && \
 *     npx tsx scripts/encrypt-existing-tokens.ts --dry-run
 *
 * Apply changes:
 *   set -a && source .env.local && set +a && \
 *     npx tsx scripts/encrypt-existing-tokens.ts
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SCRIPT_EMAIL + SUPABASE_SCRIPT_PASSWORD)
 *   TOKEN_ENCRYPTION_KEY — must be the same key used by the running app
 */

import { createScriptSupabaseClient } from "./createScriptSupabaseClient";
import { encryptToken, isEncryptedToken } from "../src/lib/tokenEncryption";

type QuickBooksConnectionRow = {
  id: string;
  store_id: string;
  access_token: string;
  refresh_token: string;
};

type PlaidConnectionRow = {
  id: string;
  store_id: string;
  plaid_access_token: string;
};

type Summary = {
  quickBooksRows: number;
  quickBooksTokensEncrypted: number;
  quickBooksTokensSkipped: number;
  plaidRows: number;
  plaidTokensEncrypted: number;
  plaidTokensSkipped: number;
  errors: number;
};

function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.slice(2).includes("--dry-run") };
}

function maybeEncrypt(value: string): { next: string; action: "encrypt" | "skip" } {
  if (isEncryptedToken(value)) {
    return { next: value, action: "skip" };
  }
  return { next: encryptToken(value), action: "encrypt" };
}

async function migrateQuickBooksConnections(
  dryRun: boolean,
  summary: Summary
): Promise<void> {
  const supabase = await createScriptSupabaseClient();
  const { data, error } = await supabase
    .from("quickbooks_connections")
    .select("id, store_id, access_token, refresh_token");

  if (error) {
    throw new Error(`Failed to load quickbooks_connections: ${error.message}`);
  }

  const rows = (data ?? []) as QuickBooksConnectionRow[];
  summary.quickBooksRows = rows.length;

  for (const row of rows) {
    try {
      const access = maybeEncrypt(row.access_token);
      const refresh = maybeEncrypt(row.refresh_token);

      if (access.action === "encrypt") summary.quickBooksTokensEncrypted += 1;
      else summary.quickBooksTokensSkipped += 1;

      if (refresh.action === "encrypt") summary.quickBooksTokensEncrypted += 1;
      else summary.quickBooksTokensSkipped += 1;

      if (access.action === "skip" && refresh.action === "skip") {
        console.log(`  quickbooks store ${row.store_id}: already encrypted — skip`);
        continue;
      }

      console.log(
        `  quickbooks store ${row.store_id}: ` +
          `${dryRun ? "would encrypt" : "encrypting"} ` +
          `(access=${access.action}, refresh=${refresh.action})`
      );

      if (dryRun) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("quickbooks_connections")
        .update({
          access_token: access.next,
          refresh_token: refresh.next,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
    } catch (err) {
      summary.errors += 1;
      console.error(
        `  quickbooks store ${row.store_id} ERROR: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

async function migratePlaidConnections(dryRun: boolean, summary: Summary): Promise<void> {
  const supabase = await createScriptSupabaseClient();
  const { data, error } = await supabase
    .from("plaid_connections")
    .select("id, store_id, plaid_access_token");

  if (error) {
    throw new Error(`Failed to load plaid_connections: ${error.message}`);
  }

  const rows = (data ?? []) as PlaidConnectionRow[];
  summary.plaidRows = rows.length;

  for (const row of rows) {
    try {
      const token = maybeEncrypt(row.plaid_access_token);

      if (token.action === "encrypt") {
        summary.plaidTokensEncrypted += 1;
      } else {
        summary.plaidTokensSkipped += 1;
        console.log(`  plaid store ${row.store_id}: already encrypted — skip`);
        continue;
      }

      console.log(
        `  plaid store ${row.store_id}: ${dryRun ? "would encrypt" : "encrypting"} access token`
      );

      if (dryRun) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("plaid_connections")
        .update({
          plaid_access_token: token.next,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
    } catch (err) {
      summary.errors += 1;
      console.error(
        `  plaid store ${row.store_id} ERROR: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

async function main() {
  const { dryRun } = parseArgs(process.argv);

  if (!process.env.TOKEN_ENCRYPTION_KEY?.trim()) {
    throw new Error(
      "Missing TOKEN_ENCRYPTION_KEY. Load .env.local before running this script."
    );
  }

  console.log(`Encrypt existing OAuth tokens${dryRun ? " (DRY RUN)" : ""}\n`);

  const summary: Summary = {
    quickBooksRows: 0,
    quickBooksTokensEncrypted: 0,
    quickBooksTokensSkipped: 0,
    plaidRows: 0,
    plaidTokensEncrypted: 0,
    plaidTokensSkipped: 0,
    errors: 0,
  };

  console.log("=== quickbooks_connections ===");
  await migrateQuickBooksConnections(dryRun, summary);

  console.log("\n=== plaid_connections ===");
  await migratePlaidConnections(dryRun, summary);

  console.log("\n=== Summary ===");
  console.log(`  QuickBooks rows:              ${summary.quickBooksRows}`);
  console.log(`  QuickBooks tokens encrypted:  ${summary.quickBooksTokensEncrypted}`);
  console.log(`  QuickBooks tokens skipped:    ${summary.quickBooksTokensSkipped}`);
  console.log(`  Plaid rows:                   ${summary.plaidRows}`);
  console.log(`  Plaid tokens encrypted:       ${summary.plaidTokensEncrypted}`);
  console.log(`  Plaid tokens skipped:         ${summary.plaidTokensSkipped}`);
  console.log(`  Errors:                       ${summary.errors}`);

  if (dryRun) {
    console.log("\nRe-run without --dry-run to apply changes.");
  }

  process.exit(summary.errors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
