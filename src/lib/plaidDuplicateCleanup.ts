export type DuplicateCleanupTxn = {
  id: string;
  store_id: string;
  plaid_transaction_id: string;
  transaction_date: string;
  amount: number;
  transaction_type: "income" | "expense" | null;
  created_at: string;
};

export type DuplicateCleanupTxnRow = DuplicateCleanupTxn & {
  user_id: string;
  description: string | null;
  status: string;
};

export type PlaidIdStatus = "live" | "dead" | "unknown";

export type DuplicateCleanupPlaidIdSource = "plaid_api_newer" | "plaid_api_older";

export type PlaidConnectionForCleanup = {
  id: string;
  store_id: string;
  user_id: string;
  plaid_access_token: string;
  institution_name: string | null;
};

export type ConnectionFetchResult = {
  connection: PlaidConnectionForCleanup;
  ok: boolean;
  activeIds: Set<string>;
};

export type DuplicateCleanupPlLink = {
  id: string;
  transaction_id: string;
  store_id: string;
  year: number;
  month: number;
  category: string;
  amount_applied: number;
};

export type DuplicateCleanupSupabase = {
  from: (table: string) => any;
};

export const DEFAULT_TRANSACTION_DATE_WINDOW_DAYS = 45;
export const DEFAULT_CREATED_WITHIN_DAYS = 14;
export const PLAID_VERIFY_DATE_BUFFER_DAYS = 7;
export const PLAID_DUPLICATE_RECONCILE_AUDIT_FIELD = "plaid_duplicate_reconciled";
export const PLAID_DUPLICATE_CORRECTED_ALERT_PREFIX = "plaid-dup-corrected-";
export const PLAID_DUPLICATE_CORRECTED_ALERT_TITLE = "Duplicate transaction corrected";

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
  for (const clustered of Array.from(groups.values())) {
    if (clustered.length < 2) continue;
    const uniquePlaidIds = new Set(clustered.map((row) => row.plaid_transaction_id));
    if (uniquePlaidIds.size < 2) continue;
    clusters.push(clustered);
  }
  return clusters;
}

export function findTypeMismatchClusters<T extends DuplicateCleanupTxn>(rows: T[]): T[][] {
  const amountOnlyGroups = new Map<string, T[]>();
  for (const row of rows) {
    if (row.transaction_type !== "income" && row.transaction_type !== "expense") continue;
    const key = `${row.store_id}|${row.transaction_date}|${Number(row.amount)}`;
    if (!amountOnlyGroups.has(key)) amountOnlyGroups.set(key, []);
    amountOnlyGroups.get(key)!.push(row);
  }

  return Array.from(amountOnlyGroups.values()).filter((clustered) => {
    if (clustered.length < 2) return false;
    if (new Set(clustered.map((row) => row.plaid_transaction_id)).size < 2) return false;
    return new Set(clustered.map((row) => row.transaction_type)).size > 1;
  });
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

  const uniquePlaidIds = Array.from(new Set(rows.map((row) => row.plaid_transaction_id)));
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

  const connectionId = Array.from(liveConnectionIds)[0];
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

export function isPlaidAutoReconcileEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const raw = env.PLAID_AUTO_RECONCILE_DUPLICATES;
  if (raw == null || raw.trim() === "") return true;
  const normalized = raw.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "off" && normalized !== "no";
}

export function shouldReconcileAfterSyncInserts(insertedCount: number): boolean {
  return insertedCount > 0;
}

export function groupPlaidConnectionsByStore(
  connections: Array<{ id: string; store_id: string }>
): Array<{ storeId: string; connectionIds: string[] }> {
  const grouped = new Map<string, string[]>();
  for (const connection of connections) {
    const existing = grouped.get(connection.store_id);
    if (existing) {
      existing.push(connection.id);
    } else {
      grouped.set(connection.store_id, [connection.id]);
    }
  }
  return Array.from(grouped.entries()).map(([storeId, connectionIds]) => ({ storeId, connectionIds }));
}

