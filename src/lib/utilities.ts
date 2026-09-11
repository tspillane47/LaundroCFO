import {
  buildUtilitiesLookup,
  monthKey,
  ttmWindowRecords,
  type MonthlyUtilityRecord,
  type UtilityImportField,
} from "@/lib/financials";

export interface UtilityRecord {
  year: number;
  month: number;
  water: number;
  gas: number;
  electric: number;
  sewer: number;
  trash: number;
  internet: number;
}

export function totalUtilities(rec: UtilityRecord): number {
  return rec.water + rec.gas + rec.electric + rec.sewer + rec.trash + rec.internet;
}

export function utilityPctOfRevenue(utilityAmount: number, monthlyRevenue: number): number {
  if (monthlyRevenue <= 0) return 0;
  return (utilityAmount / monthlyRevenue) * 100;
}

export function waterCostPerSF(waterCost: number, squareFootage: number): number {
  if (squareFootage <= 0) return 0;
  return waterCost / squareFootage;
}

export function waterCostPerWasher(waterCost: number, washerCount: number): number {
  if (washerCount <= 0) return 0;
  return waterCost / washerCount;
}

export function waterCostPerTurn(
  waterCost: number,
  washerCount: number,
  turnsPerWasherPerDay: number = 4.5,
  realTurnsPerDay?: number | null
): number {
  if (washerCount <= 0) return 0;
  const turns =
    realTurnsPerDay != null && realTurnsPerDay > 0 ? realTurnsPerDay : turnsPerWasherPerDay;
  const monthlyTurns = washerCount * turns * 30;
  if (monthlyTurns <= 0) return 0;
  return waterCost / monthlyTurns;
}

/** Prefer equipment washer quantity; fall back to the store profile count. */
export function resolveWasherCount(
  storeWashers: number | null | undefined,
  equipment: { machine_type: string; quantity: number }[]
): number {
  const fromEquipment = equipment
    .filter((row) => row.machine_type === "Washer")
    .reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  if (fromEquipment > 0) return fromEquipment;
  return storeWashers && storeWashers > 0 ? storeWashers : 0;
}

export async function getStoreUtilities(storeId: string) {
  const { createClient } = await import("@/lib/supabase");
  const supabase = createClient();
  const { data } = await supabase
    .from("monthly_utilities")
    .select("*")
    .eq("store_id", storeId)
    .order("year", { ascending: true })
    .order("month", { ascending: true });
  return data ?? [];
}

export type MonthlyUtilityRow = UtilityRecord & {
  id?: string;
  store_id?: string;
  user_id?: string;
  notes?: string | null;
};

export function getMostRecentUtility(records: MonthlyUtilityRow[]): MonthlyUtilityRow | null {
  if (records.length === 0) return null;
  return [...records].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  })[0];
}

function ttmUtilityFieldSum(
  ttmRecords: { year: number; month: number }[],
  lookup: Map<string, MonthlyUtilityRecord>,
  field: UtilityImportField
): number {
  return ttmRecords.reduce((sum, record) => {
    const row = lookup.get(monthKey(record.year, record.month));
    return sum + (row?.[field] ?? 0);
  }, 0);
}

function ttmUtilityFieldHasData(
  ttmRecords: { year: number; month: number }[],
  lookup: Map<string, MonthlyUtilityRecord>,
  field: UtilityImportField
): boolean {
  return ttmRecords.some((record) => {
    const row = lookup.get(monthKey(record.year, record.month));
    return row != null && (row[field] ?? 0) > 0;
  });
}

export type TtmUtilityMetrics = {
  monthsUsed: number;
  ttmRevenue: number;
  avgRevenue: number | null;
  water: number | null;
  electric: number | null;
  gas: number | null;
  total: number | null;
  waterPctOfRevenue: number | null;
  electricPctOfRevenue: number | null;
  gasPctOfRevenue: number | null;
  totalPctOfRevenue: number | null;
  hasUtilityCosts: boolean;
};

