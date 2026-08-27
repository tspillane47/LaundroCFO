import { describe, expect, it, vi } from "vitest";
import { isPositiveEventAlertKey } from "@/lib/intelligence";
import {
  buildPlaidDuplicateCorrectedAlert,
  clusterSameTypeDuplicateCandidates,
  DEFAULT_CREATED_WITHIN_DAYS,
  DEFAULT_TRANSACTION_DATE_WINDOW_DAYS,
  expandDateRange,
  fetchConnectionActiveTransactionIds,
  findTypeMismatchClusters,
  groupPlaidConnectionsByStore,
  isPlaidAutoReconcileEnabled,
  matchConfirmedPlaidDuplicate,
  PLAID_DUPLICATE_CORRECTED_ALERT_PREFIX,
  PLAID_DUPLICATE_CORRECTED_ALERT_TITLE,
  PLAID_DUPLICATE_RECONCILE_AUDIT_FIELD,
  PLAID_VERIFY_DATE_BUFFER_DAYS,
  postedTransactionDateWindow,
  reconcilePostedPlaidDuplicatesForStore,
  resolvePlaidIdStatus,
  runDuplicateReconcileSafely,
  selectClustersForLiveVerification,
  shouldReconcileAfterSyncInserts,
  shiftIsoDate,
  type ConnectionFetchResult,
  type DuplicateCleanupPlLink,
  type DuplicateCleanupTxn,
  type DuplicateCleanupTxnRow,
  type PlaidConnectionForCleanup,
} from "@/lib/plaidDuplicateCleanup";

const STORE = "ec20b2ce-2951-4cf0-9e1c-cf5ee53bb056";
const OTHER_STORE = "aaaaaaaa-1111-4cf0-9e1c-cf5ee53bb056";
const USER = "user-community-bank";
const COMMUNITY_BANK = "community-bank-connection";
const EASTRISE = "eastrise-connection";
const NOW = new Date("2026-08-27T16:00:00.000Z");

function row(
  overrides: Pick<
    DuplicateCleanupTxn,
    "id" | "plaid_transaction_id" | "transaction_date" | "amount" | "transaction_type" | "created_at"
  > &
    Partial<Pick<DuplicateCleanupTxn, "store_id">>
): DuplicateCleanupTxn {
  return { store_id: STORE, ...overrides };
}

function txnRow(
  overrides: Pick<
    DuplicateCleanupTxnRow,
    "id" | "plaid_transaction_id" | "transaction_date" | "amount" | "transaction_type" | "created_at"
  > &
    Partial<DuplicateCleanupTxnRow>
): DuplicateCleanupTxnRow {
  return {
    store_id: STORE,
    user_id: USER,
    description: overrides.description ?? "CCD Deposit",
    status: "posted",
    ...overrides,
  };
}

const deposit484Memo = row({
  id: "13bfc9be-f501-47bc-8ef8-7eb21844cee0",
  plaid_transaction_id: "jEKxLMnqdjCb5pxE4A1ytLpd8xvgVkHk8YNeb3",
  transaction_date: "2026-08-25",
  amount: 484.75,
  transaction_type: "income",
  created_at: "2026-08-25T13:04:02.908806",
});

const deposit484Ccd = row({
  id: "4c5d1482-4bad-403c-8f66-863cca05cff5",
  plaid_transaction_id: "M4g0DxKQAbCJVBmAgrX3UVonE13xk4Tg6VK1nq",
  transaction_date: "2026-08-25",
  amount: 484.75,
  transaction_type: "income",
  created_at: "2026-08-27T10:55:26.306019",
});

const juneFee = row({
  id: "fbe7068b-6b52-4c8d-96f7-ebea785d5900",
  plaid_transaction_id: "BgKKXrLXBPS89pRNYkX5sYAJ011QZ7cQz8DoQ",
  transaction_date: "2026-06-01",
  amount: 5,
  transaction_type: "expense",
  created_at: "2026-08-25T13:04:05.089284",
});

const juneWaiver = row({
  id: "6043141d-96fb-427a-a0c7-62f736af69e7",
  plaid_transaction_id: "qQJJbzKb08C4YgABxjrmCj68yZZ9qJfPzxjXn",
  transaction_date: "2026-06-01",
  amount: 5,
  transaction_type: "income",
  created_at: "2026-08-25T13:04:05.089284",
});

const julyFee = row({
  id: "9e7169be-7a77-4935-9e88-292d6b3df7aa",
  plaid_transaction_id: "LpwwNgZN4ji1wD3bRq8OTR3N7mm5JBUavdLwB",
  transaction_date: "2026-07-01",
  amount: 5,
  transaction_type: "expense",
  created_at: "2026-08-25T13:04:05.089284",
});

