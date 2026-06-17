/**
 * Compare debt service from three independent sources:
 * 1. P&L monthly_financials.debt_service (Financials TTM DSCR)
 * 2. store_loans.monthly_payment sum (Debt Module)
 * 3. stores.annual_debt_service (store profile / Dashboard)
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *     npx tsx scripts/compare-debt-service-sources.ts [storeId]
 *
 * If storeId is omitted, lists stores with active loans and compares the first match.
 */

import { createClient } from "../src/lib/supabase";
import {
  enrichMonthlyRecords,
  sortRecordsDesc,
  calcTtmMetrics,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
  buildUtilitiesLookup,
} from "../src/lib/financials";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDollar(n: number): string {
  return `$${fmt(n)}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  let storeId = process.argv[2];

  if (!storeId) {
    const { data: loans, error } = await supabase
      .from("store_loans")
      .select("store_id, lender_name, monthly_payment")
      .eq("is_active", true)
      .limit(20);

    if (error) {
      console.error("Failed to query store_loans:", error.message);
      process.exit(1);
    }

    if (!loans?.length) {
      console.error("No active loans found. Pass a storeId explicitly.");
      process.exit(1);
    }

    storeId = loans[0].store_id;
    console.log(`No storeId provided. Using first store with active loans: ${storeId}\n`);
  }

  const [
    { data: store, error: storeError },
    { data: financialsData, error: financialsError },
    { data: utilitiesData },
    { data: loans, error: loansError },
  ] = await Promise.all([
    supabase.from("stores").select("id, name, annual_debt_service").eq("id", storeId).single(),
    supabase
      .from("monthly_financials")
      .select("*")
      .eq("store_id", storeId)
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
    supabase
      .from("monthly_utilities")
      .select("year, month, water, gas, electric, sewer, trash, internet")
      .eq("store_id", storeId),
    supabase
      .from("store_loans")
      .select("id, lender_name, monthly_payment, is_active, current_balance, interest_rate")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("monthly_payment", { ascending: false }),
  ]);

  if (storeError || !store) {
    console.error("Store not found:", storeError?.message ?? storeId);
    process.exit(1);
  }
  if (financialsError) {
    console.error("Failed to query monthly_financials:", financialsError.message);
    process.exit(1);
  }
  if (loansError) {
    console.error("Failed to query store_loans:", loansError.message);
    process.exit(1);
  }

  const utilitiesLookup = buildUtilitiesLookup((utilitiesData ?? []) as MonthlyUtilityRecord[]);
  const records = enrichMonthlyRecords(
    sortRecordsDesc((financialsData ?? []) as MonthlyFinancialRecord[]),
    utilitiesLookup
  );
  const ttm = calcTtmMetrics(records);
  const ttmRecords = records.slice(0, 12);

  const plTtmDebtService = ttm.ttmDebtService;
  const plMonthlyAvg = ttm.monthsUsed > 0 ? plTtmDebtService / ttm.monthsUsed : 0;

  const loanMonthlyTotal = (loans ?? []).reduce((sum, loan) => sum + (loan.monthly_payment ?? 0), 0);
  const loanAnnualTotal = loanMonthlyTotal * 12;

  const profileAnnual = store.annual_debt_service ?? 0;
  const profileMonthly = profileAnnual / 12;

  const plDscr = plTtmDebtService > 0 ? ttm.ttmEbitda / plTtmDebtService : null;
  const loanDscr = loanAnnualTotal > 0 ? ttm.ttmEbitda / loanAnnualTotal : null;

  console.log(`Store: ${store.name ?? "(unnamed)"} (${store.id})`);
  console.log(`TTM months used: ${ttm.monthsUsed}`);
  console.log(`TTM EBITDA: ${fmtDollar(ttm.ttmEbitda)}\n`);

  console.log("=== Source 1: P&L monthly_financials.debt_service (Financials page DSCR) ===");
  console.log(`  TTM total:     ${fmtDollar(plTtmDebtService)}`);
  console.log(`  Monthly avg:   ${fmtDollar(plMonthlyAvg)}`);
  console.log(`  DSCR:          ${plDscr == null ? "n/a (zero debt_service in P&L)" : `${fmt(plDscr)}x`}`);

  if (ttmRecords.length > 0) {
    console.log("  Per-month debt_service in TTM window:");
    for (const record of [...ttmRecords].reverse()) {
      console.log(
        `    ${record.year}-${String(record.month).padStart(2, "0")}: ${fmtDollar(record.debt_service)}`
      );
    }
  } else {
    console.log("  (no monthly_financials rows)");
  }

  console.log("\n=== Source 2: Debt Module store_loans.monthly_payment ===");
  console.log(`  Active loans:  ${(loans ?? []).length}`);
  for (const loan of loans ?? []) {
    console.log(
      `    - ${loan.lender_name ?? "Unnamed"}: ${fmtDollar(loan.monthly_payment ?? 0)}/mo`
    );
  }
  console.log(`  Monthly total: ${fmtDollar(loanMonthlyTotal)}`);
  console.log(`  Annual total:  ${fmtDollar(loanAnnualTotal)}`);
  console.log(`  DSCR:          ${loanDscr == null ? "n/a (no active loans)" : `${fmt(loanDscr)}x`}`);

  console.log("\n=== Source 3: Store profile stores.annual_debt_service (Dashboard) ===");
  console.log(`  Annual:        ${fmtDollar(profileAnnual)}`);
  console.log(`  Monthly (/12): ${fmtDollar(profileMonthly)}`);

  console.log("\n=== Comparison ===");
  const monthlyDeltaPlVsLoans = plMonthlyAvg - loanMonthlyTotal;
  const annualDeltaPlVsLoans = plTtmDebtService - loanAnnualTotal;
  const annualDeltaProfileVsLoans = profileAnnual - loanAnnualTotal;

  console.log(
    `  P&L monthly avg vs loan sum:     ${fmtDollar(monthlyDeltaPlVsLoans)} (${monthlyDeltaPlVsLoans === 0 ? "MATCH" : "DIFFER"})`
  );
  console.log(
    `  P&L TTM total vs loan annual:    ${fmtDollar(annualDeltaPlVsLoans)} (${annualDeltaPlVsLoans === 0 ? "MATCH" : "DIFFER"})`
  );
  console.log(
    `  Profile annual vs loan annual:   ${fmtDollar(annualDeltaProfileVsLoans)} (${annualDeltaProfileVsLoans === 0 ? "MATCH" : "DIFFER"})`
  );

  if (plDscr != null && loanDscr != null) {
    console.log(`  DSCR delta (P&L - loans):        ${fmt(plDscr - loanDscr)}x`);
  }

  console.log("\n=== Interpretation hints ===");
  if (plTtmDebtService === 0 && loanMonthlyTotal > 0) {
    console.log("  P&L debt_service is zero across TTM but loans exist — likely never entered/synced in monthly_financials.");
  }
  if (plTtmDebtService > 0 && loanMonthlyTotal === 0) {
    console.log("  P&L has debt_service but no active loans — may be manual entry or inactive/missing loan records.");
  }
  const uniquePlValues = new Set(ttmRecords.map((r) => r.debt_service));
  if (uniquePlValues.size > 1) {
    console.log("  P&L debt_service varies month-to-month — may reflect actual bank payments, not flat loan schedule.");
  } else if (uniquePlValues.size === 1 && ttmRecords.length > 0) {
    console.log(`  P&L debt_service is flat at ${fmtDollar(Array.from(uniquePlValues)[0])}/mo — likely manual default, not bank-posted.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
