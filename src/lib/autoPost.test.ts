import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { autoPostRevenueForStore, undoAutoPost } from "@/lib/autoPost";
import { formatAutoPostBanner } from "@/lib/autoPostNotice";
import {
  reclassifyPostedTransaction,
  resolveIncomeAutoPostCategory,
  syncPostedLinkAfterBankChange,
  type CategorizationRule,
  type MonthlyFinancialRecord,
} from "@/lib/financials";
import { shouldThrottleStoreBankRefresh } from "@/lib/plaidRefreshThrottle";

const STORE_ID = "store-1";
const USER_ID = "user-1";

type Row = Record<string, unknown>;

class MemoryQuery implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private action: "select" | "insert" | "update" | "delete" = "select";
  private payload: unknown = null;
  private op: "many" | "maybe" | "single" = "many";
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private executed = false;

  constructor(
    private db: Record<string, Row[]>,
    private table: string
  ) {}

  select() {
    this.action = "select";
    return this;
  }

  insert(payload: unknown) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    const allowed = new Set(values);
    this.filters.push((row) => allowed.has(row[column]));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderCol = column;
    this.orderAsc = options?.ascending !== false;
    return this;
  }

  limit(count: number) {
    this.limitN = count;
    return this;
  }

  maybeSingle() {
    this.op = "maybe";
    return this.execute();
  }

  single() {
    this.op = "single";
    return this.execute();
  }

  then<TResult1 = { data: unknown; error: { message: string; code?: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string; code?: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private execute(): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
    if (this.executed) {
      return Promise.resolve({ data: null, error: { message: "query executed twice" } });
    }
    this.executed = true;

    const rows = this.db[this.table] ?? (this.db[this.table] = []);
    const matches = (row: Row) => this.filters.every((filter) => filter(row));

    if (this.action === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const row of list as Row[]) {
        if (
          this.table === "transaction_pl_links" &&
          rows.some((existing) => existing.transaction_id === row.transaction_id)
        ) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          });
        }
        rows.push({ id: row.id ?? `${this.table}-${rows.length + 1}`, ...row });
      }
      return Promise.resolve({ data: null, error: null });
    }

    if (this.action === "update") {
      for (const row of rows.filter(matches)) {
        Object.assign(row, this.payload as Row);
      }
      return Promise.resolve({ data: null, error: null });
    }

    if (this.action === "delete") {
      this.db[this.table] = rows.filter((row) => !matches(row));
      return Promise.resolve({ data: null, error: null });
    }

    let data = rows.filter(matches);
    if (this.orderCol) {
      const column = this.orderCol;
      const direction = this.orderAsc ? 1 : -1;
      data = [...data].sort((left, right) => {
        const a = String(left[column] ?? "");
        const b = String(right[column] ?? "");
        if (a < b) return -1 * direction;
        if (a > b) return 1 * direction;
        return 0;
      });
    }
    if (this.limitN != null) data = data.slice(0, this.limitN);
    if (this.op === "maybe") return Promise.resolve({ data: data[0] ?? null, error: null });
    if (this.op === "single") {
      return Promise.resolve({
        data: data[0] ?? null,
        error: data[0] ? null : { message: "not found" },
      });
    }
    return Promise.resolve({ data, error: null });
  }
}

function createMemorySupabase(tables: Record<string, Row[]>) {
  return {
    tables,
    from(table: string) {
      return new MemoryQuery(tables, table);
    },
  };
}

function financialRow(overrides: Partial<MonthlyFinancialRecord> = {}): MonthlyFinancialRecord {
  return {
    id: "mf-1",
    store_id: STORE_ID,
    user_id: USER_ID,
    year: 2026,
    month: 10,
    revenue: 1000,
    self_service_revenue: 1000,
    wdf_revenue: 0,
    commercial_revenue: 0,
    vending_revenue: 0,
    other_revenue: 0,
    utilities: 0,
    rent: 0,
    payroll: 0,
    repairs_maintenance: 0,
    insurance_expense: 0,
    supplies: 0,
    marketing: 0,
    professional_fees: 0,
    software_subscriptions: 0,
    cc_processing_fees: 0,
    bank_charges: 0,
    other_expenses: 0,
    debt_service: 0,
    notes: null,
    ...overrides,
  };
}

function incomeRow(overrides: Row = {}): Row {
  return {
    id: "txn-rule",
    store_id: STORE_ID,
    user_id: USER_ID,
    transaction_date: "2026-10-05",
    description: "OWNER DRAW",
    amount: 4210,
    category: "self_service_revenue",
    status: "needs_review",
    excluded: false,
    pending: false,
    transaction_type: "income",
    plaid_account_id: "checking-1",
    original_category: "self_service_revenue",
    ...overrides,
  };
}

const amountRule: CategorizationRule = {
  id: "rule-1",
  user_id: USER_ID,
  vendor_pattern: "",
  category: "other_revenue",
  rule_type: "amount",
  amount: 4210,
  amount_tolerance: 0.01,
  transaction_type: "income",
};

