import { createClient } from "@/lib/supabase";
import { calcEstimatedBalance } from "@/lib/amortization";
import { calcDSCR } from "@/lib/calculations";
import { getStoreValuation } from "@/lib/getStoreValuation";
import {
  BANK_IMPORT_CATEGORY_LABELS,
  REVENUE_BREAKDOWN_FIELDS,
  UTILITY_IMPORT_FIELDS,
  buildUtilitiesLookup,
  calcTtmMetrics,
  enrichMonthlyRecords,
  sortRecordsDesc,
  type CalculatedMonthly,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
  type PlCategoryField,
  type RevenueBreakdownField,
  type TtmMetrics,
  type UtilityImportField,
} from "@/lib/financials";
import { resolveTtmRentDisplay, type RentDisplaySource } from "@/lib/storeCanonical";

export type CategoryMonthlyAverage = {
  category: string;
  monthlyAverage: number;
};

export type CurrentMonthlyAverages = {
  revenue: {
    byCategory: CategoryMonthlyAverage[];
    total: number;
  };
  expenses: {
    byCategory: CategoryMonthlyAverage[];
    total: number;
  };
  ebitda: {
    monthly: number;
    margin: number;
  };
  debt: {
    loans: {
      name: string;
      monthlyPayment: number;
      outstandingBalance: number;
    }[];
    totalMonthlyDebtService: number;
    totalOutstandingBalance: number | null;
  };
  surplusCashFlow: number;
  dscr: number | null;
  equity: {
    storeValue: number;
    debt: number;
    equity: number;
  } | null;
  waterKPI: {
    ratio: number;
    status: "Healthy" | "Watch" | "High";
    waterMonthlyAverage: number;
    selfServiceMonthlyAverage: number;
  };
  /** Trailing months included in averages (matches Financials TTM window). */
  monthsUsed: number;
  /** How the Rent line in expenses was resolved (display only — P&L totals use monthly_financials). */
  rentSource: RentDisplaySource;
};

/** P&L expense fields included in EBITDA (excludes debt_service). */
const MONTHLY_AVERAGES_EXPENSE_PL_FIELDS = [
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
] as const satisfies readonly PlCategoryField[];

type StoreLoanRow = {
  lender_name: string | null;
  current_balance: number | null;
  interest_rate: number | null;
  monthly_payment: number | null;
  updated_at: string | null;
};

function num(value: number | null | undefined): number {
  return value ?? 0;
}

function sumTtmField(
  ttmRecords: CalculatedMonthly[],
  field: keyof MonthlyFinancialRecord
): number {
  return ttmRecords.reduce((sum, record) => sum + num(record[field] as number), 0);
}

function sumTtmUtilityField(
  ttmRecords: CalculatedMonthly[],
  utilitiesLookup: Map<string, MonthlyUtilityRecord>,
  field: UtilityImportField
): number {
  return ttmRecords.reduce((sum, record) => {
    const utilityRecord = utilitiesLookup.get(`${record.year}-${record.month}`);
    return sum + (utilityRecord ? num(utilityRecord[field]) : 0);
  }, 0);
}

function toMonthlyAverage(ttmTotal: number, monthsUsed: number): number {
  return monthsUsed > 0 ? ttmTotal / monthsUsed : 0;
}

function waterKpiStatus(ratio: number): "Healthy" | "Watch" | "High" {
  if (ratio < 0.15) return "Healthy";
  if (ratio <= 0.2) return "Watch";
  return "High";
}

/** Water KPI: trailing monthly water cost ÷ trailing monthly self-service revenue (same as Financials panel). */
export function computeWaterKpi(
  waterMonthlyAverage: number,
  selfServiceMonthlyAverage: number
): {
  ratio: number;
  status: "Healthy" | "Watch" | "High";
  waterMonthlyAverage: number;
  selfServiceMonthlyAverage: number;
} {
  const ratio =
    selfServiceMonthlyAverage > 0 ? waterMonthlyAverage / selfServiceMonthlyAverage : 0;
  return {
    ratio,
    status: waterKpiStatus(ratio),
    waterMonthlyAverage,
    selfServiceMonthlyAverage,
  };
}

function buildRevenueByCategory(
  ttmRecords: CalculatedMonthly[],
  monthsUsed: number
): CategoryMonthlyAverage[] {
  return REVENUE_BREAKDOWN_FIELDS.map((field: RevenueBreakdownField) => ({
    category: BANK_IMPORT_CATEGORY_LABELS[field],
    monthlyAverage: toMonthlyAverage(sumTtmField(ttmRecords, field), monthsUsed),
  }));
}

