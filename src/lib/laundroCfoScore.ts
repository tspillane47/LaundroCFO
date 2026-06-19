import { benchmarks } from "@/lib/data";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { utilityRecordTotal, type MonthlyUtilityRecord } from "@/lib/financials";

const NETWORK_BENCHMARK_THRESHOLD = 15;

const BENCHMARK = {
  ebitdaMargin: benchmarks.find((b) => b.metric === "EBITDA Margin")!,
  utilityRatio: benchmarks.find((b) => b.metric === "Utility Ratio")!,
  revenuePerMachine: benchmarks.find((b) => b.metric === "Revenue per Machine")!,
};

export type LaundroCfoStoreInput = {
  monthly_revenue: number | null;
  monthly_expenses: number | null;
  annual_debt_service: number | null;
  square_footage: number | null;
  washers: number | null;
  dryers: number | null;
  avg_machine_age: number | null;
  monthly_rent: number | null;
  monthly_utilities: number | null;
  occupancy_type: string | null;
};

export type LaundroCfoFinancialsInput = {
  ttmMonthsUsed: number;
  ttmRevenue: number;
  ttmUtilities: number;
};

export type LaundroCfoLeaseInput = {
  lease_end_date: string | null;
  monthly_rent: number | null;
} | null;

export type LaundroCfoUtilitiesInput = {
  records: MonthlyUtilityRecord[];
};

export type LaundroCfoScoreCategory = {
  score: number;
  max: number;
  breakdown: Record<string, number>;
};

