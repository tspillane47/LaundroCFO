import {
  isRevenueBreakdownCategory,
  isUtilityImportCategory,
  mapBankCategoryToPlField,
  mapBankCategoryToRevenueField,
  MONTH_NAMES,
  MONTH_SHORT,
  type BankImportCategory,
} from "@/lib/financials";
import {
  excludedPlaidAccountOrFilter,
  fetchExcludedPlaidAccountIds,
  isBankTransactionVisibleForExcludedPlaidAccounts,
} from "@/lib/plaid-shared";
import type { YearRevenueEbitdaPoint } from "@/lib/yearRevenueEbitdaChart";
import type { createClient } from "@/lib/supabase";

type FinancialsSupabaseClient = ReturnType<typeof createClient>;

export type ThisMonthTransaction = {
  transaction_date: string;
  amount: number;
  category: string | null;
  status?: string | null;
  excluded?: boolean;
  plaid_account_id?: string | null;
};

export type ThisMonthChartModel = {
  points: YearRevenueEbitdaPoint[];
  monthLabel: string;
  throughLabel: string;
  hasCategorizedActivity: boolean;
  hasAnyTransactions: boolean;
  latestRevenue: number;
  latestEbitda: number;
};

export function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentMonthBounds(asOf: Date = new Date()): {
  start: Date;
  today: Date;
  year: number;
  month: number;
} {
  const year = asOf.getFullYear();
  const monthIndex = asOf.getMonth();
  return {
    start: new Date(year, monthIndex, 1),
    today: new Date(year, monthIndex, asOf.getDate()),
    year,
    month: monthIndex + 1,
  };
}

export function parseLocalTransactionDate(value: string): Date | null {
  const [year, month, day] = value.split("T")[0].split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** P&L bucket for the in-month running total. Debt service is below EBITDA. */
export function classifyThisMonthBucket(category: string | null | undefined): "revenue" | "opex" | "skip" {
  if (!category || category === "needs_review") return "skip";
  const importCategory = category as BankImportCategory;
  if (mapBankCategoryToRevenueField(importCategory) || isRevenueBreakdownCategory(importCategory)) {
    return "revenue";
  }
  if (category === "debt_service") return "skip";
  if (isUtilityImportCategory(importCategory) || category === "utilities") return "opex";
  if (mapBankCategoryToPlField(importCategory)) return "opex";
  return "skip";
}

export function isCountableThisMonthTransaction(txn: ThisMonthTransaction): boolean {
  if (txn.excluded) return false;
  if (txn.status === "excluded") return false;
  return true;
}

export function buildThisMonthChartModel(
  transactions: ThisMonthTransaction[],
  asOf: Date = new Date()
): ThisMonthChartModel {
  const { start, today, month } = currentMonthBounds(asOf);
  const daysThroughToday = today.getDate();
  const dailyRevenue = Array.from({ length: daysThroughToday }, () => 0);
  const dailyOpex = Array.from({ length: daysThroughToday }, () => 0);

  let hasAnyTransactions = false;
  let hasCategorizedActivity = false;

  for (const txn of transactions) {
    if (!isCountableThisMonthTransaction(txn)) continue;
    const date = parseLocalTransactionDate(txn.transaction_date);
    if (!date) continue;
    if (date < start || date > today) continue;
    hasAnyTransactions = true;

    const bucket = classifyThisMonthBucket(txn.category);
    if (bucket === "skip") continue;

    const dayIndex = date.getDate() - 1;
    const amount = Math.abs(txn.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;

    hasCategorizedActivity = true;
    if (bucket === "revenue") dailyRevenue[dayIndex] += amount;
    else dailyOpex[dayIndex] += amount;
  }

  let runningRevenue = 0;
  let runningOpex = 0;
  const points: YearRevenueEbitdaPoint[] = dailyRevenue.map((revenue, index) => {
    runningRevenue += revenue;
    runningOpex += dailyOpex[index];
    return {
      label: String(index + 1),
      revenue: runningRevenue,
      ebitda: runningRevenue - runningOpex,
    };
  });

  const last = points[points.length - 1];
  return {
    points,
    monthLabel: MONTH_NAMES[month - 1],
    throughLabel: `through ${MONTH_SHORT[month - 1]} ${today.getDate()}`,
    hasCategorizedActivity,
    hasAnyTransactions,
    latestRevenue: last?.revenue ?? 0,
    latestEbitda: last?.ebitda ?? 0,
  };
}

export function thisMonthEmptyMessage(model: ThisMonthChartModel): string {
  if (model.hasAnyTransactions && !model.hasCategorizedActivity) {
    return "Categorize this month's transactions to see a running total.";
  }
  return "Sync or import bank transactions to see this month as it happens.";
}

export function thisMonthTickInterval(pointCount: number): number {
  if (pointCount <= 10) return 0;
  if (pointCount <= 20) return 1;
  return 2;
}

export async function fetchThisMonthBankTransactions(
  supabase: FinancialsSupabaseClient,
  storeId: string,
  asOf: Date = new Date()
): Promise<ThisMonthTransaction[]> {
  const { start, today } = currentMonthBounds(asOf);
  const excludedAccountIds = await fetchExcludedPlaidAccountIds(supabase, storeId);
  const visibilityFilter = excludedPlaidAccountOrFilter(excludedAccountIds);

  let query = supabase
    .from("bank_transactions")
    .select("transaction_date, amount, category, status, excluded, plaid_account_id")
    .eq("store_id", storeId)
    .eq("excluded", false)
    .not("status", "eq", "excluded")
    .gte("transaction_date", formatLocalIsoDate(start))
    .lte("transaction_date", formatLocalIsoDate(today));

  if (visibilityFilter) {
    query = query.or(visibilityFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as ThisMonthTransaction[]).filter((txn) =>
    isBankTransactionVisibleForExcludedPlaidAccounts(txn, excludedAccountIds)
  );
}