const julyWaiver = row({
  id: "ea2281fe-67d7-4701-ac9e-0fc31e08e81d",
  plaid_transaction_id: "60aaX18XnKuPzQy6AY84uqdXzJJ4brSmDVe5A",
  transaction_date: "2026-07-01",
  amount: 5,
  transaction_type: "income",
  created_at: "2026-08-25T13:04:05.089284",
});

const augustFee = row({
  id: "eaf238fa-0832-4e2e-8601-eafb5a724dcb",
  plaid_transaction_id: "EVvvpx3pKmidEo9XaAnecaJPMbamdyhq9V4n06",
  transaction_date: "2026-08-01",
  amount: 5,
  transaction_type: "expense",
  created_at: "2026-08-25T13:04:05.089284",
});

const augustWaiver = row({
  id: "601c61b6-90dd-4b7b-83eb-9af0e7c1227c",
  plaid_transaction_id: "MX66p7opanuA6zM08JeXh8bkKd8DNxugJL6pnQ",
  transaction_date: "2026-08-01",
  amount: 5,
  transaction_type: "income",
  created_at: "2026-08-25T13:04:05.089284",
});

const communityConnection: PlaidConnectionForCleanup = {
  id: COMMUNITY_BANK,
  store_id: STORE,
  user_id: USER,
  plaid_access_token: "encrypted-token",
  institution_name: "Community Bank",
};

const eastriseConnection: PlaidConnectionForCleanup = {
  id: EASTRISE,
  store_id: STORE,
  user_id: USER,
  plaid_access_token: "encrypted-eastrise",
  institution_name: "EastRise",
};

type MockDb = {
  store?: { id: string; name: string } | null;
  transactions: DuplicateCleanupTxnRow[];
  connections: PlaidConnectionForCleanup[];
  links: DuplicateCleanupPlLink[];
  existingAlertKeys?: string[];
  deleteLinkError?: string | null;
  deleteTxnError?: string | null;
  updateError?: string | null;
  auditError?: string | null;
  alertError?: string | null;
};

function createMockSupabase(db: MockDb) {
  const ops: string[] = [];
  const auditInserts: Array<Record<string, unknown>> = [];
  const alertInserts: Array<Record<string, unknown>> = [];
  const storeFilters: string[] = [];
  const dateGteFilters: string[] = [];

  const supabase = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let mode: "select" | "insert" | "update" | "delete" = "select";
      let payload: unknown = null;

      const execute = async () => {
        if (table === "stores") {
          return { data: db.store ?? null, error: null };
        }

        if (table === "bank_transactions" && mode === "select") {
          const storeId = filters.store_id as string | undefined;
          if (storeId) storeFilters.push(storeId);
          const minDate = filters["gte:transaction_date"] as string | undefined;
          if (minDate) dateGteFilters.push(minDate);
          let rows = db.transactions.filter((row) => row.status === "posted" && row.plaid_transaction_id);
          if (storeId) rows = rows.filter((row) => row.store_id === storeId);
          if (minDate) rows = rows.filter((row) => row.transaction_date >= minDate);
          const from = (filters.rangeFrom as number | undefined) ?? 0;
          const to = (filters.rangeTo as number | undefined) ?? rows.length - 1;
          return { data: rows.slice(from, to + 1), error: null };
        }

        if (table === "bank_transactions" && mode === "delete") {
          const id = filters.id as string;
          if (db.deleteTxnError) return { error: { message: db.deleteTxnError } };
          ops.push(`delete_txn:${id}`);
          db.transactions = db.transactions.filter((row) => row.id !== id);
          return { error: null };
        }

        if (table === "bank_transactions" && mode === "update") {
          const id = filters.id as string;
          if (db.updateError) return { error: { message: db.updateError } };
          const nextId = (payload as { plaid_transaction_id: string }).plaid_transaction_id;
          ops.push(`update_keep:${id}:${nextId}`);
          db.transactions = db.transactions.map((row) =>
            row.id === id ? { ...row, plaid_transaction_id: nextId } : row
          );
          return { error: null };
        }

        if (table === "plaid_connections") {
          const storeId = filters.store_id as string | undefined;
          const rows = storeId
            ? db.connections.filter((connection) => connection.store_id === storeId)
            : db.connections;
          return { data: rows, error: null };
        }

        if (table === "transaction_pl_links" && mode === "select") {
          const ids = (filters["in:transaction_id"] as string[] | undefined) ?? [];
          return {
            data: db.links.filter((link) => ids.includes(link.transaction_id)),
            error: null,
          };
        }

        if (table === "transaction_pl_links" && mode === "delete") {
          const id = filters.id as string;
          if (db.deleteLinkError) return { error: { message: db.deleteLinkError } };
          ops.push(`delete_link:${id}`);
          db.links = db.links.filter((link) => link.id !== id);
          return { error: null };
        }

        if (table === "transaction_audit_log" && mode === "insert") {
          if (db.auditError) return { error: { message: db.auditError } };
          ops.push("audit");
          auditInserts.push(payload as Record<string, unknown>);
          return { error: null };
        }

        if (table === "store_alerts" && mode === "select") {
          const key = filters.alert_key as string | undefined;
          const existing = (db.existingAlertKeys ?? []).filter((item) => !key || item === key);
          return { data: existing.map((alert_key) => ({ alert_key })), error: null };
        }

        if (table === "store_alerts" && mode === "insert") {
          if (db.alertError) return { error: { message: db.alertError } };
          ops.push("alert");
          alertInserts.push(payload as Record<string, unknown>);
          return { error: null };
        }

        throw new Error(`Unexpected supabase call ${mode} ${table}`);
      };

      const query: Record<string, unknown> = {
        select: () => {
          mode = "select";
          return query;
        },
        not: () => query,
        eq: (col: string, value: unknown) => {
          filters[col] = value;
          return query;
        },
        gte: (col: string, value: unknown) => {
          filters[`gte:${col}`] = value;
          return query;
        },
        in: (col: string, values: unknown[]) => {
          filters[`in:${col}`] = values;
          return query;
        },
        order: () => query,
        range: (from: number, to: number) => {
          filters.rangeFrom = from;
          filters.rangeTo = to;
          return query;
        },
        maybeSingle: () => execute(),
        update: (nextPayload: unknown) => {
          mode = "update";
          payload = nextPayload;
          return query;
        },
        delete: () => {
          mode = "delete";
          return query;
        },
        insert: (nextPayload: unknown) => {
          mode = "insert";
          payload = nextPayload;
          return execute();
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          execute().then(resolve, reject),
      };

      return query;
    },
  };

  return { supabase, ops, auditInserts, alertInserts, storeFilters, dateGteFilters };
}