export type LaundroCfoScoreResult = {
  total: number;
  grade: string;
  categories: {
    financialPerformance: LaundroCfoScoreCategory;
    debtCoverage: LaundroCfoScoreCategory;
    assetQuality: LaundroCfoScoreCategory;
    profileCompleteness: LaundroCfoScoreCategory;
  };
  improvementTips: string[];
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(String(value).split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearsRemaining(endDate: string | null | undefined): number | null {
  const end = parseDate(endDate);
  if (!end) return null;
  return Math.max(0, (end.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000));
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveScoreUtilityRatio(
  financials: LaundroCfoFinancialsInput,
  monthlyRevenue: number | null,
  monthlyUtilities: number | null
): number | null {
  if (financials.ttmRevenue > 0 && financials.ttmMonthsUsed > 0) {
    return (financials.ttmUtilities / financials.ttmRevenue) * 100;
  }
  if (monthlyRevenue != null && monthlyRevenue > 0 && monthlyUtilities != null && monthlyUtilities > 0) {
    return (monthlyUtilities / monthlyRevenue) * 100;
  }
  return null;
}

export function resolveOccupancyRent(
  store: LaundroCfoStoreInput,
  lease: LaundroCfoLeaseInput,
  realEstateMonthlyRent: number | null
): number | null {
  if (lease?.monthly_rent != null && lease.monthly_rent > 0) return lease.monthly_rent;
  if (realEstateMonthlyRent != null && realEstateMonthlyRent > 0) return realEstateMonthlyRent;
  if (store.monthly_rent != null && store.monthly_rent > 0) return store.monthly_rent;
  return null;
}

export function buildLaundroCfoFinancialsInput(
  monthlyFinancials: { revenue?: number | null; utilities?: number | null }[],
  ttmMonthsUsedOverride?: number
): LaundroCfoFinancialsInput {
  const records = monthlyFinancials.slice(0, 12);
  const ttmRevenue = records.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const ttmUtilities = records.reduce((s, r) => s + (Number(r.utilities) || 0), 0);
  const ttmMonthsUsed =
    ttmMonthsUsedOverride != null && ttmMonthsUsedOverride > 0
      ? ttmMonthsUsedOverride
      : records.length;

  return { ttmMonthsUsed, ttmRevenue, ttmUtilities };
}

export function buildLaundroCfoStoreInput(store: Record<string, unknown>): LaundroCfoStoreInput {
  return {
    monthly_revenue: num(store.monthly_revenue),
    monthly_expenses: num(store.monthly_expenses),
    annual_debt_service: num(store.annual_debt_service),
    square_footage: num(store.square_footage),
    washers: num(store.washers),
    dryers: num(store.dryers),
    avg_machine_age: num(store.avg_machine_age),
    monthly_rent: num(store.monthly_rent),
    monthly_utilities: num(store.monthly_utilities),
    occupancy_type: store.occupancy_type != null ? String(store.occupancy_type) : null,
  };
}

export function buildLaundroCfoLeaseInput(
  lease: Record<string, unknown> | null | undefined
): LaundroCfoLeaseInput {
  if (!lease) return null;
  return {
    lease_end_date: lease.lease_end_date != null ? String(lease.lease_end_date) : null,
    monthly_rent: num(lease.monthly_rent),
  };
}

function hasUtilityBreakdown(records: MonthlyUtilityRecord[]): boolean {
  return records.some((r) => utilityRecordTotal(r) > 0);
}

function scoreEbitdaMargin(margin: number | null): number {
  if (margin == null) return 0;
  const { top25, median, bottom25 } = BENCHMARK.ebitdaMargin;
  if (margin >= top25) return 15;
  if (margin >= median) return 10;
  if (margin >= bottom25) return 5;
  return 0;
}

function scoreUtilityRatio(ratio: number | null): number {
  if (ratio == null) return 0;
  const { top25, median, bottom25 } = BENCHMARK.utilityRatio;
  if (ratio <= top25) return 15;
  if (ratio <= median) return 10;
  if (ratio <= bottom25) return 5;
  return 0;
}

function scoreRevenuePerMachine(value: number | null): number {
  if (value == null) return 0;
  const { top25, median, bottom25 } = BENCHMARK.revenuePerMachine;
  if (value >= top25) return 10;
  if (value >= median) return 7;
  if (value >= bottom25) return 3;
  return 0;
}

function scoreDscr(dscr: number | null, annualDebtService: number | null): number {
  if (annualDebtService == null || annualDebtService === 0) return 13;
  if (dscr == null) return 0;
  if (dscr >= 2.0) return 15;
  if (dscr >= 1.5) return 12;
  if (dscr >= 1.25) return 8;
  if (dscr >= 1.0) return 3;
  return 0;
}

function scoreRentToRevenue(ratio: number | null): number {
  if (ratio == null) return 0;
  if (ratio <= 10) return 5;
  if (ratio <= 15) return 3;
  if (ratio <= 20) return 1;
  return 0;
}

function scoreEquipmentAge(age: number | null): number {
  if (age == null) return 0;
  if (age <= 5) return 10;
  if (age <= 9) return 7;
  if (age <= 14) return 3;
  return 0;
}

function scoreLeaseYears(years: number | null): number {
  if (years == null) return 0;
  if (years >= 10) return 5;
  if (years >= 5) return 3;
  if (years >= 2) return 1;
  return 0;
}

function scoreEquipmentGrade(grade: "A" | "B" | "C" | "D" | null): number {
  if (!grade) return 0;
  if (grade === "A") return 5;
  if (grade === "B") return 3;
  if (grade === "C") return 1;
  return 0;
}

export function scoreToLetterGrade(total: number): string {
  if (total >= 97) return "A+";
  if (total >= 93) return "A";
  if (total >= 90) return "A-";
  if (total >= 87) return "B+";
  if (total >= 83) return "B";
  if (total >= 80) return "B-";
  if (total >= 77) return "C+";
  if (total >= 73) return "C";
  if (total >= 70) return "C-";
  if (total >= 67) return "D+";
  if (total >= 63) return "D";
  if (total >= 60) return "D-";
  return "F";
}

export function scoreArcColor(total: number): string {
  if (total >= 80) return "var(--text-success)";
  if (total >= 60) return "var(--text-warning)";
  return "var(--text-danger)";
}

function buildImprovementTips(
  categories: LaundroCfoScoreResult["categories"]
): string[] {
  const tipsByCategory: Record<string, string[]> = {
    financialPerformance: [
      "Improve EBITDA margin by reviewing payroll and supply costs.",
      "Reduce utility ratio — top operators stay below 14% of revenue.",
      "Boost revenue per machine with WDF, P&D, or card pricing.",
    ],
    debtCoverage: [
      "Raise DSCR above 1.25× to meet lender minimums.",
      "Lower rent-to-revenue — aim for 10% or below.",
      "Enter annual debt service or confirm debt-free status in settings.",
    ],
    assetQuality: [
      "Plan equipment replacement — fleet age above 9 years drags value.",
      "Extend lease control or exercise renewal options before expiration.",
      "Add equipment inventory to unlock an accurate quality grade.",
    ],
    profileCompleteness: [
      "Add at least 6 months of financials to unlock performance scoring.",
      "Complete your store profile — missing fields cap your total score.",
      "Enter utility breakdown and lease details for full credit.",
    ],
  };

  const ranked = (
    Object.entries(categories) as [keyof typeof categories, LaundroCfoScoreCategory][]
  )
    .map(([key, cat]) => ({
      key,
      pct: cat.max > 0 ? cat.score / cat.max : 1,
    }))
    .sort((a, b) => a.pct - b.pct);

  const tips: string[] = [];
  for (const { key } of ranked) {
    for (const tip of tipsByCategory[key]) {
      if (tips.length >= 3) break;
      if (!tips.includes(tip)) tips.push(tip);
    }
    if (tips.length >= 3) break;
  }

  return tips.slice(0, 3);
}

export function computeLaundroCfoScore(
  store: LaundroCfoStoreInput,
  financials: LaundroCfoFinancialsInput,
  equipment: EquipmentRecord[],
  lease: LaundroCfoLeaseInput,
  utilities: LaundroCfoUtilitiesInput,
  options?: { realEstateMonthlyRent?: number | null }
): LaundroCfoScoreResult {
  const monthlyRevenue = store.monthly_revenue;
  const monthlyExpenses = store.monthly_expenses;
  const hasFinancials = monthlyRevenue != null && monthlyRevenue > 0;

  const ebitdaMargin =
    hasFinancials && monthlyExpenses != null
      ? ((monthlyRevenue - monthlyExpenses) / monthlyRevenue) * 100
      : null;

  const utilityRatio = resolveScoreUtilityRatio(
    financials,
    monthlyRevenue,
    store.monthly_utilities
  );

  const washers = store.washers ?? 0;
  const dryers = store.dryers ?? 0;
  const machines = washers + dryers;
  const annualRevenue = hasFinancials ? monthlyRevenue * 12 : null;
  const revenuePerMachine =
    annualRevenue != null && machines > 0 ? annualRevenue / machines : null;

  const annualEbitda =
    hasFinancials && monthlyExpenses != null
      ? (monthlyRevenue - monthlyExpenses) * 12
      : null;
  const debtService = store.annual_debt_service;
  const dscr =
    debtService != null && debtService > 0 && annualEbitda != null && annualEbitda > 0
      ? annualEbitda / debtService
      : null;

  const monthlyRent = resolveOccupancyRent(
    store,
    lease,
    options?.realEstateMonthlyRent ?? null
  );
  const rentToRevenue =
    annualRevenue != null && monthlyRent != null && monthlyRent > 0
      ? ((monthlyRent * 12) / annualRevenue) * 100
      : null;

  const equipMetrics = computeEquipmentMetrics(equipment);
  const avgEquipmentAge =
    equipMetrics.totalMachines > 0
      ? equipMetrics.weightedAvgAge
      : store.avg_machine_age;
  const equipmentGrade = equipMetrics.totalMachines > 0 ? equipMetrics.grade : null;

  const leaseYearsRemaining = calcYearsRemaining(lease?.lease_end_date ?? null);

  const ebitdaPts = scoreEbitdaMargin(ebitdaMargin);
  const utilityPts = scoreUtilityRatio(utilityRatio);
  const revMachinePts = scoreRevenuePerMachine(revenuePerMachine);
  const financialPerformance = {
    score: ebitdaPts + utilityPts + revMachinePts,
    max: 40,
    breakdown: {
      ebitdaMargin: ebitdaPts,
      utilityRatio: utilityPts,
      revenuePerMachine: revMachinePts,
    },
  };

  const dscrPts = scoreDscr(dscr, debtService);
  const rentPts = scoreRentToRevenue(rentToRevenue);
  const debtCoverage = {
    score: dscrPts + rentPts,
    max: 20,
    breakdown: {
      dscr: dscrPts,
      rentToRevenue: rentPts,
    },
  };

  const agePts = scoreEquipmentAge(avgEquipmentAge);
  const leasePts = scoreLeaseYears(leaseYearsRemaining);
  const gradePts = scoreEquipmentGrade(equipmentGrade);
  const assetQuality = {
    score: agePts + leasePts + gradePts,
    max: 20,
    breakdown: {
      equipmentAge: agePts,
      leaseYearsRemaining: leasePts,
      equipmentGrade: gradePts,
    },
  };

  const financialDataPts =
    hasFinancials && financials.ttmMonthsUsed >= 6 ? 6 : 0;
  const equipmentDataPts = equipment.length > 0 ? 4 : 0;
  const leaseDataPts = lease?.lease_end_date ? 3 : 0;
  const sqftPts = store.square_footage != null && store.square_footage > 0 ? 3 : 0;
  const debtDataPts = debtService != null ? 2 : 0;
  const utilityBreakdownPts = hasUtilityBreakdown(utilities.records) ? 2 : 0;

  const profileCompleteness = {
    score:
      financialDataPts +
      equipmentDataPts +
      leaseDataPts +
      sqftPts +
      debtDataPts +
      utilityBreakdownPts,
    max: 20,
    breakdown: {
      financialData: financialDataPts,
      equipmentInventory: equipmentDataPts,
      leaseData: leaseDataPts,
      squareFootage: sqftPts,
      debtData: debtDataPts,
      utilityBreakdown: utilityBreakdownPts,
    },
  };

  const categories = {
    financialPerformance,
    debtCoverage,
    assetQuality,
    profileCompleteness,
  };

  const total = Math.round(
    financialPerformance.score +
      debtCoverage.score +
      assetQuality.score +
      profileCompleteness.score
  );

  return {
    total: Math.min(100, Math.max(0, total)),
    grade: scoreToLetterGrade(total),
    categories,
    improvementTips: buildImprovementTips(categories),
  };
}

export function formatNetworkScoreHint(
  contributorCount: number | null,
  networkAvgScore: number | null = null
): string {
  if (contributorCount != null && contributorCount >= NETWORK_BENCHMARK_THRESHOLD && networkAvgScore != null) {
    return `LaundroCFO Network: avg ${networkAvgScore}`;
  }
  return "LaundroCFO Network: avg score coming soon";
}

export function computeLaundroCfoScoreFromRaw(args: {
  store: Record<string, unknown>;
  equipment: EquipmentRecord[];
  lease: Record<string, unknown> | null;
  realEstate: Record<string, unknown> | null;
  monthlyFinancials: { revenue?: number | null; utilities?: number | null }[];
  monthlyUtilities: MonthlyUtilityRecord[];
  ttmMonthsUsed?: number;
}): LaundroCfoScoreResult {
  return computeLaundroCfoScore(
    buildLaundroCfoStoreInput(args.store),
    buildLaundroCfoFinancialsInput(args.monthlyFinancials, args.ttmMonthsUsed),
    args.equipment,
    buildLaundroCfoLeaseInput(args.lease),
    { records: args.monthlyUtilities },
    {
      realEstateMonthlyRent: num(args.realEstate?.monthly_rent_charged),
    }
  );
}
