import { describe, expect, it } from "vitest";
import {
  clusterSameTypeDuplicateCandidates,
  matchConfirmedPlaidDuplicate,
  type DuplicateCleanupTxn,
} from "@/lib/plaidDuplicateCleanup";

const STORE = "ec20b2ce-2951-4cf0-9e1c-cf5ee53bb056";
const COMMUNITY_BANK = "community-bank-connection";
const EASTRISE = "eastrise-connection";

function row(
  overrides: Pick<DuplicateCleanupTxn, "id" | "plaid_transaction_id" | "transaction_date" | "amount" | "transaction_type" | "created_at">
): DuplicateCleanupTxn {
  return { store_id: STORE, ...overrides };
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
    expect(clusters[0].map((row) => row.plaid_transaction_id).sort()).toEqual(
      [deposit484Memo.plaid_transaction_id, deposit484Ccd.plaid_transaction_id].sort()
    );
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
    expect(match?.removes.map((row) => row.id)).toEqual([deposit484Ccd.id]);
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
