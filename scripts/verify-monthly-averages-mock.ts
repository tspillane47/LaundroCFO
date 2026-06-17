/**
 * Offline reconciliation test using in-memory monthly records (no Supabase).
 *
 * Usage: npx tsx scripts/verify-monthly-averages-mock.ts
 */

import {
  buildUtilitiesLookup,
  calcMonthlyWithUtilities,
  calcTtmMetrics,
  enrichMonthlyRecords,
  sortRecordsDesc,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
} from "../src/lib/financials";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildMockRecords(): {
  records: ReturnType<typeof enrichMonthlyRecords>;
  utilitiesLookup: Map<string, MonthlyUtilityRecord>;
} {
  const financials: MonthlyFinancialRecord[] = [];
  const utilities: MonthlyUtilityRecord[] = [];

  for (let i = 0; i < 12; i++) {
    const month = 12 - i;
    const year = 2025;
    financials.push({
      id: `fin-${i}`,
      store_id: "mock-store",
      year,
      month,
      revenue: 70000 + i * 100,
      self_service_revenue: 45000 + i * 50,
      wdf_revenue: 12000,
      commercial_revenue: 8000,
      vending_revenue: 3000,
      other_revenue: 2000,
      utilities: 0,
      rent: 6200,
      payroll: 8500,
      repairs_maintenance: 1200,
      insurance_expense: 900,
      supplies: 600,
      marketing: 400,
      professional_fees: 300,
      software_subscriptions: 150,
      cc_processing_fees: 500,
      bank_charges: 75,
      other_expenses: 250,
      debt_service: 8200,
    });

    utilities.push({
      year,
      month,
      water: 900,
      gas: 400,
      electric: 1100,
      sewer: 200,
      trash: 150,
      internet: 100,
    });
  }

  const utilitiesLookup = buildUtilitiesLookup(utilities);
  const records = enrichMonthlyRecords(sortRecordsDesc(financials), utilitiesLookup);
  return { records, utilitiesLookup };
}

function main() {
  const { records, utilitiesLookup } = buildMockRecords();
  const ttmRecords = records.slice(0, 12);
  const ttm = calcTtmMetrics(records);
  const monthsUsed = ttm.monthsUsed;

  const revenueTotal = ttm.ttmRevenue / monthsUsed;
  const expensesTotal =
    ttmRecords.reduce((sum, record) => sum + record.totalExpenses, 0) / monthsUsed;
  const ebitdaMonthly = ttm.ttmEbitda / monthsUsed;

  assert(Math.abs(revenueTotal * monthsUsed - ttm.ttmRevenue) < 0.01, "Revenue TTM mismatch");
  assert(Math.abs(ebitdaMonthly * monthsUsed - ttm.ttmEbitda) < 0.01, "EBITDA TTM mismatch");
  assert(
    Math.abs(revenueTotal - expensesTotal - ebitdaMonthly) < 0.01,
    "EBITDA != revenue - expenses"
  );

  const waterMonthly =
    ttmRecords.reduce((sum, record) => {
      const utility = utilitiesLookup.get(`${record.year}-${record.month}`);
      return sum + (utility?.water ?? 0);
    }, 0) / monthsUsed;

  const selfServiceMonthly =
    ttmRecords.reduce((sum, record) => sum + record.self_service_revenue, 0) / monthsUsed;

  for (const record of ttmRecords) {
    const calculated = calcMonthlyWithUtilities(
      record,
      utilitiesLookup.get(`${record.year}-${record.month}`)
    );
    assert(
      Math.abs(calculated.ebitda - (calculated.revenue - calculated.totalExpenses)) < 0.01,
      `Monthly EBITDA mismatch for ${record.year}-${record.month}`
    );
  }

  console.log("Mock reconciliation PASS");
  console.log(`  TTM Revenue: ${ttm.ttmRevenue.toFixed(2)}`);
  console.log(`  TTM EBITDA:  ${ttm.ttmEbitda.toFixed(2)}`);
  console.log(`  Monthly Revenue: ${revenueTotal.toFixed(2)}`);
  console.log(`  Monthly EBITDA:  ${ebitdaMonthly.toFixed(2)}`);
  console.log(
    `  Water / Self-Service ratio: ${(waterMonthly / selfServiceMonthly).toFixed(4)}`
  );
}

main();