describe("clusterSameTypeDuplicateCandidates", () => {
  it("keeps the $484.75 same-type pair and drops opposite-type $5 fee/waiver pairs", () => {
    const clusters = clusterSameTypeDuplicateCandidates([
      deposit484Memo,
      deposit484Ccd,
      juneFee,
      juneWaiver,
      julyFee,
      julyWaiver,
      augustFee,
      augustWaiver,
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((item) => item.plaid_transaction_id).sort()).toEqual(
      [deposit484Memo.plaid_transaction_id, deposit484Ccd.plaid_transaction_id].sort()
    );
  });

  it("does not cluster the same date/amount across different stores", () => {
    const otherStoreCopy = row({
      ...deposit484Ccd,
      id: "other-store-row",
      store_id: OTHER_STORE,
    });
    const clusters = clusterSameTypeDuplicateCandidates([deposit484Memo, otherStoreCopy]);
    expect(clusters).toHaveLength(0);
  });
});

describe("findTypeMismatchClusters", () => {
  it("flags the $5 fee/waiver pairs and ignores the same-type $484.75 deposit", () => {
    const mismatches = findTypeMismatchClusters([
      deposit484Memo,
      deposit484Ccd,
      juneFee,
      juneWaiver,
    ]);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].map((item) => item.transaction_type).sort()).toEqual(["expense", "income"]);
  });
});