function seedBooks() {
  const financials = [financialRow() as unknown as Row];
  const db = createMemorySupabase({
    stores: [{ id: STORE_ID, user_id: USER_ID }],
    categorization_rules: [amountRule as unknown as Row],
    plaid_accounts: [],
    bank_transactions: [
      incomeRow(),
      incomeRow({
        id: "txn-pending",
        description: "MOBILE DEPOSIT",
        amount: 100,
        pending: true,
      }),
      incomeRow({
        id: "txn-fallback",
        description: "PAYOUT ACME",
        amount: 80,
      }),
      incomeRow({
        id: "txn-zelle",
        description: "ZELLE FROM JANE",
        amount: 4210,
      }),
    ],
    transaction_pl_links: [],
    transaction_audit_log: [],
    monthly_financials: financials,
    monthly_utilities: [],
  });
  return { db, financials: financials[0] };
}

describe("resolveIncomeAutoPostCategory", () => {
  it("does not auto-post the default self-service fallback or needs-review keywords", () => {
    expect(resolveIncomeAutoPostCategory("PAYOUT ACME", "income", 80, [])).toEqual({
      post: false,
      reason: "fallback",
    });
    expect(resolveIncomeAutoPostCategory("ZELLE FROM JANE", "income", 4210, [amountRule])).toEqual({
      post: false,
      reason: "needs_review",
    });
    expect(resolveIncomeAutoPostCategory("MOBILE DEPOSIT", "income", 100, [])).toMatchObject({
      post: true,
      category: "self_service_revenue",
      source: "keyword",
    });
  });
});

describe("autoPostRevenueForStore", () => {
  it("posts rule-matched income once, and never posts pending or fallback income", async () => {
    const { db, financials } = seedBooks();
    const supabase = db as never;

    const first = await autoPostRevenueForStore(STORE_ID, { supabase, actingUserId: USER_ID });
    expect(first.error).toBeNull();
    expect(first.postedCount).toBe(1);
    expect(first.postedAmount).toBe(4210);
    expect(first.transactionIds).toEqual(["txn-rule"]);
    expect(financials.other_revenue).toBe(4210);
    expect(financials.self_service_revenue).toBe(1000);
    expect(financials.revenue).toBe(5210);
    expect(db.tables.transaction_pl_links).toHaveLength(1);
    expect(db.tables.transaction_audit_log[0]).toMatchObject({
      transaction_id: "txn-rule",
      change_source: "auto",
      new_value: "posted",
    });

    const pending = db.tables.bank_transactions.find((row) => row.id === "txn-pending");
    const fallback = db.tables.bank_transactions.find((row) => row.id === "txn-fallback");
    const zelle = db.tables.bank_transactions.find((row) => row.id === "txn-zelle");
    expect(pending?.status).toBe("needs_review");
    expect(fallback?.status).toBe("needs_review");
    expect(zelle?.status).toBe("needs_review");

    const second = await autoPostRevenueForStore(STORE_ID, { supabase, actingUserId: USER_ID });
    expect(second.postedCount).toBe(0);
    expect(second.transactionIds).toEqual([]);
    expect(financials.revenue).toBe(5210);
    expect(db.tables.transaction_pl_links).toHaveLength(1);

    const posted = db.tables.bank_transactions.find((row) => row.id === "txn-rule");
    posted!.status = "needs_review";
    const third = await autoPostRevenueForStore(STORE_ID, { supabase, actingUserId: USER_ID });
    expect(third.postedCount).toBe(0);
    expect(financials.revenue).toBe(5210);
    expect(db.tables.transaction_pl_links).toHaveLength(1);
  });

  it("undo restores the P&L exactly", async () => {
    const { db, financials } = seedBooks();
    const supabase = db as never;

    await autoPostRevenueForStore(STORE_ID, { supabase, actingUserId: USER_ID });
    expect(financials.revenue).toBe(5210);

    const undone = await undoAutoPost("txn-rule", USER_ID, { supabase });
    expect(undone).toEqual({ undone: true, error: null, storeId: STORE_ID });
    expect(financials.other_revenue).toBe(0);
    expect(financials.self_service_revenue).toBe(1000);
    expect(financials.revenue).toBe(1000);
    expect(db.tables.transaction_pl_links).toHaveLength(0);

    const posted = db.tables.bank_transactions.find((row) => row.id === "txn-rule");
    expect(posted?.status).toBe("needs_review");
  });
});

