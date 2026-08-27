/**
 * Cleanup duplicate Plaid bank transactions caused by pending→posted ID migrations.
 *
 * Finds posted duplicate groups (same store, connection, date, amount, transaction_type,
 * different plaid_transaction_id), keeps the oldest row, reverses the newer duplicate's
 * P&L posting, deletes the duplicate, and updates the surviving row to the live Plaid ID.
 *
 * Hard preconditions (all required):
 *   1. Keep and remove rows share transaction_type (income/expense).
 *   2. Live Plaid data shows exactly one ID still active and at least one ID dead.
 *   3. Live IDs in the group all belong to the same Plaid connection/institution.
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
  clusterSameTypeDuplicateCandidates,
  matchConfirmedPlaidDuplicate,
  type DuplicateCleanupPlaidIdSource,
  type PlaidIdStatus,
} from "../src/lib/plaidDuplicateCleanup";

type BankTransactionRow = {
  id: string;
  store_id: string;
  user_id: string;
  plaid_transaction_id: string;
  transaction_date: string;
  amount: number;
  transaction_type: "income" | "expense" | null;
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

type CleanupActionPlaidIdSource = DuplicateCleanupPlaidIdSource;

type CleanupGroup = {
  storeId: string;
  storeName: string;
  connectionId: string;
  institutionName: string;
  keep: BankTransactionRow;
  removes: BankTransactionRow[];
  plLinksByRemoveId: Map<string, TransactionPlLinkRow>;
  currentPlaidTransactionId: string;
  plaidIdSource: CleanupActionPlaidIdSource;
  livePlaidIds: string[];
  deadPlaidIds: string[];
};

type PlaidConnectionRow = {
  id: string;
  store_id: string;
  user_id: string;
  plaid_access_token: string;
  institution_name: string | null;
};

type ConnectionFetchResult = {
  connection: PlaidConnectionRow;
  ok: boolean;
  activeIds: Set<string>;
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

async function loadConnectionTransactions(
  client: PlaidApi,
  connection: PlaidConnectionRow,
  minDate: string,
  maxDate: string
): Promise<ConnectionFetchResult> {
  const activeIds = new Set<string>();

  try {
    const accessToken = decryptTokenIfEncrypted(connection.plaid_access_token);
    const pageSize = 500;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
      const response = await client.transactionsGet({
        access_token: accessToken,
        start_date: minDate,
        end_date: maxDate,
        options: { count: pageSize, offset },
      });
      total = response.data.total_transactions;
      for (const txn of response.data.transactions) {
        activeIds.add(txn.transaction_id);
      }
      offset += response.data.transactions.length;
      if (response.data.transactions.length === 0) break;
    }

    return { connection, ok: true, activeIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[cleanup] Plaid lookup failed for connection ${connection.id} (${connection.institution_name ?? "unknown"}): ${message}`
    );
    return { connection, ok: false, activeIds };
  }
}

function resolvePlaidIdStatus(params: {
  plaidTransactionId: string;
  storeConnectionResults: ConnectionFetchResult[];
  idToConnectionId: Map<string, string>;
}): PlaidIdStatus {
  const { plaidTransactionId, storeConnectionResults, idToConnectionId } = params;

  if (idToConnectionId.has(plaidTransactionId)) {
    return "live";
  }

  if (storeConnectionResults.length === 0) {
    return "unknown";
  }

  if (storeConnectionResults.some((result) => !result.ok)) {
    return "unknown";
  }

  return "dead";
}

async function findDuplicateGroups(): Promise<CleanupGroup[]> {
  const supabase = await createScriptSupabaseClient();

  const { data: stores, error: storesError } = await supabase.from("stores").select("id, name");
  if (storesError) throw new Error(storesError.message);
  const storeNameById = new Map((stores ?? []).map((store) => [store.id as string, store.name as string]));

  const txns: BankTransactionRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error: txnsError } = await supabase
      .from("bank_transactions")
      .select(
        "id, store_id, user_id, plaid_transaction_id, transaction_date, amount, transaction_type, description, status, created_at"
      )
      .not("plaid_transaction_id", "is", null)
      .eq("status", "posted")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (txnsError) throw new Error(txnsError.message);
    const page = (data ?? []) as BankTransactionRow[];
    txns.push(...page);
    if (page.length < pageSize) break;
  }

  const skippedMissingType = txns.filter(
    (row) => row.transaction_type !== "income" && row.transaction_type !== "expense"
  ).length;
  const typeMatchedClusters = clusterSameTypeDuplicateCandidates(txns);

  const amountOnlyGroups = new Map<string, BankTransactionRow[]>();
  for (const row of txns) {
    if (row.transaction_type !== "income" && row.transaction_type !== "expense") continue;
    const key = `${row.store_id}|${row.transaction_date}|${Number(row.amount)}`;
    if (!amountOnlyGroups.has(key)) amountOnlyGroups.set(key, []);
    amountOnlyGroups.get(key)!.push(row);
  }
  const typeMismatchClusters = [...amountOnlyGroups.values()].filter((rows) => {
    if (rows.length < 2) return false;
    if (new Set(rows.map((row) => row.plaid_transaction_id)).size < 2) return false;
    return new Set(rows.map((row) => row.transaction_type)).size > 1;
  });
  for (const rows of typeMismatchClusters) {
    console.log(
      `[cleanup] excluded type-mismatch ${rows[0].transaction_date} $${Number(rows[0].amount)} ` +
        `(${rows.map((row) => `${row.transaction_type}:${(row.description ?? "").slice(0, 36)}`).join(" | ")})`
    );
  }

  console.log(
    `[cleanup] Loaded ${txns.length} posted Plaid rows` +
      (skippedMissingType ? ` (${skippedMissingType} skipped, missing income/expense type)` : "") +
      `; ${typeMismatchClusters.length} type-mismatch cluster(s) excluded; ` +
      `${typeMatchedClusters.length} same-type cluster(s) to verify with Plaid.`
  );

  if (typeMatchedClusters.length === 0) {
    return [];
  }

  const storeIds = [...new Set(typeMatchedClusters.map((rows) => rows[0].store_id))];
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

  const allDates = typeMatchedClusters.flatMap((rows) => rows.map((row) => row.transaction_date));
  const minDate = allDates.reduce((min, date) => (date < min ? date : min));
  const maxDate = allDates.reduce((max, date) => (date > max ? date : max));

  const client = getPlaidClientForScript();
  const connectionResultsByStore = new Map<string, ConnectionFetchResult[]>();
  const idToConnectionId = new Map<string, string>();
  const connectionById = new Map<string, PlaidConnectionRow>();

  for (const storeId of storeIds) {
    const storeConnections = connectionsByStore.get(storeId) ?? [];
    const results: ConnectionFetchResult[] = [];
    for (const connection of storeConnections) {
      connectionById.set(connection.id, connection);
      const result = await loadConnectionTransactions(client, connection, minDate, maxDate);
      results.push(result);
      if (result.ok) {
        for (const txnId of result.activeIds) {
          idToConnectionId.set(txnId, connection.id);
        }
      }
    }
    connectionResultsByStore.set(storeId, results);
  }

  const idStatus = new Map<string, PlaidIdStatus>();
  for (const rows of typeMatchedClusters) {
    const storeResults = connectionResultsByStore.get(rows[0].store_id) ?? [];
    for (const row of rows) {
      if (idStatus.has(row.plaid_transaction_id)) continue;
      idStatus.set(
        row.plaid_transaction_id,
        resolvePlaidIdStatus({
          plaidTransactionId: row.plaid_transaction_id,
          storeConnectionResults: storeResults,
          idToConnectionId,
        })
      );
    }
  }

  const matched: Array<NonNullable<ReturnType<typeof matchConfirmedPlaidDuplicate>>> = [];
  for (const rows of typeMatchedClusters) {
    const result = matchConfirmedPlaidDuplicate({ rows, idStatus, idToConnectionId });
    if (result) {
      matched.push(result);
      continue;
    }
    const ids = [...new Set(rows.map((row) => row.plaid_transaction_id))];
    const statusSummary = ids
      .map((id) => `${id.slice(0, 8)}…=${idStatus.get(id) ?? "unknown"}`)
      .join(", ");
    console.log(
      `[cleanup] excluded same-type cluster ${rows[0].transaction_date} $${Number(rows[0].amount)} ${rows[0].transaction_type} (${statusSummary})`
    );
  }

  console.log(
    `[cleanup] ${typeMatchedClusters.length} same-store/date/amount/type cluster(s); ` +
      `${matched.length} confirmed duplicate group(s) after Plaid live/dead + same-connection checks.`
  );

  if (matched.length === 0) {
    return [];
  }

  const duplicateTxnIds = matched.flatMap((group) => [
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

  for (const match of matched) {
    const connection = connectionById.get(match.connectionId);
    const plLinksByRemoveId = new Map<string, TransactionPlLinkRow>();
    for (const remove of match.removes) {
      const link = linksByTxnId.get(remove.id);
      if (link) plLinksByRemoveId.set(remove.id, link);
    }

    cleanupGroups.push({
      storeId: match.keep.store_id,
      storeName: storeNameById.get(match.keep.store_id) ?? match.keep.store_id,
      connectionId: match.connectionId,
      institutionName: connection?.institution_name?.trim() || match.connectionId,
      keep: match.keep,
      removes: match.removes,
      plLinksByRemoveId,
      currentPlaidTransactionId: match.currentPlaidTransactionId,
      plaidIdSource: match.plaidIdSource,
      livePlaidIds: match.livePlaidIds,
      deadPlaidIds: match.deadPlaidIds,
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
      const keepLive = group.livePlaidIds.includes(group.keep.plaid_transaction_id);
      console.log("");
      console.log(
        `  Date: ${group.keep.transaction_date}  Amount: $${group.keep.amount}  Type: ${group.keep.transaction_type}`
      );
      console.log(`  Institution: ${group.institutionName} (${group.connectionId})`);
      console.log(
        `  Plaid verification: ${group.livePlaidIds.length} live / ${group.deadPlaidIds.length} dead`
      );
      console.log(`  KEEP (older):   ${group.keep.id}`);
      console.log(`    plaid_id: ${group.keep.plaid_transaction_id} (${keepLive ? "LIVE" : "DEAD"} in Plaid)`);
      console.log(`    created:  ${group.keep.created_at}`);
      console.log(`    desc:     ${(group.keep.description ?? "").slice(0, 70)}`);
      for (const remove of group.removes) {
        const removeLive = group.livePlaidIds.includes(remove.plaid_transaction_id);
        console.log(`  REMOVE (newer): ${remove.id}`);
        console.log(`    plaid_id: ${remove.plaid_transaction_id} (${removeLive ? "LIVE" : "DEAD"} in Plaid)`);
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
