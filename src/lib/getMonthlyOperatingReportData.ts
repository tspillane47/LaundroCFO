import { createClient } from "@/lib/supabase";
import { getStoreValuation, type StoreValuationResult } from "@/lib/getStoreValuation";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { calcRentToRevenue, calcUtilityRatio, calcEbitdaMargin } from "@/lib/calculations";
import {
  fetchReportFinancialContext,
  formatReportMonth,
  getUtilityBreakdownForMonth,
  priorMonth,
  recordsThroughMonth,
  type ReportFinancialContext,
} from "@/lib/reportFinancials";
import type { CalculatedMonthly } from "@/lib/financials";
import { MONTH_NAMES } from "@/lib/financials";

export type PlLineComparison = {
  label: string;
  current: number;
  prior: number;
  changeDollar: number;
  changePct: number | null;
  ytd: number;
};

export type MonthlyOperatingReportData = {
  year: number;
  month: number;
  reportMonthLabel: string;
  financial: ReportFinancialContext;
  valuation: StoreValuationResult;
  selectedRecord: CalculatedMonthly | null;
  priorRecord: CalculatedMonthly | null;
  revenueLines: PlLineComparison[];
  expenseLines: PlLineComparison[];
  summary: {
    revenue: PlLineComparison;
    expenses: PlLineComparison;
    ebitda: PlLineComparison;
    ebitdaMargin: number;
    priorEbitdaMargin: number;
  };
  ytdTotals: { revenue: number; expenses: number; ebitda: number };
  utilityLines: { label: string; amount: number; pctOfRevenue: number }[];
  keyMetrics: {
    ebitdaMargin: number;
    dscr: number | null;
    rentToRevenue: number | null;
    utilityRatio: number | null;
    revenuePerMachine: number | null;
  };
};

function num(value: number | null | undefined): number {
  return value ?? 0;
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return ((current - prior) / prior) * 100;
}

function buildPlLine(
  label: string,
  current: number,
  prior: number,
  ytd: number
): PlLineComparison {
  return {
    label,
    current,
    prior,
    changeDollar: current - prior,
    changePct: pctChange(current, prior),
    ytd,
  };
}

function sumYtd(records: CalculatedMonthly[], field: keyof CalculatedMonthly): number {
  return records.reduce((s, r) => s + num(r[field] as number), 0);
}

function buildRevenueLines(
  selected: CalculatedMonthly | null,
  prior: CalculatedMonthly | null,
  ytdRecords: CalculatedMonthly[]
): PlLineComparison[] {
  const fields: { field: keyof CalculatedMonthly; label: string }[] = [
    { field: "self_service_revenue", label: "Self-Service" },
    { field: "wdf_revenue", label: "WDF" },
    { field: "commercial_revenue", label: "Commercial" },
    { field: "vending_revenue", label: "Vending" },
    { field: "other_revenue", label: "Other" },
  ];

  return fields.map(({ field, label }) =>
    buildPlLine(
      label,
      selected ? num(selected[field] as number) : 0,
      prior ? num(prior[field] as number) : 0,
      sumYtd(ytdRecords, field)
    )
  );
}

function buildExpenseLines(
  selected: CalculatedMonthly | null,
  prior: CalculatedMonthly | null,
  ytdRecords: CalculatedMonthly[],
  financial: ReportFinancialContext,
  camMonthly: number
): PlLineComparison[] {
  const utilityAmount = (record: CalculatedMonthly | null, field: string) => {
    if (!record) return 0;
    const utilityRecord = financial.utilitiesLookup.get(`${record.year}-${record.month}`);
    if (!utilityRecord) return 0;
    return num(utilityRecord[field as keyof typeof utilityRecord] as number);
  };

  const plField = (record: CalculatedMonthly | null, field: keyof CalculatedMonthly) =>
    record ? num(record[field] as number) : 0;

  const defs: { label: string; current: number; prior: number; ytd: number }[] = [
    { label: "Water", current: utilityAmount(selected, "water"), prior: utilityAmount(prior, "water"), ytd: ytdRecords.reduce((s, r) => s + utilityAmount(r, "water"), 0) },
    { label: "Gas", current: utilityAmount(selected, "gas"), prior: utilityAmount(prior, "gas"), ytd: ytdRecords.reduce((s, r) => s + utilityAmount(r, "gas"), 0) },
    { label: "Electric", current: utilityAmount(selected, "electric"), prior: utilityAmount(prior, "electric"), ytd: ytdRecords.reduce((s, r) => s + utilityAmount(r, "electric"), 0) },
    { label: "Trash", current: utilityAmount(selected, "trash"), prior: utilityAmount(prior, "trash"), ytd: ytdRecords.reduce((s, r) => s + utilityAmount(r, "trash"), 0) },
    { label: "Rent", current: plField(selected, "rent"), prior: plField(prior, "rent"), ytd: sumYtd(ytdRecords, "rent") },
    { label: "CAM", current: camMonthly, prior: camMonthly, ytd: camMonthly * ytdRecords.length },
    { label: "Payroll", current: plField(selected, "payroll"), prior: plField(prior, "payroll"), ytd: sumYtd(ytdRecords, "payroll") },
    { label: "Repairs", current: plField(selected, "repairs_maintenance"), prior: plField(prior, "repairs_maintenance"), ytd: sumYtd(ytdRecords, "repairs_maintenance") },
    { label: "Insurance", current: plField(selected, "insurance_expense"), prior: plField(prior, "insurance_expense"), ytd: sumYtd(ytdRecords, "insurance_expense") },
    { label: "Supplies", current: plField(selected, "supplies"), prior: plField(prior, "supplies"), ytd: sumYtd(ytdRecords, "supplies") },
    { label: "Advertising", current: plField(selected, "marketing"), prior: plField(prior, "marketing"), ytd: sumYtd(ytdRecords, "marketing") },
    { label: "Professional Fees", current: plField(selected, "professional_fees"), prior: plField(prior, "professional_fees"), ytd: sumYtd(ytdRecords, "professional_fees") },
    { label: "Bank Fees", current: plField(selected, "bank_charges"), prior: plField(prior, "bank_charges"), ytd: sumYtd(ytdRecords, "bank_charges") },
    { label: "Credit Card Processing", current: plField(selected, "cc_processing_fees"), prior: plField(prior, "cc_processing_fees"), ytd: sumYtd(ytdRecords, "cc_processing_fees") },
    {
      label: "Other",
      current: plField(selected, "other_expenses") + plField(selected, "software_subscriptions"),
      prior: plField(prior, "other_expenses") + plField(prior, "software_subscriptions"),
      ytd: sumYtd(ytdRecords, "other_expenses") + sumYtd(ytdRecords, "software_subscriptions"),
    },
  ];

  return defs
    .filter((d) => d.current > 0 || d.prior > 0 || d.ytd > 0)
    .map((d) => buildPlLine(d.label, d.current, d.prior, d.ytd));
}

