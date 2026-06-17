/**
 * Verify Current Monthly Averages reconcile with Financials TTM totals.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npx tsx scripts/verify-monthly-averages.ts <storeId>
 */

import { reconcileCurrentMonthlyAverages } from "../src/lib/getCurrentMonthlyAverages";

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function main() {
  const storeId = process.argv[2];
  if (!storeId) {
    console.error("Usage: npx tsx scripts/verify-monthly-averages.ts <storeId>");
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const result = await reconcileCurrentMonthlyAverages(storeId);
  if (!result) {
    console.error(`No monthly financial data found for store ${storeId}`);
    process.exit(1);
  }

  const { ttm, monthlyAverages, checks, monthsUsed } = result;

  console.log(`\nStore: ${storeId}`);
  console.log(`TTM months used: ${monthsUsed}\n`);

  console.log("Financials page TTM totals:");
  console.log(`  Revenue: ${fmt(ttm.ttmRevenue)}`);
  console.log(`  EBITDA:  ${fmt(ttm.ttmEbitda)}`);
  console.log(`  Margin:  ${fmt(ttm.ttmEbitdaMargin)}%`);
  console.log(`  DSCR:    ${fmt(ttm.dscr)}x (P&L debt_service)`);

  console.log("\nMonthly averages (TTM / monthsUsed):");
  console.log(`  Revenue: ${fmt(monthlyAverages.revenue.total)} / mo`);
  console.log(`  Expenses: ${fmt(monthlyAverages.expenses.total)} / mo`);
  console.log(`  EBITDA:  ${fmt(monthlyAverages.ebitda.monthly)} / mo`);
  console.log(`  Margin:  ${fmt(monthlyAverages.ebitda.margin * 100)}%`);
  console.log(`  DSCR:    ${monthlyAverages.dscr == null ? "n/a" : `${fmt(monthlyAverages.dscr)}x (loan payments)`}`);

  console.log("\nReconciliation (monthly × monthsUsed should equal TTM):");
  console.log(
    `  Revenue: ${checks.revenueMatches ? "PASS" : "FAIL"} (delta ${fmt(checks.revenueDelta)})`
  );
  console.log(
    `  Expenses: ${checks.expensesMatch ? "PASS" : "FAIL"} (delta ${fmt(checks.expensesDelta)})`
  );
  console.log(
    `  EBITDA: ${checks.ebitdaMatches ? "PASS" : "FAIL"} (delta ${fmt(checks.ebitdaDelta)})`
  );
  console.log(
    `  EBITDA = Revenue - Expenses: ${
      checks.ebitdaFromComponentsMatches ? "PASS" : "FAIL"
    } (delta ${fmt(checks.componentEbitdaDelta)})`
  );

  const allPass =
    checks.revenueMatches &&
    checks.expensesMatch &&
    checks.ebitdaMatches &&
    checks.ebitdaFromComponentsMatches;

  console.log(`\nOverall: ${allPass ? "PASS" : "FAIL"}\n`);
  process.exit(allPass ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