describe("matchConfirmedPlaidDuplicate", () => {
  it("flags the $484.75 pair when exactly one Plaid ID is dead on the same connection", () => {
    const match = matchConfirmedPlaidDuplicate({
      rows: [deposit484Memo, deposit484Ccd],
      idStatus: new Map([
        [deposit484Memo.plaid_transaction_id, "dead"],
        [deposit484Ccd.plaid_transaction_id, "live"],
      ]),
      idToConnectionId: new Map([[deposit484Ccd.plaid_transaction_id, COMMUNITY_BANK]]),
    });

    expect(match).not.toBeNull();
    expect(match?.keep.id).toBe(deposit484Memo.id);
    expect(match?.removes.map((item) => item.id)).toEqual([deposit484Ccd.id]);
    expect(match?.currentPlaidTransactionId).toBe(deposit484Ccd.plaid_transaction_id);
    expect(match?.plaidIdSource).toBe("plaid_api_newer");
    expect(match?.connectionId).toBe(COMMUNITY_BANK);
  });

  it("rejects $5 fee/waiver pairs that are both still live in Plaid", () => {
    const match = matchConfirmedPlaidDuplicate({
      rows: [juneFee, juneWaiver],
      idStatus: new Map([
        [juneFee.plaid_transaction_id, "live"],
        [juneWaiver.plaid_transaction_id, "live"],
      ]),
      idToConnectionId: new Map([
        [juneFee.plaid_transaction_id, EASTRISE],
        [juneWaiver.plaid_transaction_id, EASTRISE],
      ]),
    });

    expect(match).toBeNull();
  });

  it("rejects opposite transaction_type even if Plaid shows one dead ID", () => {
    const match = matchConfirmedPlaidDuplicate({
      rows: [juneFee, juneWaiver],
      idStatus: new Map([
        [juneFee.plaid_transaction_id, "dead"],
        [juneWaiver.plaid_transaction_id, "live"],
      ]),
      idToConnectionId: new Map([[juneWaiver.plaid_transaction_id, EASTRISE]]),
    });

    expect(match).toBeNull();
  });

  it("rejects when both IDs are still live, including across different connections", () => {
    const communityIncome = row({
      id: "community-income",
      plaid_transaction_id: "community-live-id",
      transaction_date: "2026-06-01",
      amount: 5,
      transaction_type: "income",
      created_at: "2026-08-25T13:04:05.089284",
    });

    const match = matchConfirmedPlaidDuplicate({
      rows: [juneWaiver, communityIncome],
      idStatus: new Map([
        [juneWaiver.plaid_transaction_id, "live"],
        [communityIncome.plaid_transaction_id, "live"],
      ]),
      idToConnectionId: new Map([
        [juneWaiver.plaid_transaction_id, EASTRISE],
        [communityIncome.plaid_transaction_id, COMMUNITY_BANK],
      ]),
    });

    expect(match).toBeNull();
  });

  it("rejects when Plaid status is unknown (lookup failed)", () => {
    const match = matchConfirmedPlaidDuplicate({
      rows: [deposit484Memo, deposit484Ccd],
      idStatus: new Map([
        [deposit484Memo.plaid_transaction_id, "unknown"],
        [deposit484Ccd.plaid_transaction_id, "live"],
      ]),
      idToConnectionId: new Map([[deposit484Ccd.plaid_transaction_id, COMMUNITY_BANK]]),
    });

    expect(match).toBeNull();
  });
});

describe("kill switch and cron helpers", () => {
  it("defaults PLAID_AUTO_RECONCILE_DUPLICATES to on", () => {
    expect(isPlaidAutoReconcileEnabled({})).toBe(true);
    expect(isPlaidAutoReconcileEnabled({ PLAID_AUTO_RECONCILE_DUPLICATES: "" })).toBe(true);
    expect(isPlaidAutoReconcileEnabled({ PLAID_AUTO_RECONCILE_DUPLICATES: "true" })).toBe(true);
  });

  it("disables auto-reconcile for false/0/off/no", () => {
    expect(isPlaidAutoReconcileEnabled({ PLAID_AUTO_RECONCILE_DUPLICATES: "false" })).toBe(false);
    expect(isPlaidAutoReconcileEnabled({ PLAID_AUTO_RECONCILE_DUPLICATES: "0" })).toBe(false);
    expect(isPlaidAutoReconcileEnabled({ PLAID_AUTO_RECONCILE_DUPLICATES: "off" })).toBe(false);
    expect(isPlaidAutoReconcileEnabled({ PLAID_AUTO_RECONCILE_DUPLICATES: "NO" })).toBe(false);
  });

  it("only follows up a manual/cron sync when that sync inserted rows", () => {
    expect(shouldReconcileAfterSyncInserts(0)).toBe(false);
    expect(shouldReconcileAfterSyncInserts(1)).toBe(true);
  });

  it("groups Plaid connections by store without mixing stores", () => {
    expect(
      groupPlaidConnectionsByStore([
        { id: "c1", store_id: STORE },
        { id: "c2", store_id: OTHER_STORE },
        { id: "c3", store_id: STORE },
      ])
    ).toEqual([
      { storeId: STORE, connectionIds: ["c1", "c3"] },
      { storeId: OTHER_STORE, connectionIds: ["c2"] },
    ]);
  });

  it("swallows reconcile errors so the parent sync can stay successful", async () => {
    const result = await runDuplicateReconcileSafely(STORE, async () => {
      throw new Error("Plaid blew up");
    });
    expect(result).toEqual({ ok: false, error: "Plaid blew up" });
  });

  it("returns the reconcile result when the store pass succeeds", async () => {
    const result = await runDuplicateReconcileSafely(STORE, async () => ({ applied: 1 }));
    expect(result).toEqual({ ok: true, result: { applied: 1 } });
  });
});