export async function runDuplicateReconcileSafely<T>(
  storeId: string,
  reconcile: (storeId: string) => Promise<T>
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  try {
    const result = await reconcile(storeId);
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[plaid/duplicate-reconcile] failed", { storeId, error: message });
    return { ok: false, error: message };
  }
}

export function utcIsoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function postedTransactionDateWindow(
  now: Date,
  windowDays: number = DEFAULT_TRANSACTION_DATE_WINDOW_DAYS
): { minDate: string; maxDate: string } {
  const today = utcIsoDate(now);
  return {
    minDate: shiftIsoDate(today, -windowDays),
    maxDate: today,
  };
}

export function expandDateRange(
  minDate: string,
  maxDate: string,
  bufferDays: number = PLAID_VERIFY_DATE_BUFFER_DAYS
): { minDate: string; maxDate: string } {
  return {
    minDate: shiftIsoDate(minDate, -bufferDays),
    maxDate: shiftIsoDate(maxDate, bufferDays),
  };
}

export function wasCreatedWithinDays(createdAt: string, now: Date, days: number): boolean {
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  return createdMs >= now.getTime() - days * 24 * 60 * 60 * 1000;
}

export function selectClustersForLiveVerification<T extends DuplicateCleanupTxn>(
  clusters: T[][],
  now: Date,
  createdWithinDays: number | null = DEFAULT_CREATED_WITHIN_DAYS
): T[][] {
  if (createdWithinDays == null) return clusters;
  return clusters.filter((rows) =>
    rows.some((row) => wasCreatedWithinDays(row.created_at, now, createdWithinDays))
  );
}

