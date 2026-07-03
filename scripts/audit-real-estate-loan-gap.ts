/**
 * Finds active store_loans tagged "Real Estate" where real_estate.current_loan_balance
 * is null or zero — those balances would be excluded from Portfolio Net Worth without a fallback.
 *
 * Usage:
 *   npx tsx scripts/audit-real-estate-loan-gap.ts
 */

import { createScriptSupabaseClient } from "./createScriptSupabaseClient";
import { calcEstimatedBalance } from "../src/lib/amortization";

const REAL_ESTATE_LOAN_TYPE = "Real Estate";

async function main() {
  const supabase = await createScriptSupabaseClient();

  const [{ data: loans, error: loansError }, { data: realEstateRows, error: reError }, { data: stores, error: storesError }] =
    await Promise.all([
      supabase
        .from("store_loans")
        .select("id, store_id, lender_name, loan_type, current_balance, interest_rate, monthly_payment, updated_at, is_active")
        .eq("is_active", true)
        .eq("loan_type", REAL_ESTATE_LOAN_TYPE),
      supabase.from("real_estate").select("store_id, current_loan_balance"),
      supabase.from("stores").select("id, name, archived").eq("archived", false),
    ]);

  if (loansError) throw loansError;
  if (reError) throw reError;
  if (storesError) throw storesError;

  const reBalanceByStore = new Map(
    (realEstateRows ?? []).map((row) => [row.store_id, row.current_loan_balance])
  );
  const storeNameById = new Map((stores ?? []).map((s) => [s.id, s.name ?? s.id]));

  const gaps: {
    storeId: string;
    storeName: string;
    realEstateLoanBalance: number | null;
    loanCount: number;
    loanBalanceTotal: number;
    loans: { id: string; lender: string | null; balance: number }[];
  }[] = [];

  const byStore = new Map<string, typeof loans>();
  for (const loan of loans ?? []) {
    const list = byStore.get(loan.store_id) ?? [];
    list.push(loan);
    byStore.set(loan.store_id, list);
  }

  for (const [storeId, storeLoans] of byStore) {
    const reBalance = reBalanceByStore.get(storeId);
    if (reBalance != null && reBalance > 0) continue;

    const loanBalanceTotal = storeLoans.reduce((sum, loan) => {
      return (
        sum +
        calcEstimatedBalance({
          currentBalance: loan.current_balance ?? 0,
          interestRate: loan.interest_rate ?? 0,
          monthlyPayment: loan.monthly_payment ?? 0,
          lastUpdated: loan.updated_at ?? undefined,
        })
      );
    }, 0);

    if (loanBalanceTotal <= 0) continue;

    gaps.push({
      storeId,
      storeName: storeNameById.get(storeId) ?? storeId,
      realEstateLoanBalance: reBalance ?? null,
      loanCount: storeLoans.length,
      loanBalanceTotal,
      loans: storeLoans.map((l) => ({
        id: l.id,
        lender: l.lender_name,
        balance: calcEstimatedBalance({
          currentBalance: l.current_balance ?? 0,
          interestRate: l.interest_rate ?? 0,
          monthlyPayment: l.monthly_payment ?? 0,
          lastUpdated: l.updated_at ?? undefined,
        }),
      })),
    });
  }

  console.log(`Active "Real Estate" store_loans: ${(loans ?? []).length}`);
  console.log(`Stores with gap (RE loan in Debt module, no real_estate balance): ${gaps.length}\n`);

  if (gaps.length === 0) {
    console.log("No gaps found.");
    return;
  }

  for (const gap of gaps) {
    console.log(`Store: ${gap.storeName} (${gap.storeId})`);
    console.log(`  real_estate.current_loan_balance: ${gap.realEstateLoanBalance ?? "null"}`);
    console.log(`  store_loans "Real Estate" total: $${gap.loanBalanceTotal.toLocaleString()}`);
    for (const loan of gap.loans) {
      console.log(`    - ${loan.lender ?? "Unknown lender"}: $${loan.balance.toLocaleString()} (${loan.id})`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
