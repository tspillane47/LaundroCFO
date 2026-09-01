import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/plaid", () => ({
  getPlaidClient: vi.fn(),
  getPlaidConnectionById: vi.fn(),
}));
vi.mock("@/lib/supabase-admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/financials", () => ({
  reverseTransactionPlLinkPosting: vi.fn(),
  restoreTransactionPlLinkPosting: vi.fn(),
}));

import { fetchPlaidTransactionIdsForAccount } from "@/lib/plaidAccountInclusion";

describe("fetchPlaidTransactionIdsForAccount", () => {
  it("pages a date-windowed transactionsGet with account_ids, not a cursor", async () => {
    const transactionsGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          total_transactions: 2,
          transactions: [{ transaction_id: "txn-1" }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          total_transactions: 2,
          transactions: [{ transaction_id: "txn-2" }],
        },
      });

    const ids = await fetchPlaidTransactionIdsForAccount(
      { transactionsGet },
      "access-token",
      "personal-checking",
      { start_date: "2023-09-01", end_date: "2026-08-31" }
    );

    expect(ids).toEqual(["txn-1", "txn-2"]);
    expect(transactionsGet).toHaveBeenCalledTimes(2);
    expect(transactionsGet).toHaveBeenNthCalledWith(1, {
      access_token: "access-token",
      start_date: "2023-09-01",
      end_date: "2026-08-31",
      options: {
        account_ids: ["personal-checking"],
        count: 500,
        offset: 0,
      },
    });
    expect(transactionsGet.mock.calls[0][0]).not.toHaveProperty("cursor");
  });
});