describe("lookback windows", () => {
  it("uses a 45-day posted transaction_date window ending today UTC", () => {
    expect(DEFAULT_TRANSACTION_DATE_WINDOW_DAYS).toBe(45);
    expect(postedTransactionDateWindow(NOW)).toEqual({
      minDate: "2026-07-13",
      maxDate: "2026-08-27",
    });
  });

  it("expands Plaid verification dates by 7 days on each side", () => {
    expect(PLAID_VERIFY_DATE_BUFFER_DAYS).toBe(7);
    expect(expandDateRange("2026-08-25", "2026-08-25")).toEqual({
      minDate: "2026-08-18",
      maxDate: "2026-09-01",
    });
  });

  it("only sends clusters with a recently created row to live Plaid verification", () => {
    expect(DEFAULT_CREATED_WITHIN_DAYS).toBe(14);
    const stale = row({
      ...deposit484Memo,
      created_at: "2026-07-01T13:04:02.908806",
    });
    const stalePair = row({
      ...deposit484Ccd,
      id: "stale-new",
      created_at: "2026-07-02T13:04:02.908806",
    });

    expect(selectClustersForLiveVerification([[stale, stalePair]], NOW)).toEqual([]);
    expect(selectClustersForLiveVerification([[deposit484Memo, deposit484Ccd]], NOW)).toHaveLength(1);
  });

  it("keeps a cluster when the original row is old but the duplicate arrived recently", () => {
    const oldOriginal = row({
      ...deposit484Memo,
      created_at: "2026-07-01T13:04:02.908806",
    });
    expect(selectClustersForLiveVerification([[oldOriginal, deposit484Ccd]], NOW)).toHaveLength(1);
  });
});

describe("resolvePlaidIdStatus", () => {
  it("marks an ID live when it was returned by a connection fetch", () => {
    const idToConnectionId = new Map([[deposit484Ccd.plaid_transaction_id, COMMUNITY_BANK]]);
    expect(
      resolvePlaidIdStatus({
        plaidTransactionId: deposit484Ccd.plaid_transaction_id,
        storeConnectionResults: [],
        idToConnectionId,
      })
    ).toBe("live");
  });

  it("marks missing IDs unknown when any connection fetch failed", () => {
    expect(
      resolvePlaidIdStatus({
        plaidTransactionId: deposit484Memo.plaid_transaction_id,
        storeConnectionResults: [
          { connection: communityConnection, ok: false, activeIds: new Set() },
        ],
        idToConnectionId: new Map(),
      })
    ).toBe("unknown");
  });

  it("marks missing IDs dead only after every connection fetch succeeded", () => {
    expect(
      resolvePlaidIdStatus({
        plaidTransactionId: deposit484Memo.plaid_transaction_id,
        storeConnectionResults: [
          { connection: communityConnection, ok: true, activeIds: new Set([deposit484Ccd.plaid_transaction_id]) },
        ],
        idToConnectionId: new Map([[deposit484Ccd.plaid_transaction_id, COMMUNITY_BANK]]),
      })
    ).toBe("dead");
  });
});

describe("in-app alert copy", () => {
  it("builds the drafted success copy and a stable alert key", () => {
    const alert = buildPlaidDuplicateCorrectedAlert({
      keepId: deposit484Memo.id,
      amount: 484.75,
      transactionType: "income",
      transactionDate: "2026-08-25",
    });

    expect(alert).toEqual({
      alert_key: `${PLAID_DUPLICATE_CORRECTED_ALERT_PREFIX}${deposit484Memo.id}`,
      severity: "success",
      title: PLAID_DUPLICATE_CORRECTED_ALERT_TITLE,
      body: "We removed a duplicate $484.75 deposit from Aug 25 so your P&L stays accurate.",
    });
    expect(isPositiveEventAlertKey(alert.alert_key)).toBe(true);
  });

  it("uses expense wording for expense duplicates", () => {
    const alert = buildPlaidDuplicateCorrectedAlert({
      keepId: "expense-keep",
      amount: 5,
      transactionType: "expense",
      transactionDate: "2026-08-01",
    });
    expect(alert.body).toBe(
      "We removed a duplicate $5.00 expense from Aug 1 so your P&L stays accurate."
    );
  });
});