export async function getMonthlyOperatingReportData(args: {
  storeId: string;
  year: number;
  month: number;
  store?: Record<string, unknown>;
  equipment?: EquipmentRecord[];
  lease?: Record<string, unknown> | null;
}): Promise<MonthlyOperatingReportData> {
  const supabase = createClient();
  const camMonthly = args.lease?.cam_charges != null ? Number(args.lease.cam_charges) : 0;

  const [financial, valuation] = await Promise.all([
    fetchReportFinancialContext(supabase, args.storeId, {
      endYear: args.year,
      endMonth: args.month,
      camMonthly,
      store: args.store,
      equipment: args.equipment,
      lease: args.lease,
    }),
    getStoreValuation(args.storeId),
  ]);

  const allRecords = financial.records;
  const selectedRecord =
    allRecords.find((r) => r.year === args.year && r.month === args.month) ?? null;
  const prior = priorMonth(args.year, args.month);
  const priorRecord =
    allRecords.find((r) => r.year === prior.year && r.month === prior.month) ?? null;

  const ytdRecords = recordsThroughMonth(allRecords, args.year, args.month).filter(
    (r) => r.year === args.year
  );

  const revenueLines = buildRevenueLines(selectedRecord, priorRecord, ytdRecords);
  const expenseLines = buildExpenseLines(
    selectedRecord,
    priorRecord,
    ytdRecords,
    financial,
    camMonthly
  );

  const currentRevenue = selectedRecord?.revenue ?? 0;
  const priorRevenue = priorRecord?.revenue ?? 0;
  const currentExpenses = selectedRecord?.totalExpenses ?? 0;
  const priorExpenses = priorRecord?.totalExpenses ?? 0;
  const currentEbitda = selectedRecord?.ebitda ?? 0;
  const priorEbitda = priorRecord?.ebitda ?? 0;

  const ytdTotals = {
    revenue: sumYtd(ytdRecords, "revenue"),
    expenses: ytdRecords.reduce((s, r) => s + r.totalExpenses, 0),
    ebitda: ytdRecords.reduce((s, r) => s + r.ebitda, 0),
  };

  const utilityBreakdown = getUtilityBreakdownForMonth(selectedRecord, financial.utilitiesLookup);
  const utilityLines = utilityBreakdown.map((u) => ({
    ...u,
    pctOfRevenue: currentRevenue > 0 ? (u.amount / currentRevenue) * 100 : 0,
  }));

  const store = args.store ?? valuation.store;
  const equipMetrics = computeEquipmentMetrics(
    args.equipment ?? (valuation.context.equipment as EquipmentRecord[])
  );
  const machines =
    equipMetrics.totalMachines > 0
      ? equipMetrics.totalMachines
      : num(store.washers as number) + num(store.dryers as number);
  const monthlyRent = num(args.lease?.monthly_rent as number) || num(store.monthly_rent as number);

  const annualRevenue = currentRevenue * 12;
  const annualEbitda = currentEbitda * 12;
  const annualUtilities = utilityBreakdown.reduce((s, u) => s + u.amount, 0) * 12;

  return {
    year: args.year,
    month: args.month,
    reportMonthLabel: formatReportMonth(args.year, args.month),
    financial,
    valuation,
    selectedRecord,
    priorRecord,
    revenueLines,
    expenseLines,
    summary: {
      revenue: buildPlLine("Total Revenue", currentRevenue, priorRevenue, ytdTotals.revenue),
      expenses: buildPlLine("Total Expenses", currentExpenses, priorExpenses, ytdTotals.expenses),
      ebitda: buildPlLine("EBITDA", currentEbitda, priorEbitda, ytdTotals.ebitda),
      ebitdaMargin: calcEbitdaMargin(currentEbitda, currentRevenue),
      priorEbitdaMargin: calcEbitdaMargin(priorEbitda, priorRevenue),
    },
    ytdTotals,
    utilityLines,
    keyMetrics: {
      ebitdaMargin: calcEbitdaMargin(currentEbitda, currentRevenue),
      dscr: financial.dscr,
      rentToRevenue: calcRentToRevenue(monthlyRent * 12, annualRevenue),
      utilityRatio: calcUtilityRatio(annualUtilities, annualRevenue),
      revenuePerMachine: machines > 0 ? annualRevenue / machines : null,
    },
  };
}

export function getLatestFinancialMonth(
  months: { year: number; month: number }[]
): { year: number; month: number } | null {
  if (months.length === 0) return null;
  const sorted = [...months].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
  return sorted[0];
}

export function monthSelectLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