export function resolvePlaidIdStatus(params: {
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

export function formatDuplicateAlertAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatDuplicateAlertDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function buildPlaidDuplicateCorrectedAlert(params: {
  keepId: string;
  amount: number;
  transactionType: "income" | "expense";
  transactionDate: string;
}): {
  alert_key: string;
  severity: "success";
  title: string;
  body: string;
} {
  const kind = params.transactionType === "income" ? "deposit" : "expense";
  return {
    alert_key: `${PLAID_DUPLICATE_CORRECTED_ALERT_PREFIX}${params.keepId}`,
    severity: "success",
    title: PLAID_DUPLICATE_CORRECTED_ALERT_TITLE,
    body: `We removed a duplicate $${formatDuplicateAlertAmount(params.amount)} ${kind} from ${formatDuplicateAlertDate(params.transactionDate)} so your P&L stays accurate.`,
  };
}

export type PlaidTransactionsGetClient = {
  transactionsGet: (request: {
    access_token: string;
    start_date: string;
    end_date: string;
    options: { count: number; offset: number };
  }) => Promise<{
    data: {
      total_transactions: number;
      transactions: Array<{ transaction_id: string }>;
    };
  }>;
};

export async function fetchConnectionActiveTransactionIds(
  client: PlaidTransactionsGetClient,
  connection: PlaidConnectionForCleanup,
  accessToken: string,
  minDate: string,
  maxDate: string
): Promise<ConnectionFetchResult> {
  const activeIds = new Set<string>();

  try {
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
      `[plaid/duplicate-reconcile] Plaid lookup failed for connection ${connection.id} (${connection.institution_name ?? "unknown"}): ${message}`
    );
    return { connection, ok: false, activeIds };
  }
}

export type DuplicateCorrection = {
  storeId: string;
  storeName: string;
  connectionId: string;
  institutionName: string;
  keepId: string;
  removeId: string;
  transactionDate: string;
  amount: number;
  transactionType: "income" | "expense";
  description: string | null;
  reversedAmount: number | null;
  reversedCategory: string | null;
  reversedYear: number | null;
  reversedMonth: number | null;
  currentPlaidTransactionId: string;
  previousKeepPlaidTransactionId: string;
  removedPlaidTransactionId: string;
  plaidIdSource: DuplicateCleanupPlaidIdSource;
};

export type ReconcilePostedPlaidDuplicatesResult = {
  storeId: string;
  skipped: boolean;
  skipReason?: "kill_switch" | "no_candidates" | "no_confirmed_duplicates";
  candidateClusters: number;
  verifiedClusters: number;
  confirmedGroups: number;
  applied: DuplicateCorrection[];
  excluded: Array<{ reason: string; date: string; amount: number }>;
  plaidFetchCalled: boolean;
  groupErrors: Array<{ keepId: string; error: string }>;
};

export type ReverseDuplicatePlLinkFn = (
  supabase: DuplicateCleanupSupabase,
  params: {
    storeId: string;
    userId: string;
    link: Pick<DuplicateCleanupPlLink, "category" | "year" | "month" | "amount_applied">;
  }
) => Promise<{ error: string | null }>;

export type LoadLivePlaidIdsFn = (
  connections: PlaidConnectionForCleanup[],
  minDate: string,
  maxDate: string
) => Promise<ConnectionFetchResult[]>;

export type ReconcilePostedPlaidDuplicatesDeps = {
  supabase: DuplicateCleanupSupabase;
  loadLivePlaidIds: LoadLivePlaidIdsFn;
  reverseTransactionPlLinkPosting: ReverseDuplicatePlLinkFn;
  now?: Date;
  execute?: boolean;
  autoReconcileEnabled?: boolean;
  transactionDateWindowDays?: number | null;
  createdWithinDays?: number | null;
};

const TXN_SELECT =
  "id, store_id, user_id, plaid_transaction_id, transaction_date, amount, transaction_type, description, status, created_at";

async function loadPostedPlaidTransactionsForStore(
  supabase: DuplicateCleanupSupabase,
  storeId: string,
  minDate: string | null
): Promise<DuplicateCleanupTxnRow[]> {
  const rows: DuplicateCleanupTxnRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("bank_transactions")
      .select(TXN_SELECT)
      .not("plaid_transaction_id", "is", null)
      .eq("status", "posted")
      .eq("store_id", storeId);

    if (minDate) {
      query = query.gte("transaction_date", minDate);
    }

    const { data, error } = await query
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as DuplicateCleanupTxnRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

function logCorrection(correction: DuplicateCorrection): void {
  console.log(
    "[plaid/duplicate-reconcile] corrected",
    JSON.stringify({
      storeId: correction.storeId,
      storeName: correction.storeName,
      connectionId: correction.connectionId,
      institutionName: correction.institutionName,
      keepId: correction.keepId,
      removeId: correction.removeId,
      transactionDate: correction.transactionDate,
      amount: correction.amount,
      transactionType: correction.transactionType,
      description: correction.description,
      reversedAmount: correction.reversedAmount,
      reversedCategory: correction.reversedCategory,
      reversedYear: correction.reversedYear,
      reversedMonth: correction.reversedMonth,
      currentPlaidTransactionId: correction.currentPlaidTransactionId,
      previousKeepPlaidTransactionId: correction.previousKeepPlaidTransactionId,
      removedPlaidTransactionId: correction.removedPlaidTransactionId,
      plaidIdSource: correction.plaidIdSource,
    })
  );
}

export async function reconcilePostedPlaidDuplicatesForStore(
  storeId: string,
  deps: ReconcilePostedPlaidDuplicatesDeps
): Promise<ReconcilePostedPlaidDuplicatesResult> {
  const now = deps.now ?? new Date();
  const execute = deps.execute !== false;
  const enabled = deps.autoReconcileEnabled ?? isPlaidAutoReconcileEnabled();

  const emptyResult = (
    overrides: Partial<ReconcilePostedPlaidDuplicatesResult>
  ): ReconcilePostedPlaidDuplicatesResult => ({
    storeId,
    skipped: false,
    candidateClusters: 0,
    verifiedClusters: 0,
    confirmedGroups: 0,
    applied: [],
    excluded: [],
    plaidFetchCalled: false,
    groupErrors: [],
    ...overrides,
  });

  if (!enabled) {
    console.log("[plaid/duplicate-reconcile] skipped", { storeId, reason: "kill_switch" });
    return emptyResult({ skipped: true, skipReason: "kill_switch" });
  }

  const { data: store, error: storeError } = await deps.supabase
    .from("stores")
    .select("id, name")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError) throw new Error(storeError.message);
  const storeName = (store?.name as string | undefined)?.trim() || storeId;

  const windowDays =
    deps.transactionDateWindowDays === undefined
      ? DEFAULT_TRANSACTION_DATE_WINDOW_DAYS
      : deps.transactionDateWindowDays;
  const minLoadedDate =
    windowDays == null ? null : postedTransactionDateWindow(now, windowDays).minDate;
  const txns = await loadPostedPlaidTransactionsForStore(deps.supabase, storeId, minLoadedDate);

  const typeMismatchClusters = findTypeMismatchClusters(txns);
  const excluded: ReconcilePostedPlaidDuplicatesResult["excluded"] = typeMismatchClusters.map(
    (rows) => {
      console.log(
        `[plaid/duplicate-reconcile] excluded type-mismatch ${rows[0].transaction_date} $${Number(rows[0].amount)} ` +
          `(${rows.map((row) => `${row.transaction_type}:${(row.description ?? "").slice(0, 36)}`).join(" | ")})`
      );
      return {
        reason: "type_mismatch",
        date: rows[0].transaction_date,
        amount: Number(rows[0].amount),
      };
    }
  );

  const typeMatchedClusters = clusterSameTypeDuplicateCandidates(txns);
  const clustersToVerify = selectClustersForLiveVerification(
    typeMatchedClusters,
    now,
    deps.createdWithinDays === undefined ? DEFAULT_CREATED_WITHIN_DAYS : deps.createdWithinDays
  );

  if (clustersToVerify.length === 0) {
    return emptyResult({
      skipped: true,
      skipReason: "no_candidates",
      candidateClusters: typeMatchedClusters.length,
      excluded,
    });
  }

  const { data: connections, error: connectionsError } = await deps.supabase
    .from("plaid_connections")
    .select("id, store_id, user_id, plaid_access_token, institution_name")
    .eq("store_id", storeId);

  if (connectionsError) throw new Error(connectionsError.message);
  const storeConnections = (connections ?? []) as PlaidConnectionForCleanup[];

  const allDates = clustersToVerify.flatMap((rows) => rows.map((row) => row.transaction_date));
  const minDate = allDates.reduce((min, date) => (date < min ? date : min));
  const maxDate = allDates.reduce((max, date) => (date > max ? date : max));
  const verifyRange = expandDateRange(minDate, maxDate);

  const storeConnectionResults = await deps.loadLivePlaidIds(
    storeConnections,
    verifyRange.minDate,
    verifyRange.maxDate
  );

  const idToConnectionId = new Map<string, string>();
  const connectionById = new Map<string, PlaidConnectionForCleanup>();
  for (const result of storeConnectionResults) {
    connectionById.set(result.connection.id, result.connection);
    if (!result.ok) continue;
    for (const txnId of Array.from(result.activeIds)) {
      idToConnectionId.set(txnId, result.connection.id);
    }
  }

  const idStatus = new Map<string, PlaidIdStatus>();
  for (const rows of clustersToVerify) {
    for (const row of rows) {
      if (idStatus.has(row.plaid_transaction_id)) continue;
      idStatus.set(
        row.plaid_transaction_id,
        resolvePlaidIdStatus({
          plaidTransactionId: row.plaid_transaction_id,
          storeConnectionResults,
          idToConnectionId,
        })
      );
    }
  }

  const matched: Array<NonNullable<ReturnType<typeof matchConfirmedPlaidDuplicate<DuplicateCleanupTxnRow>>>> =
    [];

  for (const rows of clustersToVerify) {
    const result = matchConfirmedPlaidDuplicate({ rows, idStatus, idToConnectionId });
    if (result) {
      matched.push(result);
      continue;
    }
    const ids = Array.from(new Set(rows.map((row) => row.plaid_transaction_id)));
    const statusSummary = ids
      .map((id) => `${id.slice(0, 8)}…=${idStatus.get(id) ?? "unknown"}`)
      .join(", ");
    console.log(
      `[plaid/duplicate-reconcile] excluded same-type cluster ${rows[0].transaction_date} $${Number(rows[0].amount)} ${rows[0].transaction_type} (${statusSummary})`
    );
    excluded.push({
      reason: "not_confirmed",
      date: rows[0].transaction_date,
      amount: Number(rows[0].amount),
    });
  }

  if (matched.length === 0) {
    return emptyResult({
      skipped: true,
      skipReason: "no_confirmed_duplicates",
      candidateClusters: typeMatchedClusters.length,
      verifiedClusters: clustersToVerify.length,
      excluded,
      plaidFetchCalled: true,
    });
  }

  const duplicateTxnIds = matched.flatMap((group) => [
    group.keep.id,
    ...group.removes.map((row) => row.id),
  ]);
  const { data: links, error: linksError } = await deps.supabase
    .from("transaction_pl_links")
    .select("id, transaction_id, store_id, year, month, category, amount_applied")
    .in("transaction_id", duplicateTxnIds);

  if (linksError) throw new Error(linksError.message);
  const linksByTxnId = new Map<string, DuplicateCleanupPlLink>();
  for (const link of (links ?? []) as DuplicateCleanupPlLink[]) {
    linksByTxnId.set(link.transaction_id, link);
  }

  const applied: DuplicateCorrection[] = [];
  const groupErrors: Array<{ keepId: string; error: string }> = [];

  if (!execute) {
    for (const group of matched) {
      const connection = connectionById.get(group.connectionId);
      for (const remove of group.removes) {
        const plLink = linksByTxnId.get(remove.id) ?? null;
        console.log(
          "[plaid/duplicate-reconcile] dry-run",
          JSON.stringify({
            storeId,
            storeName,
            connectionId: group.connectionId,
            institutionName: connection?.institution_name?.trim() || group.connectionId,
            keepId: group.keep.id,
            removeId: remove.id,
            transactionDate: group.keep.transaction_date,
            amount: Number(group.keep.amount),
            transactionType: group.keep.transaction_type,
            reversedAmount: plLink ? Number(plLink.amount_applied) : null,
            reversedCategory: plLink?.category ?? null,
            currentPlaidTransactionId: group.currentPlaidTransactionId,
          })
        );
      }
    }
    return emptyResult({
      candidateClusters: typeMatchedClusters.length,
      verifiedClusters: clustersToVerify.length,
      confirmedGroups: matched.length,
      excluded,
      plaidFetchCalled: true,
    });
  }

  for (const group of matched) {
    const transactionType = group.keep.transaction_type;
    if (transactionType !== "income" && transactionType !== "expense") continue;

    const connection = connectionById.get(group.connectionId);
    const groupCorrections: DuplicateCorrection[] = [];

    try {
      for (const remove of group.removes) {
        const plLink = linksByTxnId.get(remove.id) ?? null;
        if (plLink) {
          const { error: reverseError } = await deps.reverseTransactionPlLinkPosting(deps.supabase, {
            storeId,
            userId: group.keep.user_id,
            link: plLink,
          });
          if (reverseError) {
            throw new Error(`Failed to reverse P&L for ${remove.id}: ${reverseError}`);
          }

          const { error: deleteLinkError } = await deps.supabase
            .from("transaction_pl_links")
            .delete()
            .eq("id", plLink.id);
          if (deleteLinkError) {
            throw new Error(`Failed to delete pl_link ${plLink.id}: ${deleteLinkError.message}`);
          }
        }

        const { error: deleteTxnError } = await deps.supabase
          .from("bank_transactions")
          .delete()
          .eq("id", remove.id);
        if (deleteTxnError) {
          throw new Error(`Failed to delete bank_transaction ${remove.id}: ${deleteTxnError.message}`);
        }

        groupCorrections.push({
          storeId,
          storeName,
          connectionId: group.connectionId,
          institutionName: connection?.institution_name?.trim() || group.connectionId,
          keepId: group.keep.id,
          removeId: remove.id,
          transactionDate: group.keep.transaction_date,
          amount: Number(group.keep.amount),
          transactionType,
          description: remove.description,
          reversedAmount: plLink ? Number(plLink.amount_applied) : null,
          reversedCategory: plLink?.category ?? null,
          reversedYear: plLink?.year ?? null,
          reversedMonth: plLink?.month ?? null,
          currentPlaidTransactionId: group.currentPlaidTransactionId,
          previousKeepPlaidTransactionId: group.keep.plaid_transaction_id,
          removedPlaidTransactionId: remove.plaid_transaction_id,
          plaidIdSource: group.plaidIdSource,
        });
      }

      if (group.keep.plaid_transaction_id !== group.currentPlaidTransactionId) {
        const { error: updateError } = await deps.supabase
          .from("bank_transactions")
          .update({
            plaid_transaction_id: group.currentPlaidTransactionId,
            modified_at: now.toISOString(),
          })
          .eq("id", group.keep.id);
        if (updateError) {
          throw new Error(`Failed to update keep row ${group.keep.id}: ${updateError.message}`);
        }
      }

      for (const correction of groupCorrections) {
        const { error: auditError } = await deps.supabase.from("transaction_audit_log").insert({
          transaction_id: correction.keepId,
          store_id: storeId,
          user_id: group.keep.user_id,
          field_changed: PLAID_DUPLICATE_RECONCILE_AUDIT_FIELD,
          old_value: correction.removeId,
          new_value: JSON.stringify({
            removedTransactionId: correction.removeId,
            previousPlaidTransactionId: correction.previousKeepPlaidTransactionId,
            currentPlaidTransactionId: correction.currentPlaidTransactionId,
            removedPlaidTransactionId: correction.removedPlaidTransactionId,
            reversedAmount: correction.reversedAmount,
            reversedCategory: correction.reversedCategory,
            reversedYear: correction.reversedYear,
            reversedMonth: correction.reversedMonth,
          }),
          change_source: "system",
        });
        if (auditError) {
          console.error("[plaid/duplicate-reconcile] failed to write audit log", {
            storeId,
            keepId: correction.keepId,
            error: auditError.message,
          });
        }

        logCorrection(correction);
        applied.push(correction);
      }

      const alert = buildPlaidDuplicateCorrectedAlert({
        keepId: group.keep.id,
        amount: Number(group.keep.amount),
        transactionType,
        transactionDate: group.keep.transaction_date,
      });

      const { data: existingAlerts, error: existingAlertError } = await deps.supabase
        .from("store_alerts")
        .select("alert_key")
        .eq("store_id", storeId)
        .eq("alert_key", alert.alert_key);

      if (existingAlertError) {
        console.error("[plaid/duplicate-reconcile] failed to load existing alert", {
          storeId,
          keepId: group.keep.id,
          error: existingAlertError.message,
        });
      } else if ((existingAlerts ?? []).length === 0) {
        const { error: alertError } = await deps.supabase.from("store_alerts").insert({
          user_id: group.keep.user_id,
          store_id: storeId,
          alert_key: alert.alert_key,
          severity: alert.severity,
          title: alert.title,
          body: alert.body,
          resolved_at: now.toISOString(),
        });
        if (alertError) {
          console.error("[plaid/duplicate-reconcile] failed to write in-app alert", {
            storeId,
            keepId: group.keep.id,
            error: alertError.message,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[plaid/duplicate-reconcile] group failed", {
        storeId,
        keepId: group.keep.id,
        error: message,
      });
      groupErrors.push({ keepId: group.keep.id, error: message });
    }
  }

  return {
    storeId,
    skipped: false,
    candidateClusters: typeMatchedClusters.length,
    verifiedClusters: clustersToVerify.length,
    confirmedGroups: matched.length,
    applied,
    excluded,
    plaidFetchCalled: true,
    groupErrors,
  };
}
