/**
 * Cleanup duplicate Plaid bank transactions caused by pending→posted ID migrations.
 *
 * Finds posted duplicate groups (same store, date, amount, different plaid_transaction_id),
 * keeps the oldest row, reverses the newer duplicate's P&L posting, deletes the duplicate,
 * and updates the surviving row to the Plaid-recognized transaction ID.
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

type BankTransactionRow = {
  id: string;
  store_id: string;
  user_id: string;
  plaid_transaction_id: string;
  transaction_date: string;
  amount: number;
  description: string | null;
  status: string;
  created_at: string;
};

type TransactionPlLinkRow = {
  id: string;
  transaction_id: string;
  store_id: string;
  year: number;
  month: number;
  category: string;
  amount_applied: number;
};

type CleanupAction = {
  storeId: string;
  storeName: string;
  keep: BankTransactionRow;
  remove: BankTransactionRow;
  plLink: TransactionPlLinkRow | null;
  currentPlaidTransactionId: string;
  plaidIdSource: CleanupActionPlaidIdSource;
};

type CleanupActionPlaidIdSource =
  | "plaid_api_newer"
  | "plaid_api_older"
  | "newer_row_fallback"
  | "older_row_fallback";

type CleanupGroup = {
  storeId: string;
  storeName: string;
  keep: BankTransactionRow;
  removes: BankTransactionRow[];
  plLinksByRemoveId: Map<string, TransactionPlLinkRow>;
  currentPlaidTransactionId: string;
  plaidIdSource: CleanupActionPlaidIdSource;
};

type PlaidConnectionRow = {
  id: string;
  store_id: string;
  user_id: string;
  plaid_access_token: string;
  institution_name: string | null;
};

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

function groupKey(row: Pick<BankTransactionRow, "store_id" | "transaction_date" | "amount">): string {
  return `${row.store_id}|${row.transaction_date}|${row.amount}`;
}

async function loadActivePlaidTransactionIds(
  client: PlaidApi,
  connections: PlaidConnectionRow[],
  minDate: string,
  maxDate: string
): Promise<Set<string>> {
  const activeIds = new Set<string>();

  for (const connection of connections) {
    try {
      const accessToken = decryptTokenIfEncrypted(connection.plaid_access_token);
      const response = await client.transactionsGet({
        access_token: accessToken,
        start_date: minDate,
        end_date: maxDate,
      });
      for (const txn of response.data.transactions) {
        activeIds.add(txn.transaction_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[cleanup] Plaid lookup failed for connection ${connection.id} (${connection.institution_name ?? "unknown"}): ${message}`
      );
    }
  }

  return activeIds;
}

function chooseCurrentPlaidTransactionId(params: {
  keep: BankTransactionRow;
  candidates: BankTransactionRow[];
  activePlaidIds: Set<string>;
}): { id: string; source: CleanupActionPlaidIdSource } {
  const { keep, candidates, activePlaidIds } = params;
  const ordered = [...candidates].sort((a, b) => b.created_at.localeCompare(a.created_at));

  for (const candidate of ordered) {
    if (activePlaidIds.has(candidate.plaid_transaction_id)) {
      return {
        id: candidate.plaid_transaction_id,
        source: candidate.id === keep.id ? "plaid_api_older" : "plaid_api_newer",
      };
    }
  }

  const newest = ordered[0];
  if (newest && newest.id !== keep.id) {
    return { id: newest.plaid_transaction_id, source: "newer_row_fallback" };
  }

  return { id: keep.plaid_transaction_id, source: "older_row_fallback" };
}

async function findDuplicateGroups(): Promise<CleanupGroup[]> {
  const supabase = await createScriptSupabaseClient();

  const { data: stores, error: storesError } = await supabase.from("stores").select("id, name");
  if (storesError) throw new Error(storesError.message);
  const storeNameById = new Map((stores ?? []).map((store) => [store.id as string, store.name as string]));

  const { data: txns, error: txnsError } = await supabase
    .from("bank_transactions")
    .select(
      "id, store_id, user_id, plaid_transaction_id, transaction_date, amount, description, status, created_at"
    )
    .not("plaid_transaction_id", "is", null)
    .eq("status", "posted")
    .order("created_at", { ascending: true });

  if (txnsError) throw new Error(txnsError.message);

  const groups = new Map<string, BankTransactionRow[]>();
  for (const row of (txns ?? []) as BankTransactionRow[]) {
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const candidateGroups: Array<{ keep: BankTransactionRow; removes: BankTransactionRow[] }> = [];

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;

    const uniquePlaidIds = new Set(rows.map((row) => row.plaid_transaction_id));
    if (uniquePlaidIds.size < 2) continue;

    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    candidateGroups.push({
      keep: sorted[0],
      removes: sorted.slice(1),
    });
  }

  if (candidateGroups.length === 0) {
    return [];
  }

  const storeIds = [...new Set(candidateGroups.map((group) => group.keep.store_id))];
  const { data: connections, error: connectionsError } = await supabase
    .from("plaid_connections")
    .select("id, store_id, user_id, plaid_access_token, institution_name")
    .in("store_id", storeIds);

  if (connectionsError) throw new Error(connectionsError.message);

  const connectionsByStore = new Map<string, PlaidConnectionRow[]>();
  for (const connection of (connections ?? []) as PlaidConnectionRow[]) {
    if (!connectionsByStore.has(connection.store_id)) {
      connectionsByStore.set(connection.store_id, []);
    }
    connectionsByStore.get(connection.store_id)!.push(connection);
  }

  const allDates = candidateGroups.flatMap((group) => [
    group.keep.transaction_date,
    ...group.removes.map((row) => row.transaction_date),
  ]);
  const minDate = allDates.reduce((min, date) => (date < min ? date : min));
  const maxDate = allDates.reduce((max, date) => (date > max ? date : max));

  const client = getPlaidClientForScript();
  const activePlaidIdsByStore = new Map<string, Set<string>>();
  for (const storeId of storeIds) {
    const storeConnections = connectionsByStore.get(storeId) ?? [];
    activePlaidIdsByStore.set(
      storeId,
      await loadActivePlaidTransactionIds(client, storeConnections, minDate, maxDate)
    );
  }

  const duplicateTxnIds = candidateGroups.flatMap((group) => [
    group.keep.id,
    ...group.removes.map((row) => row.id),
  ]);
  const { data: links, error: linksError } = await supabase
    .from("transaction_pl_links")
    .select("id, transaction_id, store_id, year, month, category, amount_applied")
    .in("transaction_id", duplicateTxnIds);

  if (linksError) throw new Error(linksError.message);

  const linksByTxnId = new Map<string, TransactionPlLinkRow>();
  for (const link of (links ?? []) as TransactionPlLinkRow[]) {
    linksByTxnId.set(link.transaction_id, link);
  }

  const cleanupGroups: CleanupGroup[] = [];

  for (const { keep, removes } of candidateGroups) {
    const activePlaidIds = activePlaidIdsByStore.get(keep.store_id) ?? new Set<string>();
    const { id: currentPlaidTransactionId, source: plaidIdSource } = chooseCurrentPlaidTransactionId({
      keep,
      candidates: [keep, ...removes],
      activePlaidIds,
    });

    const plLinksByRemoveId = new Map<string, TransactionPlLinkRow>();
    for (const remove of removes) {
      const link = linksByTxnId.get(remove.id);
      if (link) plLinksByRemoveId.set(remove.id, link);
    }

    cleanupGroups.push({
      storeId: keep.store_id,
      storeName: storeNameById.get(keep.store_id) ?? keep.store_id,
      keep,
      removes,
      plLinksByRemoveId,
      currentPlaidTransactionId,
      plaidIdSource,
    });
  }

  return cleanupGroups.sort((a, b) => {
    const storeCmp = a.storeName.localeCompare(b.storeName);
    if (storeCmp !== 0) return storeCmp;
    const dateCmp = b.keep.transaction_date.localeCompare(a.keep.transaction_date);
    if (dateCmp !== 0) return dateCmp;
    return a.keep.created_at.localeCompare(b.keep.created_at);
  });
}

function flattenActions(groups: CleanupGroup[]): CleanupAction[] {
  const actions: CleanupAction[] = [];
  for (const group of groups) {
    for (const remove of group.removes) {
      actions.push({
        storeId: group.storeId,
        storeName: group.storeName,
        keep: group.keep,
        remove,
        plLink: group.plLinksByRemoveId.get(remove.id) ?? null,
        currentPlaidTransactionId: group.currentPlaidTransactionId,
        plaidIdSource: group.plaidIdSource,
      });
    }
  }
  return actions;
}

function printDryRun(groups: CleanupGroup[]): void {
  const actions = flattenActions(groups);
  console.log(`Found ${groups.length} duplicate group(s) (${actions.length} row(s) to remove) across all stores.\n`);

  let totalPlReversal = 0;
  const byStore = new Map<string, CleanupGroup[]>();

  for (const group of groups) {
    if (!byStore.has(group.storeName)) byStore.set(group.storeName, []);
    byStore.get(group.storeName)!.push(group);
    for (const remove of group.removes) {
      const link = group.plLinksByRemoveId.get(remove.id);
      if (link) totalPlReversal += Number(link.amount_applied);
    }
  }

  for (const [storeName, storeGroups] of [...byStore.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`=== ${storeName} (${storeGroups.length} group(s)) ===`);
    for (const group of storeGroups) {
      console.log("");
      console.log(`  Date: ${group.keep.transaction_date}  Amount: $${group.keep.amount}`);
      console.log(`  KEEP (older):   ${group.keep.id}`);
      console.log(`    plaid_id: ${group.keep.plaid_transaction_id}`);
      console.log(`    created:  ${group.keep.created_at}`);
      console.log(`    desc:     ${(group.keep.description ?? "").slice(0, 70)}`);
      for (const remove of group.removes) {
        console.log(`  REMOVE (newer): ${remove.id}`);
        console.log(`    plaid_id: ${remove.plaid_transaction_id}`);
        console.log(`    created:  ${remove.created_at}`);
        console.log(`    desc:     ${(remove.description ?? "").slice(0, 70)}`);
        const plLink = group.plLinksByRemoveId.get(remove.id);
        if (plLink) {
          console.log(
            `    REVERSE P&L: -$${plLink.amount_applied} from ${plLink.category} ` +
              `(${plLink.year}-${String(plLink.month).padStart(2, "0")})`
          );
          console.log(`    DELETE pl_link: ${plLink.id}`);
        } else {
          console.log("    REVERSE P&L: (none — duplicate has no transaction_pl_links row)");
        }
        console.log(`    DELETE bank_transaction: ${remove.id}`);
      }
      console.log(
        `  UPDATE keep.plaid_transaction_id -> ${group.currentPlaidTransactionId} (${group.plaidIdSource})`
      );
    }
    console.log("");
  }

  console.log("=== Summary ===");
  console.log(`Total duplicate groups: ${groups.length}`);
  console.log(`Total duplicate rows to remove: ${actions.length}`);
  console.log(`Total P&L amount to reverse: $${totalPlReversal.toFixed(2)}`);
  console.log(`Stores affected: ${byStore.size}`);
}

async function executeCleanup(groups: CleanupGroup[]): Promise<void> {
  const supabase = await createScriptSupabaseClient();

  for (const group of groups) {
    console.log(
      `Executing cleanup for ${group.storeName} ${group.keep.transaction_date} $${group.keep.amount}`
    );

    for (const remove of group.removes) {
      const plLink = group.plLinksByRemoveId.get(remove.id);
      if (plLink) {
        const { error: reverseError } = await reverseTransactionPlLinkPosting(supabase, {
          storeId: group.storeId,
          userId: group.keep.user_id,
          link: plLink,
        });
        if (reverseError) {
          throw new Error(`Failed to reverse P&L for ${remove.id}: ${reverseError}`);
        }

        const { error: deleteLinkError } = await supabase
          .from("transaction_pl_links")
          .delete()
          .eq("id", plLink.id);
        if (deleteLinkError) {
          throw new Error(`Failed to delete pl_link ${plLink.id}: ${deleteLinkError.message}`);
        }
      }

      const { error: deleteTxnError } = await supabase
        .from("bank_transactions")
        .delete()
        .eq("id", remove.id);
      if (deleteTxnError) {
        throw new Error(`Failed to delete bank_transaction ${remove.id}: ${deleteTxnError.message}`);
      }
    }

    if (group.keep.plaid_transaction_id !== group.currentPlaidTransactionId) {
      const { error: updateError } = await supabase
        .from("bank_transactions")
        .update({
          plaid_transaction_id: group.currentPlaidTransactionId,
          modified_at: new Date().toISOString(),
        })
        .eq("id", group.keep.id);
      if (updateError) {
        throw new Error(`Failed to update keep row ${group.keep.id}: ${updateError.message}`);
      }
    }
  }
}

async function main() {
  const execute = process.argv.includes("--execute");
  const groups = await findDuplicateGroups();

  if (groups.length === 0) {
    console.log("No posted duplicate Plaid transaction pairs found.");
    return;
  }

  printDryRun(groups);

  if (!execute) {
    console.log("\nDry run only. Re-run with --execute to apply these changes.");
    return;
  }

  await executeCleanup(groups);
  console.log("\nCleanup complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
