export type DuplicateCleanupTxn = {
  id: string;
  store_id: string;
  plaid_transaction_id: string;
  transaction_date: string;
  amount: number;
  transaction_type: "income" | "expense" | null;
  created_at: string;
};

export type PlaidIdStatus = "live" | "dead" | "unknown";

export type DuplicateCleanupPlaidIdSource = "plaid_api_newer" | "plaid_api_older";

export function duplicateCleanupGroupKey(
  row: Pick<DuplicateCleanupTxn, "store_id" | "transaction_date" | "amount" | "transaction_type">
): string {
  return `${row.store_id}|${row.transaction_date}|${Number(row.amount)}|${row.transaction_type}`;
}

export function clusterSameTypeDuplicateCandidates<T extends DuplicateCleanupTxn>(
  rows: T[]
): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (row.transaction_type !== "income" && row.transaction_type !== "expense") {
      continue;
    }
    const key = duplicateCleanupGroupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const clusters: T[][] = [];
  for (const clustered of groups.values()) {
    if (clustered.length < 2) continue;
    const uniquePlaidIds = new Set(clustered.map((row) => row.plaid_transaction_id));
    if (uniquePlaidIds.size < 2) continue;
    clusters.push(clustered);
  }
  return clusters;
}

export function matchConfirmedPlaidDuplicate<T extends DuplicateCleanupTxn>(params: {
  rows: T[];
  idStatus: Map<string, PlaidIdStatus>;
  idToConnectionId: Map<string, string>;
}): {
  keep: T;
  removes: T[];
  currentPlaidTransactionId: string;
  plaidIdSource: DuplicateCleanupPlaidIdSource;
  connectionId: string;
  livePlaidIds: string[];
  deadPlaidIds: string[];
} | null {
  const { rows, idStatus, idToConnectionId } = params;
  if (rows.length < 2) return null;

  const uniquePlaidIds = [...new Set(rows.map((row) => row.plaid_transaction_id))];
  if (uniquePlaidIds.length < 2) return null;

  const types = new Set(rows.map((row) => row.transaction_type));
  if (types.size !== 1 || types.has(null)) return null;

  if (uniquePlaidIds.some((id) => (idStatus.get(id) ?? "unknown") === "unknown")) {
    return null;
  }

  const livePlaidIds = uniquePlaidIds.filter((id) => idStatus.get(id) === "live");
  const deadPlaidIds = uniquePlaidIds.filter((id) => idStatus.get(id) === "dead");

  if (livePlaidIds.length !== 1 || deadPlaidIds.length < 1) {
    return null;
  }

  const liveConnectionIds = new Set(
    livePlaidIds.map((id) => idToConnectionId.get(id)).filter((id): id is string => Boolean(id))
  );
  if (liveConnectionIds.size !== 1) {
    return null;
  }

  const connectionId = [...liveConnectionIds][0];
  const currentPlaidTransactionId = livePlaidIds[0];
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const keep = sorted[0];

  return {
    keep,
    removes: sorted.slice(1),
    currentPlaidTransactionId,
    plaidIdSource:
      keep.plaid_transaction_id === currentPlaidTransactionId ? "plaid_api_older" : "plaid_api_newer",
    connectionId,
    livePlaidIds,
    deadPlaidIds,
  };
}
