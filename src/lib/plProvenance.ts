import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANK_IMPORT_CATEGORY_LABELS,
  REVENUE_BREAKDOWN_FIELDS,
  UTILITY_IMPORT_FIELDS,
  type MonthlyFinancialRecord,
  type PlCategoryField,
  type RevenueBreakdownField,
} from "@/lib/financials";
import { money2 } from "@/lib/scheduledVsActual";

export type PlLinkAmount = {
  year: number;
  month: number;
  category: string;
  amount_applied: number;
};

export type ProvenanceField = PlCategoryField | RevenueBreakdownField;

export type CategoryProvenance = {
  field: ProvenanceField;
  label: string;
  stored: number;
  posted: number;
  manual: number;
};

const PAGE = 1000;

const EXPENSE_PROVENANCE_FIELDS: PlCategoryField[] = [
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
];

const DEBT_PROVENANCE_FIELDS: PlCategoryField[] = ["debt_service"];

export function mapPlLinkCategoryToField(category: string): ProvenanceField | null {
  if ((UTILITY_IMPORT_FIELDS as readonly string[]).includes(category) || category === "utilities") {
    return "utilities";
  }
  if (category === "bank_fees") return "bank_charges";
  if ((REVENUE_BREAKDOWN_FIELDS as readonly string[]).includes(category)) {
    return category as RevenueBreakdownField;
  }
  if (category === "revenue" || category === "other_income") return "revenue";
  if (category === "needs_review") return null;
  const plFields: PlCategoryField[] = [
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
  if (plFields.includes(category as PlCategoryField)) return category as PlCategoryField;
  return null;
}

export function sumPostedByField(links: PlLinkAmount[]): Partial<Record<ProvenanceField, number>> {
  const sums: Partial<Record<ProvenanceField, number>> = {};
  for (const link of links) {
    const field = mapPlLinkCategoryToField(link.category);
    if (!field) continue;
    sums[field] = money2((sums[field] ?? 0) + Number(link.amount_applied));
  }
  return sums;
}

export function postedRevenueTotal(posted: Partial<Record<ProvenanceField, number>>): number {
  const breakdown = REVENUE_BREAKDOWN_FIELDS.reduce(
    (sum, field) => sum + (posted[field] ?? 0),
    0
  );
  return money2(breakdown + (posted.revenue ?? 0));
}

function provenanceLine(
  field: ProvenanceField,
  label: string,
  stored: number,
  posted: number
): CategoryProvenance {
  const storedAmt = money2(stored);
  const postedAmt = money2(posted);
  const rawManual = money2(storedAmt - postedAmt);
  return {
    field,
    label,
    stored: storedAmt,
    posted: postedAmt,
    manual: rawManual > 0.005 ? rawManual : 0,
  };
}

export function calcMonthProvenance(
  record: Pick<
    MonthlyFinancialRecord,
    | "revenue"
    | "self_service_revenue"
    | "wdf_revenue"
    | "commercial_revenue"
    | "vending_revenue"
    | "other_revenue"
    | "utilities"
    | "rent"
    | "payroll"
    | "repairs_maintenance"
    | "insurance_expense"
    | "supplies"
    | "marketing"
    | "professional_fees"
    | "software_subscriptions"
    | "cc_processing_fees"
    | "bank_charges"
    | "other_expenses"
    | "debt_service"
  >,
  monthLinks: PlLinkAmount[]
): CategoryProvenance[] {
  const posted = sumPostedByField(monthLinks);
  const lines: CategoryProvenance[] = [];

  for (const field of REVENUE_BREAKDOWN_FIELDS) {
    const stored = Number(record[field] ?? 0);
    const postedAmt = posted[field] ?? 0;
    if (stored === 0 && postedAmt === 0) continue;
    lines.push(
      provenanceLine(field, BANK_IMPORT_CATEGORY_LABELS[field], stored, postedAmt)
    );
  }

  const storedRevenue = Number(record.revenue ?? 0);
  const postedRev = postedRevenueTotal(posted);
  if (storedRevenue !== 0 || postedRev !== 0) {
    lines.push(provenanceLine("revenue", "Revenue", storedRevenue, postedRev));
  }

  for (const field of EXPENSE_PROVENANCE_FIELDS) {
    const stored = Number(record[field] ?? 0);
    const postedAmt = posted[field] ?? 0;
    if (stored === 0 && postedAmt === 0) continue;
    lines.push(
      provenanceLine(field, BANK_IMPORT_CATEGORY_LABELS[field], stored, postedAmt)
    );
  }

  for (const field of DEBT_PROVENANCE_FIELDS) {
    const stored = Number(record[field] ?? 0);
    const postedAmt = posted[field] ?? 0;
    if (stored === 0 && postedAmt === 0) continue;
    lines.push(
      provenanceLine(field, BANK_IMPORT_CATEGORY_LABELS[field], stored, postedAmt)
    );
  }

  return lines;
}

export function linksForPeriod(links: PlLinkAmount[], year: number, month: number): PlLinkAmount[] {
  return links.filter((link) => link.year === year && link.month === month);
}

export async function fetchStoreTransactionPlLinks(
  supabase: SupabaseClient,
  storeId: string
): Promise<PlLinkAmount[]> {
  const rows: PlLinkAmount[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transaction_pl_links")
      .select("year, month, category, amount_applied")
      .eq("store_id", storeId)
      .order("year", { ascending: true })
      .order("month", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as PlLinkAmount[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export function formatPostedManualNote(posted: number, manual: number): string {
  const postedLabel = posted.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const manualLabel = manual.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return `${postedLabel} from posted transactions + ${manualLabel} entered manually`;
}