const EMPTY_TTM_UTILITY_METRICS: TtmUtilityMetrics = {
  monthsUsed: 0,
  ttmRevenue: 0,
  avgRevenue: null,
  water: null,
  electric: null,
  gas: null,
  total: null,
  waterPctOfRevenue: null,
  electricPctOfRevenue: null,
  gasPctOfRevenue: null,
  totalPctOfRevenue: null,
  hasUtilityCosts: false,
};

/**
 * Trailing monthly utility averages over fully-elapsed months (max 12), keyed off
 * the same financial TTM window as cost-per-load. Months with no utility row count as 0
 * so quarterly bills (e.g. water) average correctly instead of showing $0 for the latest month.
 */
export function computeTtmUtilityMetrics(
  financialRecords: { year: number; month: number; revenue?: number }[],
  utilityRecords: MonthlyUtilityRecord[],
  asOf: Date = new Date()
): TtmUtilityMetrics {
  if (financialRecords.length === 0) return EMPTY_TTM_UTILITY_METRICS;

  const newestFirst = [...financialRecords].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
  const ttmRecords = ttmWindowRecords(newestFirst, asOf);
  const monthsUsed = ttmRecords.length;
  if (monthsUsed === 0) return EMPTY_TTM_UTILITY_METRICS;

  const lookup = buildUtilitiesLookup(utilityRecords);
  const ttmRevenue = ttmRecords.reduce((sum, record) => sum + (record.revenue ?? 0), 0);
  const avgRevenue = ttmRevenue / monthsUsed;

  const averageIfPresent = (field: UtilityImportField): number | null => {
    if (!ttmUtilityFieldHasData(ttmRecords, lookup, field)) return null;
    return ttmUtilityFieldSum(ttmRecords, lookup, field) / monthsUsed;
  };

  const water = averageIfPresent("water");
  const electric = averageIfPresent("electric");
  const gas = averageIfPresent("gas");

  const ttmUtilityTotal = ttmRecords.reduce((sum, record) => {
    const row = lookup.get(monthKey(record.year, record.month));
    return sum + (row ? totalUtilities(row) : 0);
  }, 0);
  const hasAnyTotal = ttmRecords.some((record) => {
    const row = lookup.get(monthKey(record.year, record.month));
    return row != null && totalUtilities(row) > 0;
  });
  const total = hasAnyTotal ? ttmUtilityTotal / monthsUsed : null;

  const pct = (amount: number | null) =>
    amount != null && avgRevenue > 0 ? utilityPctOfRevenue(amount, avgRevenue) : amount != null ? 0 : null;

  return {
    monthsUsed,
    ttmRevenue,
    avgRevenue,
    water,
    electric,
    gas,
    total,
    waterPctOfRevenue: pct(water),
    electricPctOfRevenue: pct(electric),
    gasPctOfRevenue: pct(gas),
    totalPctOfRevenue: pct(total),
    hasUtilityCosts: water != null || electric != null || gas != null,
  };
}

export function computeEquipmentMetrics(equipment: { quantity: number; installation_year: number }[]) {
  const currentYear = new Date().getFullYear();
  const totalMachines = equipment.reduce((s, e) => s + (e.quantity ?? 0), 0);
  const avgEquipmentAge =
    totalMachines > 0
      ? equipment.reduce((s, e) => s + (e.quantity ?? 0) * (currentYear - (e.installation_year ?? currentYear)), 0) /
        totalMachines
      : 0;

  let equipScore = 60;
  if (avgEquipmentAge < 5) equipScore += 30;
  else if (avgEquipmentAge < 8) equipScore += 20;
  else if (avgEquipmentAge < 12) equipScore += 10;
  else if (avgEquipmentAge >= 15) equipScore -= 10;

  const equipmentGrade =
    equipScore >= 90 ? "A" : equipScore >= 75 ? "B" : equipScore >= 60 ? "C" : "D";

  return { avgEquipmentAge, equipmentGrade, equipScore };
}
