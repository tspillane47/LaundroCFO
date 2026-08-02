import { describe, expect, it } from "vitest";
import {
  ALREADY_POSTED_MESSAGE,
  formatAlreadyPostedMessage,
  getReviewQueueProgress,
  isPostgresUniqueViolation,
  needsCategorySelection,
  postTransactionsBatch,
  type BatchPostTransaction,
  type MonthlyFinancialRecord,
} from "@/lib/financials";

const STORE_ID = "store-1";
const USER_ID = "user-1";

function makeTxn(overrides: Partial<BatchPostTransaction> = {}): BatchPostTransaction {
  return {
    id: "txn-1",
    transaction_date: "2026-01-15",
    amount: -500,
    category: "rent",
    status: "user_classified",
    original_category: null,
    ...overrides,
  };
}

type LinkInsertOutcome = {
  transaction_id: string;
  error: { code?: string; message?: string } | null;
};

type MockPostingOptions = {
  existingLinkIds?: string[];
  linkInsertOutcomes?: LinkInsertOutcome[];
  financialUpdateError?: string | null;
  financialInsertError?: string | null;
  txnUpdateError?: string | null;
  auditInsertError?: string | null;
  deleteLinkError?: string | null;
};

function createPostingMockSupabase(options: MockPostingOptions = {}) {
  const insertedLinkIds: string[] = [];
  const deletedLinkIds: string[] = [];
  let financialUpdateCount = 0;
  let financialInsertCount = 0;
  let financialUpdateRent: number | null = null;

  const linkQueue = [...(options.linkInsertOutcomes ?? [])];

  const supabase = {
    from(table: string) {
      if (table === "transaction_pl_links") {
        return {
          select: () => ({
            in: async () => ({
              data: (options.existingLinkIds ?? []).map((transaction_id) => ({ transaction_id })),
              error: null,
            }),
          }),
          insert: async (payload: { transaction_id: string }) => {
            const next = linkQueue.shift();
            if (next && next.transaction_id === payload.transaction_id) {
              if (next.error) return { error: next.error };
            } else if (next?.error) {
              return { error: next.error };
            }
            insertedLinkIds.push(payload.transaction_id);
            return { error: null };
          },
          delete: () => ({
            in: async (_column: string, ids: string[]) => {
              if (options.deleteLinkError) {
                return { error: { message: options.deleteLinkError } };
              }
              deletedLinkIds.push(...ids);
              return { error: null };
            },
          }),
        };
      }

      if (table === "monthly_financials") {
        return {
          update: (payload: { rent?: number }) => ({
            eq: async () => {
              financialUpdateCount += 1;
              financialUpdateRent = payload.rent ?? null;
              if (options.financialUpdateError) {
                return { error: { message: options.financialUpdateError } };
              }
              return { error: null };
            },
          }),
          insert: async () => {
            financialInsertCount += 1;
            if (options.financialInsertError) {
              return { error: { message: options.financialInsertError } };
            }
            return { error: null };
          },
        };
      }

      if (table === "bank_transactions") {
        return {
          update: () => ({
            eq: async () => ({
              error: options.txnUpdateError ? { message: options.txnUpdateError } : null,
            }),
          }),
        };
      }

      if (table === "transaction_audit_log") {
        return {
          insert: async () => ({
            error: options.auditInsertError ? { message: options.auditInsertError } : null,
          }),
        };
      }

      throw new Error(`Unexpected table in posting mock: ${table}`);
    },
  };

  return {
    supabase: supabase as never,
    state: {
      get insertedLinkIds() {
        return insertedLinkIds;
      },
      get deletedLinkIds() {
        return deletedLinkIds;
      },
      get financialUpdateCount() {
        return financialUpdateCount;
      },
      get financialInsertCount() {
        return financialInsertCount;
      },
      get financialUpdateRent() {
        return financialUpdateRent;
      },
    },
  };
}

const existingFinancial: MonthlyFinancialRecord = {
  id: "mf-1",
  store_id: STORE_ID,
  year: 2026,
  month: 1,
  revenue: 0,
  self_service_revenue: 0,
  wdf_revenue: 0,
  commercial_revenue: 0,
  vending_revenue: 0,
  other_revenue: 0,
  utilities: 0,
  rent: 1000,
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
};

describe("isPostgresUniqueViolation", () => {
  it("detects postgres duplicate key errors", () => {
    expect(isPostgresUniqueViolation({ code: "23505", message: "duplicate key" })).toBe(true);
    expect(
      isPostgresUniqueViolation({
        message: 'duplicate key value violates unique constraint "transaction_pl_links_transaction_id_unique"',
      })
    ).toBe(true);
    expect(isPostgresUniqueViolation({ message: "some other error" })).toBe(false);
  });
});

