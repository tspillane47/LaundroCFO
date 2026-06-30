import { calcEstimatedBalance, calcRemainingMonths } from "@/lib/amortization";
import { calcDSCR } from "@/lib/calculations";
import { computeTurnsPerDay, DEFAULT_DRYER_REVENUE_PCT, type EquipmentRecord, type TurnsPerDayResult } from "@/lib/equipment";
import {
  applyLoanDebtServiceToTtm,
  buildUtilitiesLookup,
  calcTtmMetrics,
  enrichMonthlyRecords,
  sortRecordsAsc,
  sortRecordsDesc,
  type CalculatedMonthly,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
  type TtmMetrics,
  type UtilityImportField,
  REVENUE_BREAKDOWN_FIELDS,
  UTILITY_IMPORT_FIELDS,
  MONTH_SHORT,
  MONTH_NAMES,
} from "@/lib/financials";
import { computeWaterKpi } from "@/lib/getCurrentMonthlyAverages";
import {
  resolveEquipmentFromInventory,
  resolveOccupancyRentDisplay,
  resolveSquareFootage,
} from "@/lib/storeCanonical";
import { benchmarks as industryBenchmarks } from "@/lib/data";
import type { createClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createClient>;

export type StoreLoanRecord = {
  id: string;
  lender_name: string | null;
  original_balance: number | null;
  current_balance: number | null;
  interest_rate: number | null;
  monthly_payment: number | null;
  loan_start_date: string | null;
  loan_end_date: string | null;
  amortization_term_months: number | null;
  updated_at: string | null;
};

export type CategoryBreakdownLine = {
  label: string;
  ttmTotal: number;
  monthlyAverage: number;
  pctOfTotal: number;
};

export type EnrichedStoreLoan = {
  id: string;
  lenderName: string;
  originalBalance: number;
  currentBalance: number;
  estimatedBalance: number;
  interestRate: number;
  monthlyPayment: number;
  remainingMonths: number;
};

export type BenchmarkMetricRow = {
  metric: string;
  store: number | null;
  unit: string;
  median: number;
  top25: number;
  bottom25: number;
  lowerIsBetter: boolean;
};

export type UtilityTtmPoint = { month: string; value: number };

export type UtilityChartSeries = {
  field: UtilityImportField;
  label: string;
  data: UtilityTtmPoint[];
};

export type UtilitySummaryRow = {
  label: string;
  ttmTotal: number;
  monthlyAverage: number;
  pctOfRevenue: number;
  status: string;
};

export type UtilityReportData = {
  chartSeries: UtilityChartSeries[];
  summaryRows: UtilitySummaryRow[];
};

export type ReportFinancialContext = {
  hasMonthlyFinancials: boolean;
  limitedData: boolean;
  records: CalculatedMonthly[];
  ttmRecords: CalculatedMonthly[];
  ttm: TtmMetrics;
  utilitiesLookup: Map<string, MonthlyUtilityRecord>;
  revenueBreakdown: CategoryBreakdownLine[];
  expenseBreakdown: CategoryBreakdownLine[];
  revenueTtmTotal: number;
  expenseTtmTotal: number;
  ebitdaTtmTotal: number;
  ebitdaMargin: number;
  monthlyAverages: { revenue: number; expenses: number; ebitda: number };
  ttmChartData: { label: string; revenue: number; ebitda: number; year: number; month: number }[];
  loans: EnrichedStoreLoan[];
  totalMonthlyDebtService: number;
  totalOutstandingDebt: number;
  annualDebtService: number;
  dscr: number | null;
  monthlyEbitda: number;
  surplusCashFlow: number;
  waterKPI: ReturnType<typeof computeWaterKpi>;
  benchmarkRows: BenchmarkMetricRow[];
  monthlyFinancialsForScore: { revenue?: number | null; utilities?: number | null }[];
  monthlyUtilities: MonthlyUtilityRecord[];
  availableMonths: { year: number; month: number }[];
  utilityReport: UtilityReportData;
  selfServiceTtmTotal: number;
  equipmentTurns: TurnsPerDayResult | null;
};

function num(value: number | null | undefined): number {
  return value ?? 0;
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function toMonthlyAverage(ttmTotal: number, monthsUsed: number): number {
  return monthsUsed > 0 ? ttmTotal / monthsUsed : 0;
}

function sumTtmField(ttmRecords: CalculatedMonthly[], field: keyof MonthlyFinancialRecord): number {
  return ttmRecords.reduce((sum, record) => sum + num(record[field] as number), 0);
}

function sumTtmUtilityField(
  ttmRecords: CalculatedMonthly[],
  utilitiesLookup: Map<string, MonthlyUtilityRecord>,
  field: UtilityImportField
): number {
  return ttmRecords.reduce((sum, record) => {
    const utilityRecord = utilitiesLookup.get(monthKey(record.year, record.month));
    return sum + (utilityRecord ? num(utilityRecord[field]) : 0);
  }, 0);
}

const REVENUE_LABELS: Record<(typeof REVENUE_BREAKDOWN_FIELDS)[number], string> = {
  self_service_revenue: "Self-Service",
  wdf_revenue: "WDF",
  commercial_revenue: "Commercial",
  vending_revenue: "Vending",
  other_revenue: "Other",
};

const UTILITY_EXPENSE_LABELS: Partial<Record<UtilityImportField, string>> = {
  water: "Water",
  gas: "Gas",
  electric: "Electric",
  trash: "Trash",
};

const EXPENSE_UTILITY_FIELDS: UtilityImportField[] = ["water", "gas", "electric", "trash"];

const UTILITY_TABLE_FIELDS: { field: UtilityImportField; label: string }[] = [
  { field: "water", label: "Water" },
  { field: "gas", label: "Gas" },
  { field: "electric", label: "Electric" },
  { field: "sewer", label: "Sewer" },
  { field: "trash", label: "Trash" },
];

const UTILITY_CHART_FIELDS: UtilityImportField[] = ["water", "gas", "electric"];

/** Typical share of total utility spend used for per-utility industry comparison. */
const UTILITY_INDUSTRY_SHARE: Partial<Record<UtilityImportField, number>> = {
  gas: 0.3,
  electric: 0.25,
  sewer: 0.05,
  trash: 0.05,
};

const UTILITY_RATIO_BENCHMARK = industryBenchmarks.find((b) => b.metric === "Utility Ratio")!;

export function enrichStoreLoans(loans: StoreLoanRecord[]): EnrichedStoreLoan[] {
  return loans.map((loan) => {
    const estimatedBalance = calcEstimatedBalance({
      currentBalance: num(loan.current_balance),
      interestRate: num(loan.interest_rate),
      monthlyPayment: num(loan.monthly_payment),
      lastUpdated: loan.updated_at ?? undefined,
    });

    const remainingMonths = calcRemainingMonths({
      currentBalance: estimatedBalance,
      interestRate: num(loan.interest_rate),
      monthlyPayment: num(loan.monthly_payment),
      loanStartDate: loan.loan_start_date ?? undefined,
      amortizationTermMonths: loan.amortization_term_months ?? undefined,
    });

    return {
      id: loan.id,
      lenderName: loan.lender_name?.trim() || "Unnamed Loan",
      originalBalance: num(loan.original_balance),
      currentBalance: num(loan.current_balance),
      estimatedBalance,
      interestRate: num(loan.interest_rate),
      monthlyPayment: num(loan.monthly_payment),
      remainingMonths,
    };
  });
}

function buildRevenueBreakdown(
  ttmRecords: CalculatedMonthly[],
  monthsUsed: number
): CategoryBreakdownLine[] {
  const lines = REVENUE_BREAKDOWN_FIELDS.map((field) => ({
    label: REVENUE_LABELS[field],
    ttmTotal: sumTtmField(ttmRecords, field),
  }));

  const total = lines.reduce((s, l) => s + l.ttmTotal, 0);
  return lines
    .filter((l) => l.ttmTotal > 0 || total === 0)
    .map((l) => ({
      ...l,
      monthlyAverage: toMonthlyAverage(l.ttmTotal, monthsUsed),
      pctOfTotal: total > 0 ? (l.ttmTotal / total) * 100 : 0,
    }));
}

function buildExpenseBreakdown(
  ttmRecords: CalculatedMonthly[],
  utilitiesLookup: Map<string, MonthlyUtilityRecord>,
  monthsUsed: number,
  camMonthlyAverage: number
): CategoryBreakdownLine[] {
  const plLines: { label: string; ttmTotal: number }[] = [
    ...EXPENSE_UTILITY_FIELDS.map((field) => ({
      label: UTILITY_EXPENSE_LABELS[field] ?? field,
      ttmTotal: sumTtmUtilityField(ttmRecords, utilitiesLookup, field),
    })),
    { label: "Rent", ttmTotal: sumTtmField(ttmRecords, "rent") },
    {
      label: "CAM",
      ttmTotal: camMonthlyAverage * monthsUsed,
    },
    { label: "Payroll", ttmTotal: sumTtmField(ttmRecords, "payroll") },
    { label: "Repairs", ttmTotal: sumTtmField(ttmRecords, "repairs_maintenance") },
    { label: "Insurance", ttmTotal: sumTtmField(ttmRecords, "insurance_expense") },
    { label: "Supplies", ttmTotal: sumTtmField(ttmRecords, "supplies") },
    { label: "Advertising", ttmTotal: sumTtmField(ttmRecords, "marketing") },
    { label: "Professional Fees", ttmTotal: sumTtmField(ttmRecords, "professional_fees") },
    { label: "Bank Fees", ttmTotal: sumTtmField(ttmRecords, "bank_charges") },
    { label: "Credit Card Processing", ttmTotal: sumTtmField(ttmRecords, "cc_processing_fees") },
    {
      label: "Other",
      ttmTotal:
        sumTtmField(ttmRecords, "other_expenses") +
        sumTtmField(ttmRecords, "software_subscriptions"),
    },
  ];

  const total = plLines.reduce((s, l) => s + l.ttmTotal, 0);
  return plLines
    .filter((l) => l.ttmTotal > 0 || total === 0)
    .map((l) => ({
      ...l,
      monthlyAverage: toMonthlyAverage(l.ttmTotal, monthsUsed),
      pctOfTotal: total > 0 ? (l.ttmTotal / total) * 100 : 0,
    }));
}

export function buildBenchmarkRows(args: {
  ttm: TtmMetrics;
  monthlyEbitda: number;
  monthlyRevenue: number;
  utilityRatio: number | null;
  rentToRevenue: number | null;
  dscr: number | null;
  revenuePerSF: number | null;
  revenuePerMachine: number | null;
  avgEquipmentAge: number | null;
}): BenchmarkMetricRow[] {
  const annualRevenue = args.ttm.ttmRevenue;
  const ebitdaMargin = args.ttm.ttmRevenue > 0 ? (args.ttm.ttmEbitda / args.ttm.ttmRevenue) * 100 : null;

  const map: Record<string, number | null> = {
    "EBITDA Margin": ebitdaMargin,
    "Revenue per SF": args.revenuePerSF,
    "Utility Ratio": args.utilityRatio,
    "Rent to Revenue": args.rentToRevenue,
    DSCR: args.dscr,
    "Revenue per Machine": args.revenuePerMachine,
    "Avg Equipment Age": args.avgEquipmentAge,
  };

  return industryBenchmarks.map((b) => ({
    metric: b.metric,
    store: map[b.metric] ?? null,
    unit: b.unit,
    median: b.median,
    top25: b.top25,
    bottom25: b.bottom25,
    lowerIsBetter: b.lowerIsBetter,
  }));
}

export function buildTtmChartData(records: CalculatedMonthly[]): ReportFinancialContext["ttmChartData"] {
  const ttm = sortRecordsAsc(records.slice(0, 12));
  return ttm.map((r) => ({
    label: MONTH_SHORT[r.month - 1],
    revenue: r.revenue,
    ebitda: r.ebitda,
    year: r.year,
    month: r.month,
  }));
}

function utilityIndustryStatus(
  pctOfRevenue: number,
  field: UtilityImportField | "total"
): string {
  const share = field === "total" ? 1 : (UTILITY_INDUSTRY_SHARE[field] ?? 0.15);
  const top25 = UTILITY_RATIO_BENCHMARK.top25 * share;
  const bottom25 = UTILITY_RATIO_BENCHMARK.bottom25 * share;
  if (pctOfRevenue <= top25) return "Top Quartile";
  if (pctOfRevenue >= bottom25) return "Above Median";
  return "Median Range";
}

export function buildUtilityTtmSeries(
  ttmRecords: CalculatedMonthly[],
  utilitiesLookup: Map<string, MonthlyUtilityRecord>,
  field: UtilityImportField
): UtilityTtmPoint[] {
  const ttm = sortRecordsAsc(ttmRecords.slice(0, 12));
  return ttm.map((r) => ({
    month: MONTH_SHORT[r.month - 1],
    value: num(utilitiesLookup.get(monthKey(r.year, r.month))?.[field]),
  }));
}

export function buildUtilityReportData(args: {
  ttmRecords: CalculatedMonthly[];
  utilitiesLookup: Map<string, MonthlyUtilityRecord>;
  monthsUsed: number;
  revenueTtmTotal: number;
  waterKPI: ReturnType<typeof computeWaterKpi>;
}): UtilityReportData {
  const { ttmRecords, utilitiesLookup, monthsUsed, revenueTtmTotal, waterKPI } = args;

  const chartSeries = UTILITY_CHART_FIELDS.map((field) => ({
    field,
    label: UTILITY_EXPENSE_LABELS[field] ?? field,
    data: buildUtilityTtmSeries(ttmRecords, utilitiesLookup, field),
  })).filter((series) => series.data.some((point) => point.value > 0));

  const summaryRows: UtilitySummaryRow[] = [];
  let totalUtilitiesTtm = 0;

  for (const { field, label } of UTILITY_TABLE_FIELDS) {
    const ttmTotal = sumTtmUtilityField(ttmRecords, utilitiesLookup, field);
    if (ttmTotal <= 0) continue;
    totalUtilitiesTtm += ttmTotal;
    const monthlyAverage = toMonthlyAverage(ttmTotal, monthsUsed);
    const pctOfRevenue = revenueTtmTotal > 0 ? (ttmTotal / revenueTtmTotal) * 100 : 0;
    const status =
      field === "water" ? waterKPI.status : utilityIndustryStatus(pctOfRevenue, field);
    summaryRows.push({ label, ttmTotal, monthlyAverage, pctOfRevenue, status });
  }

  if (totalUtilitiesTtm > 0) {
    const monthlyAverage = toMonthlyAverage(totalUtilitiesTtm, monthsUsed);
    const pctOfRevenue = revenueTtmTotal > 0 ? (totalUtilitiesTtm / revenueTtmTotal) * 100 : 0;
    summaryRows.push({
      label: "Total",
      ttmTotal: totalUtilitiesTtm,
      monthlyAverage,
      pctOfRevenue,
      status: utilityIndustryStatus(pctOfRevenue, "total"),
    });
  }

  return { chartSeries, summaryRows };
}

function resolveAnnualRent(
  ttmRecords: CalculatedMonthly[],
  monthsUsed: number,
  leaseMonthlyRent: number
): number {
  const ttmRent = sumTtmField(ttmRecords, "rent");
  if (ttmRent > 0) return ttmRent;
  return leaseMonthlyRent > 0 ? leaseMonthlyRent * Math.max(monthsUsed, 1) : 0;
}

export function recordsThroughMonth(
  records: CalculatedMonthly[],
  year: number,
  month: number
): CalculatedMonthly[] {
  return records.filter((r) => {
    if (r.year < year) return true;
    if (r.year === year) return r.month <= month;
    return false;
  });
}

export function ttmRecordsEndingAt(
  records: CalculatedMonthly[],
  year: number,
  month: number
): CalculatedMonthly[] {
  const idx = records.findIndex((r) => r.year === year && r.month === month);
  if (idx === -1) return records.slice(0, 12);
  return records.slice(idx, idx + 12);
}

export function priorMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function formatReportMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export async function fetchReportFinancialContext(
  supabase: SupabaseClient,
  storeId: string,
  options?: {
    endYear?: number;
    endMonth?: number;
    camMonthly?: number;
    store?: Record<string, unknown>;
    equipment?: EquipmentRecord[];
    lease?: Record<string, unknown> | null;
    realEstate?: Record<string, unknown> | null;
  }
): Promise<ReportFinancialContext> {
  const [{ data: financialsData }, { data: utilitiesData }, { data: loansData }] = await Promise.all([
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
      .select(
        "id, lender_name, original_balance, current_balance, interest_rate, monthly_payment, loan_start_date, loan_end_date, amortization_term_months, updated_at"
      )
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("current_balance", { ascending: false }),
  ]);

  const monthlyUtilities = (utilitiesData ?? []) as MonthlyUtilityRecord[];
  const utilitiesLookup = buildUtilitiesLookup(monthlyUtilities);
  const availableMonths = (financialsData ?? []).map((r) => ({ year: r.year, month: r.month }));
  const loans = enrichStoreLoans((loansData ?? []) as StoreLoanRecord[]);
  const totalMonthlyDebtService = loans.reduce((s, l) => s + l.monthlyPayment, 0);
  const totalOutstandingDebt = loans.reduce((s, l) => s + l.estimatedBalance, 0);
  const annualDebtService = totalMonthlyDebtService * 12;

  const monthlyFinancialsForScore = (financialsData ?? []).slice(0, 12).map((r) => ({
    revenue: r.revenue,
    utilities: r.utilities,
  }));

  if (!financialsData || financialsData.length === 0) {
    const store = options?.store ?? {};
    const monthlyRevenue = num(store.monthly_revenue as number);
    const monthlyExpenses = num(store.monthly_expenses as number);
    const monthlyEbitda = monthlyRevenue - monthlyExpenses;
    const debtService = totalMonthlyDebtService;
    const isOwnerOccupied = store.occupancy_type === "owner_occupied";
    const sqft =
      resolveSquareFootage(
        store as { occupancy_type?: string | null },
        (options?.lease as { square_footage?: number | null }) ?? null,
        (options?.realEstate as {
          laundromat_square_footage?: number | null;
          total_square_footage?: number | null;
          monthly_rent_charged?: number | null;
        }) ?? null
      ) ?? 0;
    const equipResolved = resolveEquipmentFromInventory(options?.equipment ?? []);
    const machines = equipResolved.totalMachines;
    const avgAge = equipResolved.weightedAvgAge;
    const monthlyUtilitiesCost = num(store.monthly_utilities as number);
    const utilityRatio =
      monthlyRevenue > 0 && monthlyUtilitiesCost > 0
        ? (monthlyUtilitiesCost / monthlyRevenue) * 100
        : null;
    const leaseRent = num(options?.lease?.monthly_rent as number);
    const monthlyRent =
      resolveOccupancyRentDisplay(
        (options?.lease as { monthly_rent?: number | null }) ?? null,
        (options?.realEstate as { monthly_rent_charged?: number | null }) ?? null,
        isOwnerOccupied
      ) ?? leaseRent;
    const rentToRevenue =
      monthlyRevenue > 0 && monthlyRent > 0 ? ((monthlyRent * 12) / (monthlyRevenue * 12)) * 100 : null;
    const dscr =
      debtService > 0 ? calcDSCR(monthlyEbitda * 12, debtService * 12) : null;

    const emptyTtm: TtmMetrics = {
      ttmRevenue: monthlyRevenue * 12,
      ttmEbitda: monthlyEbitda * 12,
      ttmEbitdaMargin: monthlyRevenue > 0 ? (monthlyEbitda / monthlyRevenue) * 100 : 0,
      ttmDebtService: debtService * 12,
      ttmActualDebtService: 0,
      ttmNoi: monthlyEbitda * 12 - debtService * 12,
      dscr: dscr ?? null,
      monthsUsed: 0,
    };

    return {
      hasMonthlyFinancials: false,
      limitedData: true,
      records: [],
      ttmRecords: [],
      ttm: emptyTtm,
      utilitiesLookup,
      revenueBreakdown: [],
      expenseBreakdown: [],
      revenueTtmTotal: emptyTtm.ttmRevenue,
      expenseTtmTotal: monthlyExpenses * 12,
      ebitdaTtmTotal: emptyTtm.ttmEbitda,
      ebitdaMargin: emptyTtm.ttmEbitdaMargin,
      monthlyAverages: { revenue: monthlyRevenue, expenses: monthlyExpenses, ebitda: monthlyEbitda },
      ttmChartData: [],
      loans,
      totalMonthlyDebtService: debtService,
      totalOutstandingDebt,
      annualDebtService: debtService * 12,
      dscr,
      monthlyEbitda,
      surplusCashFlow: monthlyEbitda - debtService,
      waterKPI: computeWaterKpi(0, 0),
      benchmarkRows: buildBenchmarkRows({
        ttm: emptyTtm,
        monthlyEbitda,
        monthlyRevenue,
        utilityRatio,
        rentToRevenue,
        dscr,
        revenuePerSF: sqft > 0 ? (monthlyRevenue * 12) / sqft : null,
        revenuePerMachine: machines > 0 ? (monthlyRevenue * 12) / machines : null,
        avgEquipmentAge: avgAge,
      }),
      monthlyFinancialsForScore: [],
      monthlyUtilities,
      availableMonths: [],
      utilityReport: buildUtilityReportData({
        ttmRecords: [],
        utilitiesLookup,
        monthsUsed: 0,
        revenueTtmTotal: emptyTtm.ttmRevenue,
        waterKPI: computeWaterKpi(0, 0),
      }),
      selfServiceTtmTotal: 0,
      equipmentTurns: null,
    };
  }

  let records = enrichMonthlyRecords(
    sortRecordsDesc(financialsData as MonthlyFinancialRecord[]),
    utilitiesLookup
  );

  if (options?.endYear != null && options?.endMonth != null) {
    records = recordsThroughMonth(records, options.endYear, options.endMonth);
  }

  const ttmRecords =
    options?.endYear != null && options?.endMonth != null
      ? ttmRecordsEndingAt(
          enrichMonthlyRecords(
            sortRecordsDesc(financialsData as MonthlyFinancialRecord[]),
            utilitiesLookup
          ),
          options.endYear,
          options.endMonth
        )
      : records.slice(0, 12);

  const baseTtm = calcTtmMetrics(ttmRecords);
  const ttm = applyLoanDebtServiceToTtm(baseTtm, annualDebtService);
  const monthsUsed = ttm.monthsUsed;
  const camMonthly = options?.camMonthly ?? 0;

  const revenueBreakdown = buildRevenueBreakdown(ttmRecords, monthsUsed);
  const expenseBreakdown = buildExpenseBreakdown(ttmRecords, utilitiesLookup, monthsUsed, camMonthly);

  const expenseTtmTotal = ttmRecords.reduce((s, r) => s + r.totalExpenses, 0);
  const monthlyAverages = {
    revenue: toMonthlyAverage(ttm.ttmRevenue, monthsUsed),
    expenses: toMonthlyAverage(expenseTtmTotal, monthsUsed),
    ebitda: toMonthlyAverage(ttm.ttmEbitda, monthsUsed),
  };

  const waterMonthlyAverage = toMonthlyAverage(
    sumTtmUtilityField(ttmRecords, utilitiesLookup, "water"),
    monthsUsed
  );
  const selfServiceMonthlyAverage = toMonthlyAverage(
    sumTtmField(ttmRecords, "self_service_revenue"),
    monthsUsed
  );
  const waterKPI = computeWaterKpi(waterMonthlyAverage, selfServiceMonthlyAverage);

  const monthlyEbitda = monthlyAverages.ebitda;
  const dscr = ttm.dscr;

  const store = options?.store ?? {};
  const isOwnerOccupied = store.occupancy_type === "owner_occupied";
  const sqft =
    resolveSquareFootage(
      store as { occupancy_type?: string | null },
      (options?.lease as { square_footage?: number | null }) ?? null,
      (options?.realEstate as {
        laundromat_square_footage?: number | null;
        total_square_footage?: number | null;
        monthly_rent_charged?: number | null;
      }) ?? null
    ) ?? 0;
  const equipResolved = resolveEquipmentFromInventory(options?.equipment ?? []);
  const machines = equipResolved.totalMachines;
  const avgAge = equipResolved.weightedAvgAge;

  const ttmUtilitiesTotal = ttmRecords.reduce((sum, record) => {
    const utilityRecord = utilitiesLookup.get(monthKey(record.year, record.month));
    if (!utilityRecord) return sum + num(record.utilities);
    return (
      sum +
      UTILITY_IMPORT_FIELDS.reduce((s, f) => s + num(utilityRecord[f]), 0)
    );
  }, 0);
  const utilityRatio = ttm.ttmRevenue > 0 ? (ttmUtilitiesTotal / ttm.ttmRevenue) * 100 : null;

  const leaseRent = num(options?.lease?.monthly_rent as number);
  const monthlyRent =
    resolveOccupancyRentDisplay(
      (options?.lease as { monthly_rent?: number | null }) ?? null,
      (options?.realEstate as { monthly_rent_charged?: number | null }) ?? null,
      isOwnerOccupied
    ) ?? leaseRent;
  const annualRent = resolveAnnualRent(ttmRecords, monthsUsed, leaseRent);
  const rentToRevenue =
    ttm.ttmRevenue > 0 && annualRent > 0 ? (annualRent / ttm.ttmRevenue) * 100 : null;

  const ttmChartData = buildTtmChartData(ttmRecords);
  if (process.env.NODE_ENV !== "production") {
    console.log("[fetchReportFinancialContext] TTM records:", ttmRecords.length, "monthsUsed:", monthsUsed);
    console.log("[fetchReportFinancialContext] TTM revenue total:", ttm.ttmRevenue);
    console.log("[fetchReportFinancialContext] chartData points:", ttmChartData.length, ttmChartData);
  }

  const selfServiceTtmTotal = sumTtmField(ttmRecords, "self_service_revenue");
  const dryerRevenuePct =
    store.dryer_revenue_pct != null ? Number(store.dryer_revenue_pct) : DEFAULT_DRYER_REVENUE_PCT;
  const equipmentTurns =
    selfServiceTtmTotal > 0 && (options?.equipment ?? []).length > 0
      ? computeTurnsPerDay(options!.equipment!, selfServiceTtmTotal, dryerRevenuePct)
      : null;

  return {
    hasMonthlyFinancials: true,
    limitedData: monthsUsed < 6,
    records,
    ttmRecords,
    ttm,
    utilitiesLookup,
    revenueBreakdown,
    expenseBreakdown,
    revenueTtmTotal: ttm.ttmRevenue,
    expenseTtmTotal,
    ebitdaTtmTotal: ttm.ttmEbitda,
    ebitdaMargin: ttm.ttmEbitdaMargin,
    monthlyAverages,
    ttmChartData,
    loans,
    totalMonthlyDebtService,
    totalOutstandingDebt,
    annualDebtService,
    dscr,
    monthlyEbitda,
    surplusCashFlow: monthlyEbitda - totalMonthlyDebtService,
    waterKPI,
    benchmarkRows: buildBenchmarkRows({
      ttm,
      monthlyEbitda,
      monthlyRevenue: monthlyAverages.revenue,
      utilityRatio,
      rentToRevenue,
      dscr,
      revenuePerSF: sqft > 0 ? ttm.ttmRevenue / sqft : null,
      revenuePerMachine: machines > 0 ? ttm.ttmRevenue / machines : null,
      avgEquipmentAge: avgAge,
    }),
    monthlyFinancialsForScore,
    monthlyUtilities,
    availableMonths,
    utilityReport: buildUtilityReportData({
      ttmRecords,
      utilitiesLookup,
      monthsUsed,
      revenueTtmTotal: ttm.ttmRevenue,
      waterKPI,
    }),
    selfServiceTtmTotal,
    equipmentTurns,
  };
}

export function getUtilityBreakdownForMonth(
  record: CalculatedMonthly | null,
  utilitiesLookup: Map<string, MonthlyUtilityRecord>
): { label: string; amount: number }[] {
  if (!record) return [];
  const utilityRecord = utilitiesLookup.get(monthKey(record.year, record.month));
  const fields: { field: UtilityImportField; label: string }[] = [
    { field: "water", label: "Water" },
    { field: "gas", label: "Gas" },
    { field: "electric", label: "Electric" },
    { field: "sewer", label: "Sewer" },
    { field: "trash", label: "Trash" },
    { field: "internet", label: "Internet" },
  ];
  return fields.map(({ field, label }) => ({
    label,
    amount: utilityRecord ? num(utilityRecord[field]) : 0,
  }));
}
