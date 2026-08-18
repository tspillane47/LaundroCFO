import { describe, expect, it } from "vitest";
import {
  normalizePlaidTransaction,
  planPlaidAddedTransactions,
  type ExistingPlaidBankRow,
  type PlaidTransactionLike,
} from "@/lib/plaid-shared";

function existingRow(
  overrides: Partial<ExistingPlaidBankRow> & Pick<ExistingPlaidBankRow, "id" | "plaid_transaction_id">
): ExistingPlaidBankRow {
  return {
    status: "posted",
    description: "Existing row",
    transaction_date: "2026-08-17",
    amount: 15,
    ...overrides,
  };
}

function addedTxn(overrides: Partial<PlaidTransactionLike> & Pick<PlaidTransactionLike, "transaction_id">): PlaidTransactionLike {
  return {
    date: "2026-08-17",
    name: "Concepts In",
    amount: 15,
    ...overrides,
  };
}

describe("planPlaidAddedTransactions", () => {
  it("reconciles via pending_transaction_id instead of inserting a duplicate", () => {
    const existingByPlaidId = new Map<string, ExistingPlaidBankRow>([
      [
        "pending-old-id",
        existingRow({
          id: "bank-row-1",
          plaid_transaction_id: "pending-old-id",
          status: "posted",
        }),
      ],
    ]);

    const added = [
      addedTxn({
        transaction_id: "posted-new-id",
        pending_transaction_id: "pending-old-id",
      }),
    ];

    const plans = planPlaidAddedTransactions({
      added,
      removedTransactionIds: ["pending-old-id"],
      existingByPlaidId,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      action: "reconcile",
      existingRowId: "bank-row-1",
      path: "pending_transaction_id",
      previousPlaidTransactionId: "pending-old-id",
    });
    expect(plans.filter((plan) => plan.action === "insert")).toHaveLength(0);
  });

  it("reconciles via same-batch fallback when pending_transaction_id is missing", () => {
    const existingByPlaidId = new Map<string, ExistingPlaidBankRow>([
      [
        "old-posted-id",
        existingRow({
          id: "bank-row-2",
          plaid_transaction_id: "old-posted-id",
          status: "posted",
          transaction_date: "2026-08-17",
          amount: 419.5,
        }),
      ],
    ]);

    const added = [
      addedTxn({
        transaction_id: "new-posted-id",
        name: "DEPOSIT MERCHANT BANKCD",
        amount: 419.5,
      }),
    ];

    const plans = planPlaidAddedTransactions({
      added,
      removedTransactionIds: ["old-posted-id"],
      existingByPlaidId,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      action: "reconcile",
      existingRowId: "bank-row-2",
      path: "same_batch_fallback",
      previousPlaidTransactionId: "old-posted-id",
    });
    expect(plans.filter((plan) => plan.action === "insert")).toHaveLength(0);
  });

  it("inserts when there is no reconciliation match", () => {
    const plans = planPlaidAddedTransactions({
      added: [addedTxn({ transaction_id: "brand-new-id" })],
      removedTransactionIds: [],
      existingByPlaidId: new Map(),
    });

    expect(plans).toEqual([{ action: "insert", txn: expect.objectContaining({ transaction_id: "brand-new-id" }) }]);
  });

  it("does not reconcile fallback onto unposted removed rows", () => {
    const existingByPlaidId = new Map<string, ExistingPlaidBankRow>([
      [
        "old-needs-review-id",
        existingRow({
          id: "bank-row-3",
          plaid_transaction_id: "old-needs-review-id",
          status: "needs_review",
        }),
      ],
    ]);

    const plans = planPlaidAddedTransactions({
      added: [addedTxn({ transaction_id: "new-posted-id" })],
      removedTransactionIds: ["old-needs-review-id"],
      existingByPlaidId,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]?.action).toBe("insert");
  });

  it("prefers pending_transaction_id over same-batch fallback", () => {
    const existingByPlaidId = new Map<string, ExistingPlaidBankRow>([
      [
        "pending-old-id",
        existingRow({
          id: "bank-row-primary",
          plaid_transaction_id: "pending-old-id",
          status: "posted",
        }),
      ],
    ]);

    const plans = planPlaidAddedTransactions({
      added: [
        addedTxn({
          transaction_id: "posted-new-id",
          pending_transaction_id: "pending-old-id",
        }),
      ],
      removedTransactionIds: ["pending-old-id"],
      existingByPlaidId,
    });

    expect(plans[0]).toMatchObject({
      action: "reconcile",
      path: "pending_transaction_id",
      existingRowId: "bank-row-primary",
    });
  });
});

describe("normalizePlaidTransaction pending_transaction_id", () => {
  it("captures pending_transaction_id when present", () => {
    const result = normalizePlaidTransaction({
      transaction_id: "posted-new-id",
      pending_transaction_id: " pending-old-id ",
      date: "2026-08-17",
      name: "Concepts In",
      amount: 15,
    });

    expect(result.pending_transaction_id).toBe("pending-old-id");
    expect(result.plaid_transaction_id).toBe("posted-new-id");
  });

  it("returns null pending_transaction_id when absent", () => {
    const result = normalizePlaidTransaction({
      transaction_id: "txn-1",
      date: "2026-08-17",
      name: "Concepts In",
      amount: 15,
    });

    expect(result.pending_transaction_id).toBeNull();
  });
});
