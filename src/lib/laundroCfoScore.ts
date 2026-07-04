import { calcEbitdaMargin, calcRevenuePerSF, calcUtilityRatio } from "@/lib/calculations";
import { benchmarks } from "@/lib/data";
import { computeStoreDscr } from "@/lib/dscr";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { resolveStoreFinancials } from "@/lib/getStoreValuation";
import { utilityRecordTotal, type MonthlyUtilityRecord } from "@/lib/financials";

const NETWORK_BENCHMARK_THRESHOLD = 15;

const METRIC_WEIGHTS = {
  ebitdaMargin: 0.3,
  dscr: 0.2,
  revenuePerSF: 0.15,
  equipmentScore: 0.2,
  utilityRatio: 0.15,
} as const;

type MetricKey = keyof typeof METRIC_WEIGHTS;

/** Tier points (0–100) assumed for median industry performance when projecting potential score. */
const MEDIAN_TIER_POINTS: Record<MetricKey, number> = {
  ebitdaMargin: 70,
  dscr: 85,
  revenuePerSF: 70,
  equipmentScore: 80,
  utilityRatio: 60,
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
  ttmEbitda: number;
};

export type LaundroCfoLeaseInput = {
  lease_end_date: string | null;
  monthly_rent: number | null;
} | null;

export type LaundroCfoUtilitiesInput = {
  records: MonthlyUtilityRecord[];
};

export type LaundroCfoScoreMetric = {
  label: string;
  points: number | null;
  weight: number;
  included: boolean;
  breakdownValue: string | null;
};

export type LaundroCfoScoreResult = {
  total: number;
  grade: string;
  potentialScore: number | null;
  metricsIncluded: number;
  metricsTotal: number;
  metrics: Record<MetricKey, LaundroCfoScoreMetric>;
  /** @deprecated Legacy shape for gradual migration — mirrors `metrics` entries. */
  categories: {
    financialPerformance: { score: number; max: number; breakdown: Record<string, number> };
    debtCoverage: { score: number; max: number; breakdown: Record<string, number> };
    assetQuality: { score: number; max: number; breakdown: Record<string, number> };
    profileCompleteness: { score: number; max: number; breakdown: Record<string, number> };
  };
  improvementTips: string[];
};

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
  if (financials.ttmRevenue > 0 && financials.ttmMonthsUsed > 0 && financials.ttmUtilities > 0) {
    return calcUtilityRatio(financials.ttmUtilities, financials.ttmRevenue);
  }
  if (monthlyRevenue != null && monthlyRevenue > 0 && monthlyUtilities != null && monthlyUtilities > 0) {
    return calcUtilityRatio(monthlyUtilities * 12, monthlyRevenue * 12);
  }
  return null;
}

export function resolveOccupancyRent(
  _store: LaundroCfoStoreInput,
  lease: LaundroCfoLeaseInput,
  realEstateMonthlyRent: number | null
): number | null {
  if (lease?.monthly_rent != null && lease.monthly_rent > 0) return lease.monthly_rent;
  if (realEstateMonthlyRent != null && realEstateMonthlyRent > 0) return realEstateMonthlyRent;
  return null;
}