function buildExpensesByCategory(
  ttmRecords: CalculatedMonthly[],
  utilitiesLookup: Map<string, MonthlyUtilityRecord>,
  monthsUsed: number
): CategoryMonthlyAverage[] {
  const utilityCategories = UTILITY_IMPORT_FIELDS.map((field) => ({
    category: BANK_IMPORT_CATEGORY_LABELS[field],
    monthlyAverage: toMonthlyAverage(
      sumTtmUtilityField(ttmRecords, utilitiesLookup, field),
      monthsUsed
    ),
  }));

  const plCategories = MONTHLY_AVERAGES_EXPENSE_PL_FIELDS.map((field) => ({
    category: BANK_IMPORT_CATEGORY_LABELS[field],
    monthlyAverage: toMonthlyAverage(sumTtmField(ttmRecords, field), monthsUsed),
  }));

  return [...utilityCategories, ...plCategories];
}

async function fetchTtmFinancialContext(storeId: string): Promise<{
  records: CalculatedMonthly[];
  ttmRecords: CalculatedMonthly[];
  utilitiesLookup: Map<string, MonthlyUtilityRecord>;
  ttm: TtmMetrics;
} | null> {
  const supabase = createClient();

  const [{ data: financialsData }, { data: utilitiesData }] = await Promise.all([
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
  ]);

  if (!financialsData || financialsData.length === 0) return null;

  const utilitiesLookup = buildUtilitiesLookup((utilitiesData ?? []) as MonthlyUtilityRecord[]);
  const records = enrichMonthlyRecords(
    sortRecordsDesc(financialsData as MonthlyFinancialRecord[]),
    utilitiesLookup
  );
  const ttmRecords = records.slice(0, 12);

  return {
    records,
    ttmRecords,
    utilitiesLookup,
    ttm: calcTtmMetrics(records),
  };
}

async function fetchLeaseMonthlyRent(storeId: string): Promise<number | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("leases")
    .select("monthly_rent")
    .eq("store_id", storeId)
    .maybeSingle();

  return data?.monthly_rent ?? null;
}

function applyRentDisplayOverride(
  expensesByCategory: CategoryMonthlyAverage[],
  rentSource: RentDisplaySource,
  rentMonthlyAverage: number | null
): CategoryMonthlyAverage[] {
  const rentLabel = BANK_IMPORT_CATEGORY_LABELS.rent;
  return expensesByCategory.map((item) => {
    if (item.category !== rentLabel) return item;
    if (rentSource === "none") return { ...item, monthlyAverage: 0 };
    return { ...item, monthlyAverage: rentMonthlyAverage ?? 0 };
  });
}

async function fetchActiveStoreLoans(storeId: string): Promise<StoreLoanRow[]> {
  const supabase = createClient();
  const { data: loans } = await supabase
    .from("store_loans")
    .select("lender_name, current_balance, interest_rate, monthly_payment, updated_at")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("current_balance", { ascending: false });

  return (loans ?? []) as StoreLoanRow[];
}

function buildCurrentMonthlyAveragesFromContext(
  context: NonNullable<Awaited<ReturnType<typeof fetchTtmFinancialContext>>>,
  loans: StoreLoanRow[],
  valuation: Awaited<ReturnType<typeof getStoreValuation>>,
  leaseMonthlyRent: number | null
): CurrentMonthlyAverages {
  const { ttmRecords, utilitiesLookup, ttm } = context;
  const monthsUsed = ttm.monthsUsed;
  const { monthlyAverage: rentMonthlyAverage, rentSource } = resolveTtmRentDisplay(
    ttmRecords,
    monthsUsed,
    leaseMonthlyRent
  );

  const revenueTotal = toMonthlyAverage(ttm.ttmRevenue, monthsUsed);
  const expensesTotal = toMonthlyAverage(
    ttmRecords.reduce((sum, record) => sum + record.totalExpenses, 0),
    monthsUsed
  );
  const ebitdaMonthly = toMonthlyAverage(ttm.ttmEbitda, monthsUsed);

  const enrichedLoans = loans.map((loan) => {
    const outstandingBalance = calcEstimatedBalance({
      currentBalance: loan.current_balance ?? 0,
      interestRate: loan.interest_rate ?? 0,
      monthlyPayment: loan.monthly_payment ?? 0,
      lastUpdated: loan.updated_at ?? undefined,
    });

    return {
      name: loan.lender_name?.trim() || "Unnamed Loan",
      monthlyPayment: num(loan.monthly_payment),
      outstandingBalance,
    };
  });

  const totalMonthlyDebtService = enrichedLoans.reduce(
    (sum, loan) => sum + loan.monthlyPayment,
    0
  );
  const totalOutstandingBalance = enrichedLoans.reduce(
    (sum, loan) => sum + loan.outstandingBalance,
    0
  );

  const waterMonthlyAverage = toMonthlyAverage(
    sumTtmUtilityField(ttmRecords, utilitiesLookup, "water"),
    monthsUsed
  );
  const selfServiceMonthlyAverage = toMonthlyAverage(
    sumTtmField(ttmRecords, "self_service_revenue"),
    monthsUsed
  );
  const waterKPI = computeWaterKpi(waterMonthlyAverage, selfServiceMonthlyAverage);

  const storeValue = valuation.businessValue;
  const equity =
    storeValue > 0 && totalOutstandingBalance != null
      ? {
          storeValue,
          debt: totalOutstandingBalance,
          equity: storeValue - totalOutstandingBalance,
        }
      : null;

  return {
    revenue: {
      byCategory: buildRevenueByCategory(ttmRecords, monthsUsed),
      total: revenueTotal,
    },
    expenses: {
      byCategory: applyRentDisplayOverride(
        buildExpensesByCategory(ttmRecords, utilitiesLookup, monthsUsed),
        rentSource,
        rentMonthlyAverage
      ),
      total: expensesTotal,
    },
    ebitda: {
      monthly: ebitdaMonthly,
      margin: revenueTotal > 0 ? ebitdaMonthly / revenueTotal : 0,
    },
    debt: {
      loans: enrichedLoans,
      totalMonthlyDebtService,
      totalOutstandingBalance,
    },
    surplusCashFlow: ebitdaMonthly - totalMonthlyDebtService,
    dscr: calcDSCR(ebitdaMonthly * 12, totalMonthlyDebtService * 12),
    equity,
    waterKPI,
    monthsUsed,
    rentSource,
  };
}

