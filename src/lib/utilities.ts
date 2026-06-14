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
  turnsPerWasherPerDay: number = 4.5
): number {
  if (washerCount <= 0) return 0;
  const monthlyTurns = washerCount * turnsPerWasherPerDay * 30;
  if (monthlyTurns <= 0) return 0;
  return waterCost / monthlyTurns;
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
