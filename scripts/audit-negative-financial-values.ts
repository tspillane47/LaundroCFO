/**
 * Audits production financial tables for negative numeric values that would
 * violate a >= 0 CHECK constraint.
 *
 * Usage:
 *   set -a && source .env.local && set +a && npx tsx scripts/audit-negative-financial-values.ts
 */

import { createScriptSupabaseClient } from "./createScriptSupabaseClient";

type Violation = {
  table: string;
  id: string;
  store_id?: string;
  year?: number;
  month?: number;
  column: string;
  value: number;
};

const MONTHLY_FINANCIALS_COLUMNS = [
  "revenue",
  "self_service_revenue",
  "wdf_revenue",
  "commercial_revenue",
  "vending_revenue",
  "other_revenue",
  "utilities",
  "rent",
  "payroll",
  "repairs_maintenance",
  "insurance_expense",
  "supplies",
  "marketing",
  "professional_fees",
  "software_subscriptions",
  "cc_processing_fees",
  "bank_charges",
  "other_expenses",
  "debt_service",
];

const MONTHLY_UTILITIES_COLUMNS = ["water", "gas", "electric", "sewer", "trash", "internet"];

const STORE_LOANS_COLUMNS = [
  "original_balance",
  "current_balance",
  "interest_rate",
  "monthly_payment",
  "balloon_amount",
];

const REAL_ESTATE_COLUMNS = [
  "purchase_price",
  "estimated_value",
  "original_loan_amount",
  "current_loan_balance",
  "interest_rate",
  "monthly_mortgage_payment",
  "annual_debt_service",
  "total_square_footage",
  "laundromat_square_footage",
  "monthly_rent_charged",
  "market_rent_estimate",
  "ownership_percentage",
];

const INSURANCE_COLUMNS = [
  "annual_premium",
  "property_deductible",
  "wind_deductible",
  "flood_deductible",
  "equipment_deductible",
  "coverage_limit",
  "coinsurance_pct",
];

function findViolations(
  table: string,
  rows: Record<string, unknown>[],
  columns: string[],
  idField = "id"
): Violation[] {
  const out: Violation[] = [];
  for (const row of rows) {
    for (const column of columns) {
      const raw = row[column];
      if (raw == null) continue;
      const value = Number(raw);
      if (Number.isFinite(value) && value < 0) {
        out.push({
          table,
          id: String(row[idField]),
          store_id: row.store_id != null ? String(row.store_id) : undefined,
          year: row.year != null ? Number(row.year) : undefined,
          month: row.month != null ? Number(row.month) : undefined,
          column,
          value,
        });
      }
    }
  }
  return out;
}

async function main() {
  const supabase = await createScriptSupabaseClient();
  const allViolations: Violation[] = [];

  const mfSelect = `id, store_id, year, month, ${MONTHLY_FINANCIALS_COLUMNS.join(", ")}`;
  const { data: mf, error: mfErr } = await supabase.from("monthly_financials").select(mfSelect);
  if (mfErr) throw mfErr;
  allViolations.push(...findViolations("monthly_financials", mf ?? [], MONTHLY_FINANCIALS_COLUMNS));

  const muSelect = `id, store_id, year, month, ${MONTHLY_UTILITIES_COLUMNS.join(", ")}`;
  const { data: mu, error: muErr } = await supabase.from("monthly_utilities").select(muSelect);
  if (muErr) throw muErr;
  allViolations.push(...findViolations("monthly_utilities", mu ?? [], MONTHLY_UTILITIES_COLUMNS));

  const slSelect = `id, store_id, ${STORE_LOANS_COLUMNS.join(", ")}`;
  const { data: sl, error: slErr } = await supabase.from("store_loans").select(slSelect);
  if (slErr) throw slErr;
  allViolations.push(...findViolations("store_loans", sl ?? [], STORE_LOANS_COLUMNS));

  const reSelect = `id, store_id, ${REAL_ESTATE_COLUMNS.join(", ")}`;
  const { data: re, error: reErr } = await supabase.from("real_estate").select(reSelect);
  if (reErr) throw reErr;
  allViolations.push(...findViolations("real_estate", re ?? [], REAL_ESTATE_COLUMNS));

  const insSelect = `id, store_id, ${INSURANCE_COLUMNS.join(", ")}`;
  const { data: ins, error: insErr } = await supabase.from("insurance_policies").select(insSelect);
  if (insErr) {
    if (!insErr.message.includes("does not exist")) throw insErr;
  } else {
    allViolations.push(...findViolations("insurance_policies", ins ?? [], INSURANCE_COLUMNS));
  }

  const byTable = allViolations.reduce<Record<string, number>>((acc, v) => {
    acc[v.table] = (acc[v.table] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        rowCounts: {
          monthly_financials: mf?.length ?? 0,
          monthly_utilities: mu?.length ?? 0,
          store_loans: sl?.length ?? 0,
          real_estate: re?.length ?? 0,
          insurance_policies: ins?.length ?? 0,
        },
        totalViolations: allViolations.length,
        violationsByTable: byTable,
        violations: allViolations,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