describe("fetchConnectionActiveTransactionIds", () => {
  it("pages through Plaid transactionsGet and records every live ID", async () => {
    const client = {
      transactionsGet: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            total_transactions: 2,
            transactions: [{ transaction_id: "live-1" }],
          },
        })
        .mockResolvedValueOnce({
          data: {
            total_transactions: 2,
            transactions: [{ transaction_id: "live-2" }],
          },
        }),
    };

    const result = await fetchConnectionActiveTransactionIds(
      client,
      communityConnection,
      "access-token",
      "2026-08-18",
      "2026-09-01"
    );

    expect(result.ok).toBe(true);
    expect([...result.activeIds]).toEqual(["live-1", "live-2"]);
    expect(client.transactionsGet).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false without throwing when Plaid lookup fails", async () => {
    const result = await fetchConnectionActiveTransactionIds(
      {
        transactionsGet: vi.fn().mockRejectedValue(new Error("ITEM_LOGIN_REQUIRED")),
      },
      communityConnection,
      "access-token",
      "2026-08-18",
      "2026-09-01"
    );
    expect(result).toMatchObject({ ok: false, activeIds: new Set() });
  });
});

describe("reconcilePostedPlaidDuplicatesForStore", () => {
  const keep = txnRow({ ...deposit484Memo, description: "ACH CREDIT MEMO" });
  const remove = txnRow({ ...deposit484Ccd, description: "CCD Deposit" });
  const removeLink: DuplicateCleanupPlLink = {
    id: "pl-link-remove",
    transaction_id: remove.id,
    store_id: STORE,
    year: 2026,
    month: 8,
    category: "self_service_revenue",
    amount_applied: 484.75,
  };

  function liveCommunityFetch(connections: PlaidConnectionForCleanup[]): ConnectionFetchResult[] {
    return connections.map((connection) => ({
      connection,
      ok: true,
      activeIds:
        connection.id === COMMUNITY_BANK
          ? new Set([remove.plaid_transaction_id])
          : new Set<string>(),
    }));
  }

  it("does not call Plaid when there are no same-type clusters", async () => {
    const loadLivePlaidIds = vi.fn();
    const { supabase } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, txnRow({ ...augustFee, description: "Monthly fee" })],
      connections: [communityConnection],
      links: [],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds,
      reverseTransactionPlLinkPosting: vi.fn(),
      now: NOW,
    });

    expect(loadLivePlaidIds).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      skipped: true,
      skipReason: "no_candidates",
      plaidFetchCalled: false,
      applied: [],
    });
  });

  it("does not call Plaid for stale same-type clusters outside the 14-day created_at window", async () => {
    const loadLivePlaidIds = vi.fn();
    const { supabase } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [
        txnRow({ ...keep, created_at: "2026-07-01T13:04:02.908806" }),
        txnRow({ ...remove, created_at: "2026-07-02T10:55:26.306019" }),
      ],
      connections: [communityConnection],
      links: [removeLink],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds,
      reverseTransactionPlLinkPosting: vi.fn(),
      now: NOW,
    });

    expect(loadLivePlaidIds).not.toHaveBeenCalled();
    expect(result.skipReason).toBe("no_candidates");
  });

  it("scopes the scan to the requested store and the 45-day date window", async () => {
    const loadLivePlaidIds = vi.fn(async (connections) => liveCommunityFetch(connections));
    const otherStoreDup = txnRow({
      ...remove,
      id: "other-store-dup",
      store_id: OTHER_STORE,
      plaid_transaction_id: "other-store-plaid",
    });
    const { supabase, storeFilters, dateGteFilters } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove, otherStoreDup],
      connections: [communityConnection],
      links: [removeLink],
    });

    await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds,
      reverseTransactionPlLinkPosting: async () => ({ error: null }),
      now: NOW,
    });

    expect(storeFilters.every((id) => id === STORE)).toBe(true);
    expect(dateGteFilters[0]).toBe("2026-07-13");
  });

  it("applies the Community Bank $484.75 pair in reverse → delete link → delete txn → update keep order", async () => {
    const loadLivePlaidIds = vi.fn(async (connections, minDate, maxDate) => {
      expect(minDate).toBe("2026-08-18");
      expect(maxDate).toBe("2026-09-01");
      return liveCommunityFetch(connections);
    });
    const { supabase, ops, auditInserts, alertInserts } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove],
      connections: [communityConnection],
      links: [removeLink],
    });
    const reverse = vi.fn(async () => {
      ops.push("reverse");
      return { error: null };
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds,
      reverseTransactionPlLinkPosting: reverse,
      now: NOW,
    });

    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toMatchObject({
      storeId: STORE,
      storeName: "Community Store",
      keepId: keep.id,
      removeId: remove.id,
      amount: 484.75,
      reversedAmount: 484.75,
      reversedCategory: "self_service_revenue",
      currentPlaidTransactionId: remove.plaid_transaction_id,
    });
    expect(ops).toEqual([
      "reverse",
      `delete_link:${removeLink.id}`,
      `delete_txn:${remove.id}`,
      `update_keep:${keep.id}:${remove.plaid_transaction_id}`,
      "audit",
      "alert",
    ]);
    expect(auditInserts[0]).toMatchObject({
      transaction_id: keep.id,
      store_id: STORE,
      user_id: USER,
      field_changed: PLAID_DUPLICATE_RECONCILE_AUDIT_FIELD,
      old_value: remove.id,
      change_source: "system",
    });
    expect(alertInserts[0]).toMatchObject({
      user_id: USER,
      store_id: STORE,
      alert_key: `${PLAID_DUPLICATE_CORRECTED_ALERT_PREFIX}${keep.id}`,
      severity: "success",
      title: "Duplicate transaction corrected",
      body: "We removed a duplicate $484.75 deposit from Aug 25 so your P&L stays accurate.",
    });
    expect(alertInserts[0]?.resolved_at).toBe(NOW.toISOString());
    expect(alertInserts[0]?.toast_shown_at).toBeUndefined();
  });

  it("does not write audit or alert when the kill switch is off", async () => {
    const loadLivePlaidIds = vi.fn();
    const supabaseFrom = vi.fn();
    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase: { from: supabaseFrom },
      loadLivePlaidIds,
      reverseTransactionPlLinkPosting: vi.fn(),
      now: NOW,
      autoReconcileEnabled: false,
    });

    expect(result.skipReason).toBe("kill_switch");
    expect(supabaseFrom).not.toHaveBeenCalled();
    expect(loadLivePlaidIds).not.toHaveBeenCalled();
  });

  it("skips apply, audit, and alert when Plaid status is unknown", async () => {
    const reverse = vi.fn();
    const { supabase, ops } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove],
      connections: [communityConnection],
      links: [removeLink],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds: async (connections) =>
        connections.map((connection) => ({
          connection,
          ok: false,
          activeIds: new Set<string>(),
        })),
      reverseTransactionPlLinkPosting: reverse,
      now: NOW,
    });

    expect(result.applied).toEqual([]);
    expect(result.skipReason).toBe("no_confirmed_duplicates");
    expect(reverse).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });

  it("skips apply when both Plaid IDs are still live", async () => {
    const reverse = vi.fn();
    const { supabase, ops } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove],
      connections: [communityConnection],
      links: [removeLink],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds: async (connections) =>
        connections.map((connection) => ({
          connection,
          ok: true,
          activeIds: new Set([keep.plaid_transaction_id, remove.plaid_transaction_id]),
        })),
      reverseTransactionPlLinkPosting: reverse,
      now: NOW,
    });

    expect(result.applied).toEqual([]);
    expect(reverse).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });

  it("does not treat opposite-type $5 fee/waiver pairs as duplicates even with one dead ID", async () => {
    const reverse = vi.fn();
    const fee = txnRow({ ...augustFee, description: "Monthly fee" });
    const waiver = txnRow({ ...augustWaiver, description: "Fee waiver" });
    const { supabase, ops } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [fee, waiver],
      connections: [eastriseConnection],
      links: [],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds: vi.fn(),
      reverseTransactionPlLinkPosting: reverse,
      now: NOW,
    });

    expect(result.plaidFetchCalled).toBe(false);
    expect(result.excluded.some((item) => item.reason === "type_mismatch")).toBe(true);
    expect(reverse).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });

  it("rejects a same-type pair whose live IDs belong to two different connections", async () => {
    const reverse = vi.fn();
    const communityTwin = txnRow({
      ...remove,
      id: "community-twin",
      plaid_transaction_id: "community-twin-id",
    });
    const { supabase, ops } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, communityTwin],
      connections: [communityConnection, eastriseConnection],
      links: [],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds: async (connections) =>
        connections.map((connection) => ({
          connection,
          ok: true,
          activeIds:
            connection.id === COMMUNITY_BANK
              ? new Set([keep.plaid_transaction_id])
              : new Set([communityTwin.plaid_transaction_id]),
        })),
      reverseTransactionPlLinkPosting: reverse,
      now: NOW,
    });

    expect(result.applied).toEqual([]);
    expect(reverse).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });

  it("does not delete the duplicate if P&L reversal fails", async () => {
    const { supabase, ops, auditInserts, alertInserts } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove],
      connections: [communityConnection],
      links: [removeLink],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds: async (connections) => liveCommunityFetch(connections),
      reverseTransactionPlLinkPosting: async () => ({ error: "monthly_financials locked" }),
      now: NOW,
    });

    expect(result.applied).toEqual([]);
    expect(result.groupErrors[0]?.keepId).toBe(keep.id);
    expect(ops).toEqual([]);
    expect(auditInserts).toEqual([]);
    expect(alertInserts).toEqual([]);
  });

  it("continues to the next group when one confirmed group fails", async () => {
    const secondKeep = txnRow({
      id: "keep-2",
      plaid_transaction_id: "dead-2",
      transaction_date: "2026-08-20",
      amount: 100,
      transaction_type: "income",
      created_at: "2026-08-20T12:00:00.000Z",
      description: "Older deposit",
    });
    const secondRemove = txnRow({
      id: "remove-2",
      plaid_transaction_id: "live-2",
      transaction_date: "2026-08-20",
      amount: 100,
      transaction_type: "income",
      created_at: "2026-08-26T12:00:00.000Z",
      description: "Newer deposit",
    });
    const reverse = vi.fn(async (_supabase, params) => {
      if (params.link.amount_applied === 484.75) return { error: "first group failed" };
      return { error: null };
    });
    const { supabase, ops } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove, secondKeep, secondRemove],
      connections: [communityConnection],
      links: [
        removeLink,
        {
          id: "pl-link-2",
          transaction_id: secondRemove.id,
          store_id: STORE,
          year: 2026,
          month: 8,
          category: "self_service_revenue",
          amount_applied: 100,
        },
      ],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds: async (connections) =>
        connections.map((connection) => ({
          connection,
          ok: true,
          activeIds: new Set([remove.plaid_transaction_id, secondRemove.plaid_transaction_id]),
        })),
      reverseTransactionPlLinkPosting: reverse,
      now: NOW,
    });

    expect(result.groupErrors).toHaveLength(1);
    expect(result.applied.map((item) => item.removeId)).toEqual([secondRemove.id]);
    expect(ops).toContain(`delete_txn:${secondRemove.id}`);
    expect(ops).not.toContain(`delete_txn:${remove.id}`);
  });

  it("still deletes a duplicate that has no P&L link, then updates the surviving Plaid ID", async () => {
    const { supabase, ops } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove],
      connections: [communityConnection],
      links: [],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds: async (connections) => liveCommunityFetch(connections),
      reverseTransactionPlLinkPosting: vi.fn(),
      now: NOW,
    });

    expect(result.applied[0]?.reversedAmount).toBeNull();
    expect(ops).toEqual([
      `delete_txn:${remove.id}`,
      `update_keep:${keep.id}:${remove.plaid_transaction_id}`,
      "audit",
      "alert",
    ]);
  });

  it("is a no-op on a second pass after the duplicate row is gone", async () => {
    const db: MockDb = {
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove],
      connections: [communityConnection],
      links: [removeLink],
    };
    const first = createMockSupabase(db);
    await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase: first.supabase,
      loadLivePlaidIds: async (connections) => liveCommunityFetch(connections),
      reverseTransactionPlLinkPosting: async () => ({ error: null }),
      now: NOW,
    });

    const loadLivePlaidIds = vi.fn();
    const second = createMockSupabase(db);
    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase: second.supabase,
      loadLivePlaidIds,
      reverseTransactionPlLinkPosting: vi.fn(),
      now: NOW,
    });

    expect(result.applied).toEqual([]);
    expect(loadLivePlaidIds).not.toHaveBeenCalled();
  });

  it("does not mutate data or write audit/alert during dry run", async () => {
    const reverse = vi.fn();
    const { supabase, ops, auditInserts, alertInserts } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove],
      connections: [communityConnection],
      links: [removeLink],
    });

    const result = await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds: async (connections) => liveCommunityFetch(connections),
      reverseTransactionPlLinkPosting: reverse,
      now: NOW,
      execute: false,
    });

    expect(result.confirmedGroups).toBe(1);
    expect(result.applied).toEqual([]);
    expect(reverse).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
    expect(auditInserts).toEqual([]);
    expect(alertInserts).toEqual([]);
  });

  it("does not insert a second in-app alert when one already exists for the surviving row", async () => {
    const { supabase, alertInserts } = createMockSupabase({
      store: { id: STORE, name: "Community Store" },
      transactions: [keep, remove],
      connections: [communityConnection],
      links: [removeLink],
      existingAlertKeys: [`${PLAID_DUPLICATE_CORRECTED_ALERT_PREFIX}${keep.id}`],
    });

    await reconcilePostedPlaidDuplicatesForStore(STORE, {
      supabase,
      loadLivePlaidIds: async (connections) => liveCommunityFetch(connections),
      reverseTransactionPlLinkPosting: async () => ({ error: null }),
      now: NOW,
    });

    expect(alertInserts).toEqual([]);
  });
});

describe("date helpers", () => {
  it("shifts ISO calendar dates in UTC without local-timezone drift", () => {
    expect(shiftIsoDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftIsoDate("2026-08-27", 7)).toBe("2026-09-03");
  });
});
