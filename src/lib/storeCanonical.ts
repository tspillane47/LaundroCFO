import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";

type StoreRow = {
  occupancy_type?: string | null;
  square_footage?: number | null;
};

type LeaseRow = {
  square_footage?: number | null;
} | null;

type RealEstateRow = {
  laundromat_square_footage?: number | null;
  total_square_footage?: number | null;
  monthly_rent_charged?: number | null;
} | null;

type StoreLoanRow = {
  monthly_payment?: number | null;
  current_balance?: number | null;
  is_active?: boolean | null;
};

export type ResolvedEquipment = {
  totalWashers: number;
  totalDryers: number;
  totalMachines: number;
  weightedAvgAge: number | null;
  fromInventory: boolean;
};

export type ResolvedDebt = {
  annualDebtService: number;
  loanBalance: number;
  totalMonthlyDebtService: number;
};

/** Square footage from Occupancy modules (not stores.square_footage). */
export function resolveSquareFootage(
  store: StoreRow | null | undefined,
  lease: LeaseRow,
  realEstate: RealEstateRow
): number | null {
  if (store?.occupancy_type === "owner_occupied") {
    const sqft =
      realEstate?.laundromat_square_footage ?? realEstate?.total_square_footage ?? null;
    return sqft != null && sqft > 0 ? sqft : null;
  }
  const leaseSqft = lease?.square_footage ?? null;
  if (leaseSqft != null && leaseSqft > 0) return leaseSqft;
  return null;
}

/** Equipment counts and age from inventory only (ignores stale store cache for display). */
export function resolveEquipmentFromInventory(
  equipment: EquipmentRecord[],
  currentYear = new Date().getFullYear()
): ResolvedEquipment {
  if (equipment.length === 0) {
    return {
      totalWashers: 0,
      totalDryers: 0,
      totalMachines: 0,
      weightedAvgAge: null,
      fromInventory: false,
    };
  }
  const metrics = computeEquipmentMetrics(equipment, currentYear);
  return {
    totalWashers: metrics.totalWashers,
    totalDryers: metrics.totalDryers,
    totalMachines: metrics.totalMachines,
    weightedAvgAge: metrics.totalMachines > 0 ? metrics.weightedAvgAge : null,
    fromInventory: true,
  };
}

export function resolveDebtFromLoans(loans: StoreLoanRow[]): ResolvedDebt {
  const active = loans.filter((l) => l.is_active !== false);
  const totalMonthlyDebtService = active.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
  const loanBalance = active.reduce((s, l) => s + (l.current_balance ?? 0), 0);
  return {
    totalMonthlyDebtService,
    annualDebtService: totalMonthlyDebtService * 12,
    loanBalance,
  };
}

export type RentDisplaySource = "transactions" | "lease" | "none";

/** Rent for Current Monthly Averages panel — TTM transactions first, lease fallback. */
export function resolveTtmRentDisplay(
  ttmRecords: { rent?: number | null }[],
  monthsUsed: number,
  leaseMonthlyRent: number | null | undefined
): { monthlyAverage: number | null; rentSource: RentDisplaySource } {
  const hasTransactionRent = ttmRecords.some((r) => (r.rent ?? 0) !== 0);

  if (hasTransactionRent && monthsUsed > 0) {
    const ttmRentTotal = ttmRecords.reduce((sum, r) => sum + (r.rent ?? 0), 0);
    return {
      monthlyAverage: ttmRentTotal / monthsUsed,
      rentSource: "transactions",
    };
  }

  const leaseRent = leaseMonthlyRent ?? 0;
  if (leaseRent > 0) {
    return { monthlyAverage: leaseRent, rentSource: "lease" };
  }

  return { monthlyAverage: null, rentSource: "none" };
}

/** Occupancy rent for display (lease or owner-occupied charge — not stores.monthly_rent). */
export function resolveOccupancyRentDisplay(
  lease: { monthly_rent?: number | null } | null,
  realEstate: { monthly_rent_charged?: number | null } | null,
  isOwnerOccupied: boolean
): number | null {
  if (isOwnerOccupied) {
    const rent = realEstate?.monthly_rent_charged ?? null;
    return rent != null && rent > 0 ? rent : null;
  }
  const rent = lease?.monthly_rent ?? null;
  return rent != null && rent > 0 ? rent : null;
}

/** True when Dashboard should label KPIs as profile estimates (no monthly_financials TTM). */
export function isUsingProfileFinancialEstimate(ttmMonthsUsed: number | null | undefined): boolean {
  return (ttmMonthsUsed ?? 0) === 0;
}

export async function syncEquipmentToStoreCache(
  storeId: string,
  supabase: SupabaseClient = createClient()
): Promise<void> {
  const { data: equipment, error: fetchError } = await supabase
    .from("equipment_inventory")
    .select("*")
    .eq("store_id", storeId);

  if (fetchError) {
    console.error("syncEquipmentToStoreCache fetch error:", fetchError);
    return;
  }

  const resolved = resolveEquipmentFromInventory((equipment ?? []) as EquipmentRecord[]);
  const { error: updateError } = await supabase
    .from("stores")
    .update({
      washers: resolved.totalWashers > 0 ? resolved.totalWashers : null,
      dryers: resolved.totalDryers > 0 ? resolved.totalDryers : null,
      avg_machine_age: resolved.weightedAvgAge,
    })
    .eq("id", storeId);

  if (updateError) {
    console.error("syncEquipmentToStoreCache update error:", updateError);
  }
}

export async function syncDebtToStoreCache(
  storeId: string,
  supabase: SupabaseClient = createClient()
): Promise<void> {
  const { data: loans, error: fetchError } = await supabase
    .from("store_loans")
    .select("monthly_payment, current_balance, is_active")
    .eq("store_id", storeId)
    .eq("is_active", true);

  if (fetchError) {
    console.error("syncDebtToStoreCache fetch error:", fetchError);
    return;
  }

  const debt = resolveDebtFromLoans((loans ?? []) as StoreLoanRow[]);
  const { error: updateError } = await supabase
    .from("stores")
    .update({
      annual_debt_service: debt.annualDebtService > 0 ? debt.annualDebtService : null,
      loan_balance: debt.loanBalance > 0 ? debt.loanBalance : null,
    })
    .eq("id", storeId);

  if (updateError) {
    console.error("syncDebtToStoreCache update error:", updateError);
  }
}