describe("formatAlreadyPostedMessage", () => {
  it("returns the single-transaction message", () => {
    expect(formatAlreadyPostedMessage(1)).toBe(ALREADY_POSTED_MESSAGE);
  });
});

describe("postTransactionsBatch", () => {
  it("posts successfully and applies P&L only after the link insert succeeds", async () => {
    const { supabase, state } = createPostingMockSupabase();

    const result = await postTransactionsBatch(supabase, {
      storeId: STORE_ID,
      userId: USER_ID,
      transactions: [makeTxn()],
      existingRecords: [existingFinancial],
    });

    expect(result).toEqual({
      postedCount: 1,
      error: null,
      refreshRecommended: false,
      alreadyPostedCount: 0,
    });
    expect(state.insertedLinkIds).toEqual(["txn-1"]);
    expect(state.financialUpdateCount).toBe(1);
    expect(state.financialUpdateRent).toBe(1500);
    expect(state.deletedLinkIds).toEqual([]);
  });

  it("does not apply P&L when a duplicate link race is detected", async () => {
    const { supabase, state } = createPostingMockSupabase({
      linkInsertOutcomes: [
        {
          transaction_id: "txn-1",
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "transaction_pl_links_transaction_id_unique"',
          },
        },
      ],
    });

    const result = await postTransactionsBatch(supabase, {
      storeId: STORE_ID,
      userId: USER_ID,
      transactions: [makeTxn()],
      existingRecords: [existingFinancial],
    });

    expect(result.postedCount).toBe(0);
    expect(result.error).toBe(ALREADY_POSTED_MESSAGE);
    expect(result.refreshRecommended).toBe(true);
    expect(result.alreadyPostedCount).toBe(1);
    expect(state.financialUpdateCount).toBe(0);
    expect(state.financialInsertCount).toBe(0);
    expect(state.insertedLinkIds).toEqual([]);
  });

  it("posts only the linked transactions when a batch partially loses the link race", async () => {
    const { supabase, state } = createPostingMockSupabase({
      linkInsertOutcomes: [
        { transaction_id: "txn-1", error: null },
        {
          transaction_id: "txn-2",
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "transaction_pl_links_transaction_id_unique"',
          },
        },
      ],
    });

    const result = await postTransactionsBatch(supabase, {
      storeId: STORE_ID,
      userId: USER_ID,
      transactions: [
        makeTxn({ id: "txn-1", amount: -500 }),
        makeTxn({ id: "txn-2", amount: -300, category: "payroll" }),
      ],
      existingRecords: [existingFinancial],
    });

    expect(result.postedCount).toBe(1);
    expect(result.error).toBeNull();
    expect(result.refreshRecommended).toBe(true);
    expect(result.alreadyPostedCount).toBe(1);
    expect(state.insertedLinkIds).toEqual(["txn-1"]);
    expect(state.financialUpdateCount).toBe(1);
    expect(state.financialUpdateRent).toBe(1500);
  });

  it("rolls back inserted links when P&L update fails after links were created", async () => {
    const { supabase, state } = createPostingMockSupabase({
      financialUpdateError: "monthly_financials update failed",
    });

    const result = await postTransactionsBatch(supabase, {
      storeId: STORE_ID,
      userId: USER_ID,
      transactions: [makeTxn()],
      existingRecords: [existingFinancial],
    });

    expect(result.postedCount).toBe(0);
    expect(result.error).toBe("monthly_financials update failed");
    expect(state.insertedLinkIds).toEqual(["txn-1"]);
    expect(state.deletedLinkIds).toEqual(["txn-1"]);
    expect(state.financialUpdateCount).toBe(1);
  });
});

describe("getReviewQueueProgress", () => {
  it("counts ready and uncategorized rows in the review queue", () => {
    const progress = getReviewQueueProgress([
      { category: "needs_review" },
      { category: "needs_review" },
      { category: "rent" },
      { category: "water" },
      { category: "utilities" },
    ]);

    expect(progress).toEqual({
      total: 5,
      ready: 2,
      uncategorized: 2,
    });
  });
});

describe("needsCategorySelection", () => {
  it("is true only for the needs_review category", () => {
    expect(needsCategorySelection("needs_review")).toBe(true);
    expect(needsCategorySelection("rent")).toBe(false);
  });
});