export function buildLaundroCfoFinancialsInput(
  monthlyFinancials: { revenue?: number | null; utilities?: number | null; ebitda?: number | null }[],
  ttmMonthsUsedOverride?: number
): LaundroCfoFinancialsInput {
  const records = monthlyFinancials.slice(0, 12);
  const ttmRevenue = records.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const ttmUtilities = records.reduce((s, r) => s + (Number(r.utilities) || 0), 0);
  const ttmEbitda = records.reduce((s, r) => s + (Number(r.ebitda) || 0), 0);
  const ttmMonthsUsed =
    ttmMonthsUsedOverride != null && ttmMonthsUsedOverride > 0
      ? ttmMonthsUsedOverride
      : records.length;

  return { ttmMonthsUsed, ttmRevenue, ttmUtilities, ttmEbitda };
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

function hasUtilityData(
  utilityRatio: number | null,
  financials: LaundroCfoFinancialsInput,
  monthlyUtilities: number | null,
  utilityRecords: MonthlyUtilityRecord[]
): boolean {
  return (
    utilityRatio != null ||
    (financials.ttmUtilities > 0 && financials.ttmMonthsUsed > 0) ||
    (monthlyUtilities != null && monthlyUtilities > 0) ||
    hasUtilityBreakdown(utilityRecords)
  );
}

export function scoreEbitdaMarginPoints(margin: number | null): number | null {
  if (margin == null) return null;
  if (margin >= 30) return 100;
  if (margin >= 25) return 85;
  if (margin >= 20) return 70;
  if (margin >= 15) return 55;
  if (margin >= 10) return 40;
  return 20;
}

export function scoreDscrPoints(dscr: number | null, annualDebtService: number | null): number | null {
  if (annualDebtService == null || annualDebtService <= 0) return null;
  if (dscr == null) return null;
  if (dscr >= 2.0) return 100;
  if (dscr >= 1.5) return 85;
  if (dscr >= 1.25) return 65;
  if (dscr >= 1.0) return 40;
  return 10;
}

export function scoreRevenuePerSfPoints(revenuePerSf: number | null): number | null {
  if (revenuePerSf == null) return null;
  if (revenuePerSf >= 180) return 100;
  if (revenuePerSf >= 150) return 85;
  if (revenuePerSf >= 120) return 70;
  if (revenuePerSf >= 90) return 50;
  return 30;
}

export function scoreEquipmentPoints(equipmentScore: number | null): number | null {
  if (equipmentScore == null) return null;
  if (equipmentScore >= 90) return 100;
  if (equipmentScore >= 75) return 80;
  if (equipmentScore >= 60) return 60;
  if (equipmentScore >= 45) return 40;
  return 20;
}

export function scoreUtilityRatioPoints(ratio: number | null): number | null {
  if (ratio == null) return null;
  if (ratio < 14) return 100;
  if (ratio <= 17) return 80;
  if (ratio <= 20) return 60;
  if (ratio <= 24) return 35;
  return 10;
}

function computeWeightedScore(metricPoints: Partial<Record<MetricKey, number | null>>): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const key of Object.keys(METRIC_WEIGHTS) as MetricKey[]) {
    const points = metricPoints[key];
    if (points != null) {
      weightedSum += points * METRIC_WEIGHTS[key];
      totalWeight += METRIC_WEIGHTS[key];
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}

export function scoreToLetterGrade(total: number): string {
  if (total >= 85) return "A";
  if (total >= 70) return "B";
  if (total >= 55) return "C";
  if (total >= 40) return "D";
  return "F";
}

export function scoreArcColor(total: number): string {
  if (total >= 85) return "var(--text-success)";
  if (total >= 55) return "var(--text-warning)";
  return "var(--text-danger)";
}

function buildLegacyCategories(metrics: Record<MetricKey, LaundroCfoScoreMetric>): LaundroCfoScoreResult["categories"] {
  const weightToMax = (key: MetricKey) => Math.round(METRIC_WEIGHTS[key] * 100);

  const ebitda = metrics.ebitdaMargin;
  const utility = metrics.utilityRatio;
  const dscr = metrics.dscr;
  const revSf = metrics.revenuePerSF;
  const equip = metrics.equipmentScore;

  const financialPerformanceScore =
    (ebitda.included ? Math.round((ebitda.points ?? 0) * METRIC_WEIGHTS.ebitdaMargin) : 0) +
    (utility.included ? Math.round((utility.points ?? 0) * METRIC_WEIGHTS.utilityRatio) : 0);
  const financialPerformanceMax =
    (ebitda.included ? weightToMax("ebitdaMargin") : 0) +
    (utility.included ? weightToMax("utilityRatio") : 0);

  const debtCoverageScore = dscr.included ? Math.round((dscr.points ?? 0) * METRIC_WEIGHTS.dscr) : 0;
  const debtCoverageMax = dscr.included ? weightToMax("dscr") : 0;

  const assetQualityScore =
    (revSf.included ? Math.round((revSf.points ?? 0) * METRIC_WEIGHTS.revenuePerSF) : 0) +
    (equip.included ? Math.round((equip.points ?? 0) * METRIC_WEIGHTS.equipmentScore) : 0);
  const assetQualityMax =
    (revSf.included ? weightToMax("revenuePerSF") : 0) +
    (equip.included ? weightToMax("equipmentScore") : 0);

  const includedCount = Object.values(metrics).filter((m) => m.included).length;

  return {
    financialPerformance: {
      score: financialPerformanceScore,
      max: financialPerformanceMax || 1,
      breakdown: {
        ebitdaMargin: ebitda.included ? (ebitda.points ?? 0) : 0,
        utilityRatio: utility.included ? (utility.points ?? 0) : 0,
      },
    },
    debtCoverage: {
      score: debtCoverageScore,
      max: debtCoverageMax || 1,
      breakdown: {
        dscr: dscr.included ? (dscr.points ?? 0) : 0,
      },
    },
    assetQuality: {
      score: assetQualityScore,
      max: assetQualityMax || 1,
      breakdown: {
        revenuePerSF: revSf.included ? (revSf.points ?? 0) : 0,
        equipmentScore: equip.included ? (equip.points ?? 0) : 0,
      },
    },
    profileCompleteness: {
      score: includedCount,
      max: Object.keys(METRIC_WEIGHTS).length,
      breakdown: {
        metricsIncluded: includedCount,
      },
    },
  };
}

function buildImprovementTips(metrics: Record<MetricKey, LaundroCfoScoreMetric>): string[] {
  const tipsByMetric: Record<MetricKey, string[]> = {
    ebitdaMargin: [
      "Improve EBITDA margin by reviewing payroll and supply costs.",
      "Target 25%+ EBITDA margin to reach top-tier scoring.",
    ],
    utilityRatio: [
      "Reduce utility ratio — top operators stay below 14% of revenue.",
      "Enter trailing utility data to unlock utility scoring.",
    ],
    dscr: [
      "Raise DSCR above 1.25× to meet lender minimums.",
      "Strong coverage at 2.0×+ earns maximum debt scoring.",
    ],
    revenuePerSF: [
      "Boost revenue per SF with WDF, P&D, or card pricing.",
      "Enter square footage to unlock density scoring.",
    ],
    equipmentScore: [
      "Add equipment inventory for an accurate fleet quality score.",
      "Plan replacement for aging machines dragging equipment score.",
    ],
  };

  const ranked = (Object.entries(metrics) as [MetricKey, LaundroCfoScoreMetric][])
    .filter(([, metric]) => metric.included && metric.points != null)
    .sort((a, b) => (a[1].points ?? 0) - (b[1].points ?? 0));

  const missing = (Object.entries(metrics) as [MetricKey, LaundroCfoScoreMetric][])
    .filter(([, metric]) => !metric.included);

  const tips: string[] = [];

  for (const [key] of ranked) {
    for (const tip of tipsByMetric[key]) {
      if (tips.length >= 2) break;
      if (!tips.includes(tip)) tips.push(tip);
    }
    if (tips.length >= 2) break;
  }

  if (missing.length > 0 && tips.length < 3) {
    tips.push("Complete missing profile data to unlock your full score potential.");
  }

  return tips.slice(0, 3);
}

function computePotentialScore(
  actualPoints: Partial<Record<MetricKey, number | null>>,
  debtService: number | null
): number | null {
  const filledPoints: Partial<Record<MetricKey, number | null>> = { ...actualPoints };
  let hasMissingFillable = false;

  for (const key of Object.keys(METRIC_WEIGHTS) as MetricKey[]) {
    if (key === "dscr" && (debtService == null || debtService <= 0)) {
      continue;
    }
    if (filledPoints[key] == null) {
      filledPoints[key] = MEDIAN_TIER_POINTS[key];
      hasMissingFillable = true;
    }
  }

  if (!hasMissingFillable) return null;
  return computeWeightedScore(filledPoints);
}

export function computeLaundroCfoScore(
  store: LaundroCfoStoreInput,
  financials: LaundroCfoFinancialsInput,
  equipment: EquipmentRecord[],
  _lease: LaundroCfoLeaseInput,
  utilities: LaundroCfoUtilitiesInput,
  _options?: { realEstateMonthlyRent?: number | null }
): LaundroCfoScoreResult {
  const ttm =
    financials.ttmMonthsUsed > 0 && financials.ttmRevenue > 0
      ? {
          ttmRevenue: financials.ttmRevenue,
          ttmEbitda: financials.ttmEbitda,
          monthsUsed: financials.ttmMonthsUsed,
        }
      : null;
  const resolved = resolveStoreFinancials(store as Record<string, unknown>, ttm);
  const hasFinancials = resolved.source === "ttm";
  const monthlyRevenue = hasFinancials ? resolved.monthlyRevenue : store.monthly_revenue;
  const annualRevenue = hasFinancials ? financials.ttmRevenue : null;
  const annualEbitda = hasFinancials ? resolved.annualEbitda : null;

  const ebitdaMargin =
    hasFinancials && annualRevenue != null && annualRevenue > 0 && annualEbitda != null
      ? calcEbitdaMargin(annualEbitda, annualRevenue)
      : null;

  const utilityRatio = resolveScoreUtilityRatio(
    financials,
    monthlyRevenue,
    store.monthly_utilities
  );

  const squareFootage =
    store.square_footage != null && store.square_footage > 0 ? store.square_footage : null;
  const revenuePerSF =
    annualRevenue != null && squareFootage != null
      ? calcRevenuePerSF(annualRevenue, squareFootage)
      : null;

  const debtService = store.annual_debt_service;
  const dscr =
    hasFinancials && debtService != null && debtService > 0 && annualEbitda != null
      ? computeStoreDscr(annualEbitda, debtService)
      : null;

  const equipMetrics = computeEquipmentMetrics(equipment);
  const equipmentQualityScore =
    equipMetrics.totalMachines > 0 ? equipMetrics.qualityScore : null;

  const ebitdaPoints = scoreEbitdaMarginPoints(ebitdaMargin);
  const dscrPoints = scoreDscrPoints(dscr, debtService);
  const revenuePerSfPoints = scoreRevenuePerSfPoints(revenuePerSF);
  const equipmentPoints = scoreEquipmentPoints(equipmentQualityScore);
  const utilityPoints = hasUtilityData(
    utilityRatio,
    financials,
    store.monthly_utilities,
    utilities.records
  )
    ? scoreUtilityRatioPoints(utilityRatio)
    : null;

  const metrics: Record<MetricKey, LaundroCfoScoreMetric> = {
    ebitdaMargin: {
      label: "EBITDA Margin",
      points: ebitdaPoints,
      weight: METRIC_WEIGHTS.ebitdaMargin,
      included: ebitdaPoints != null,
      breakdownValue: ebitdaMargin != null ? `${ebitdaMargin.toFixed(1)}%` : null,
    },
    dscr: {
      label: "DSCR",
      points: dscrPoints,
      weight: METRIC_WEIGHTS.dscr,
      included: dscrPoints != null,
      breakdownValue: dscr != null ? `${dscr.toFixed(2)}x` : null,
    },
    revenuePerSF: {
      label: "Revenue per SF",
      points: revenuePerSfPoints,
      weight: METRIC_WEIGHTS.revenuePerSF,
      included: revenuePerSfPoints != null,
      breakdownValue: revenuePerSF != null ? `$${Math.round(revenuePerSF)}` : null,
    },
    equipmentScore: {
      label: "Equipment Score",
      points: equipmentPoints,
      weight: METRIC_WEIGHTS.equipmentScore,
      included: equipmentPoints != null,
      breakdownValue: equipmentQualityScore != null ? String(Math.round(equipmentQualityScore)) : null,
    },
    utilityRatio: {
      label: "Utility Ratio",
      points: utilityPoints,
      weight: METRIC_WEIGHTS.utilityRatio,
      included: utilityPoints != null,
      breakdownValue: utilityRatio != null ? `${utilityRatio.toFixed(1)}%` : null,
    },
  };

  const actualPoints: Partial<Record<MetricKey, number | null>> = {
    ebitdaMargin: ebitdaPoints,
    dscr: dscrPoints,
    revenuePerSF: revenuePerSfPoints,
    equipmentScore: equipmentPoints,
    utilityRatio: utilityPoints,
  };

  const total = computeWeightedScore(actualPoints);
  const potentialScore = computePotentialScore(actualPoints, debtService);
  const metricsIncluded = Object.values(metrics).filter((m) => m.included).length;

  return {
    total: Math.min(100, Math.max(0, total)),
    grade: scoreToLetterGrade(total),
    potentialScore:
      potentialScore != null && potentialScore > total ? potentialScore : null,
    metricsIncluded,
    metricsTotal: Object.keys(METRIC_WEIGHTS).length,
    metrics,
    categories: buildLegacyCategories(metrics),
    improvementTips: buildImprovementTips(metrics),
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

export function formatPotentialScoreNote(potentialScore: number | null): string | null {
  if (potentialScore == null) return null;
  return `Your score could reach ${potentialScore} with complete data`;
}

/** Median benchmark values used when projecting potential score for missing metrics. */
export function getScoreMedianBenchmarks() {
  const ebitda = benchmarks.find((b) => b.metric === "EBITDA Margin");
  const revSf = benchmarks.find((b) => b.metric === "Revenue per SF");
  const utility = benchmarks.find((b) => b.metric === "Utility Ratio");
  const dscr = benchmarks.find((b) => b.metric === "DSCR");
  return {
    ebitdaMarginPct: ebitda?.median ?? 22,
    revenuePerSf: revSf?.median ?? 140,
    utilityRatioPct: utility?.median ?? 18,
    dscr: dscr?.median ?? 1.5,
    equipmentScore: 75,
  };
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