describe("syncPostedLinkAfterBankChange", () => {
  it("moves the P&L delta when a settled amount replaces the posted pending amount", async () => {
    const financials = [financialRow({ revenue: 200, self_service_revenue: 200 }) as unknown as Row];
    const db = createMemorySupabase({
      monthly_financials: financials,
      transaction_pl_links: [
        {
          id: "link-1",
          transaction_id: "txn-1",
          store_id: STORE_ID,
          year: 2026,
          month: 10,
          category: "self_service_revenue",
          amount_applied: 200,
        },
      ],
      bank_transactions: [incomeRow({ id: "txn-1", amount: 200, status: "posted", description: "MOBILE DEPOSIT" })],
    });

    const result = await syncPostedLinkAfterBankChange(db as never, {
      storeId: STORE_ID,
      userId: USER_ID,
      transactionId: "txn-1",
      previous: {
        status: "posted",
        amount: 200,
        transaction_date: "2026-10-05",
        transaction_type: "income",
      },
      next: {
        transaction_date: "2026-10-06",
        amount: 80,
        transaction_type: "income",
        description: "MOBILE DEPOSIT",
      },
    });

    expect(result).toEqual({ adjusted: true, error: null });
    expect(financials[0].self_service_revenue).toBe(80);
    expect(financials[0].revenue).toBe(80);
    expect(db.tables.transaction_pl_links[0]).toMatchObject({
      amount_applied: 80,
      year: 2026,
      month: 10,
      category: "self_service_revenue",
    });
  });
});

describe("reclassifyPostedTransaction", () => {
  it("keeps status posted", async () => {
    const financials = [financialRow({ revenue: 0, self_service_revenue: 0, rent: 500 }) as unknown as Row];
    const db = createMemorySupabase({
      monthly_financials: financials,
      transaction_pl_links: [
        {
          id: "link-1",
          transaction_id: "txn-1",
          store_id: STORE_ID,
          year: 2026,
          month: 10,
          category: "rent",
          amount_applied: 500,
        },
      ],
      bank_transactions: [
        {
          id: "txn-1",
          store_id: STORE_ID,
          transaction_date: "2026-10-05",
          description: "LANDLORD",
          amount: 500,
          category: "rent",
          status: "posted",
          excluded: false,
          transaction_type: "expense",
        },
      ],
      transaction_audit_log: [],
    });

    const result = await reclassifyPostedTransaction(db as never, "txn-1", "payroll", USER_ID);
    expect(result.error).toBeNull();
    expect(db.tables.bank_transactions[0].status).toBe("posted");
    expect(db.tables.bank_transactions[0].category).toBe("payroll");
    expect(financials[0].rent).toBe(0);
    expect(financials[0].payroll).toBe(500);
  });
});

describe("shouldThrottleStoreBankRefresh", () => {
  const now = Date.parse("2026-10-09T16:00:00.000Z");

  it("skips a refresh inside five minutes and allows one at the boundary", () => {
    expect(shouldThrottleStoreBankRefresh(null, now)).toBe(false);
    expect(shouldThrottleStoreBankRefresh(new Date(now - 4 * 60 * 1000).toISOString(), now)).toBe(true);
    expect(shouldThrottleStoreBankRefresh(new Date(now - 5 * 60 * 1000).toISOString(), now)).toBe(false);
    expect(shouldThrottleStoreBankRefresh(new Date(now - 5 * 60 * 1000 - 1).toISOString(), now)).toBe(false);
  });
});

describe("formatAutoPostBanner", () => {
  it("matches the deposits posted summary", () => {
    expect(formatAutoPostBanner(3, 4210)).toBe("3 deposits posted automatically ($4,210).");
    expect(formatAutoPostBanner(1, 80)).toBe("1 deposit posted automatically ($80).");
  });
});

describe("refresh route throttle", () => {
  const getUserMock = vi.fn();
  const verifyUserCanAccessStoreMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const upsertMock = vi.fn();
  const syncPlaidTransactionsMock = vi.fn();
  const autoPostRevenueForStoreMock = vi.fn();
  const getPlaidConnectionsForStoreMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not sync or post when the store refreshed under five minutes ago", async () => {
    vi.doMock("@/lib/supabase-server", () => ({
      createServerSupabaseClient: vi.fn(async () => ({
        auth: { getUser: getUserMock },
      })),
    }));
    vi.doMock("@/lib/store-access", () => ({
      verifyUserCanAccessStore: (...args: unknown[]) => verifyUserCanAccessStoreMock(...args),
    }));
    vi.doMock("@/lib/supabase-admin", () => ({
      createAdminSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: maybeSingleMock,
            }),
          }),
          upsert: upsertMock,
        }),
      }),
    }));
    vi.doMock("@/lib/plaid", () => ({
      getPlaidConnectionsForStore: (...args: unknown[]) => getPlaidConnectionsForStoreMock(...args),
      syncPlaidTransactions: (...args: unknown[]) => syncPlaidTransactionsMock(...args),
      logPlaidApiError: vi.fn(),
      PlaidNotConnectedError: class PlaidNotConnectedError extends Error {},
    }));
    vi.doMock("@/lib/autoPost", () => ({
      autoPostRevenueForStore: (...args: unknown[]) => autoPostRevenueForStoreMock(...args),
    }));

    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } });
    verifyUserCanAccessStoreMock.mockResolvedValue(true);
    maybeSingleMock.mockResolvedValue({
      data: { last_refreshed_at: new Date().toISOString() },
      error: null,
    });

    const { POST } = await import("@/app/api/plaid/refresh-store/route");
    const response = await POST(
      new Request("http://localhost/api/plaid/refresh-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: STORE_ID }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.throttled).toBe(true);
    expect(syncPlaidTransactionsMock).not.toHaveBeenCalled();
    expect(autoPostRevenueForStoreMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