export async function getCurrentMonthlyAverages(
  storeId: string
): Promise<CurrentMonthlyAverages | null> {
  const context = await fetchTtmFinancialContext(storeId);
  if (!context || context.ttm.monthsUsed === 0) return null;

  const [loans, valuation, leaseMonthlyRent] = await Promise.all([
    fetchActiveStoreLoans(storeId),
    getStoreValuation(storeId),
    fetchLeaseMonthlyRent(storeId),
  ]);

  return buildCurrentMonthlyAveragesFromContext(context, loans, valuation, leaseMonthlyRent);
}

export type MonthlyAveragesReconciliation = {
  storeId: string;
  monthsUsed: number;
  ttm: TtmMetrics;
  monthlyAverages: CurrentMonthlyAverages;
  checks: {
    revenueMatches: boolean;
    expensesMatch: boolean;
    ebitdaMatches: boolean;
    ebitdaFromComponentsMatches: boolean;
    revenueDelta: number;
    expensesDelta: number;
    ebitdaDelta: number;
    componentEbitdaDelta: number;
  };
};

/** Compare monthly averages against Financials-page TTM totals (annual / monthsUsed). */
export async function reconcileCurrentMonthlyAverages(
  storeId: string
): Promise<MonthlyAveragesReconciliation | null> {
  const context = await fetchTtmFinancialContext(storeId);
  if (!context || context.ttm.monthsUsed === 0) return null;

  const [loans, valuation, leaseMonthlyRent] = await Promise.all([
    fetchActiveStoreLoans(storeId),
    getStoreValuation(storeId),
    fetchLeaseMonthlyRent(storeId),
  ]);
  const monthlyAverages = buildCurrentMonthlyAveragesFromContext(
    context,
    loans,
    valuation,
    leaseMonthlyRent
  );

  const { ttm, ttmRecords } = context;
  const monthsUsed = ttm.monthsUsed;
  const tolerance = 0.01;

  const expectedRevenueMonthly = ttm.ttmRevenue / monthsUsed;
  const expectedExpensesMonthly =
    ttmRecords.reduce((sum, record) => sum + record.totalExpenses, 0) / monthsUsed;
  const expectedEbitdaMonthly = ttm.ttmEbitda / monthsUsed;

  const revenueDelta = monthlyAverages.revenue.total - expectedRevenueMonthly;
  const expensesDelta = monthlyAverages.expenses.total - expectedExpensesMonthly;
  const ebitdaDelta = monthlyAverages.ebitda.monthly - expectedEbitdaMonthly;
  const componentEbitda =
    monthlyAverages.revenue.total - monthlyAverages.expenses.total;
  const componentEbitdaDelta = monthlyAverages.ebitda.monthly - componentEbitda;

  return {
    storeId,
    monthsUsed,
    ttm,
    monthlyAverages,
    checks: {
      revenueMatches: Math.abs(revenueDelta) <= tolerance,
      expensesMatch: Math.abs(expensesDelta) <= tolerance,
      ebitdaMatches: Math.abs(ebitdaDelta) <= tolerance,
      ebitdaFromComponentsMatches: Math.abs(componentEbitdaDelta) <= tolerance,
      revenueDelta,
      expensesDelta,
      ebitdaDelta,
      componentEbitdaDelta,
    },
  };
}
