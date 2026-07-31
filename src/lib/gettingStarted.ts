import type { SupabaseClient } from "@supabase/supabase-js";

export type SetupSectionId = "equipment" | "occupancy" | "debt" | "transactions";

export type SetupSectionStatus = "complete" | "not_started";

export type SetupSection = {
  id: SetupSectionId;
  label: string;
  description: string;
  href: string;
  status: SetupSectionStatus;
};

export type StoreSetupStatus = {
  sections: SetupSection[];
  completedCount: number;
  totalCount: number;
};

type OccupancyType = "leased" | "owner_occupied" | null;

export function isEquipmentComplete(equipmentCount: number): boolean {
  return equipmentCount > 0;
}

export function isOccupancyComplete(
  occupancyType: OccupancyType,
  hasLease: boolean,
  hasRealEstate: boolean
): boolean {
  if (occupancyType === "leased") return hasLease;
  if (occupancyType === "owner_occupied") return hasRealEstate;
  return false;
}

export function isDebtComplete(loanCount: number): boolean {
  return loanCount > 0;
}

export function isTransactionsComplete(transactionCount: number): boolean {
  return transactionCount > 0;
}

export function buildStoreSetupStatus(input: {
  equipmentCount: number;
  occupancyType: OccupancyType;
  hasLease: boolean;
  hasRealEstate: boolean;
  loanCount: number;
  transactionCount: number;
}): StoreSetupStatus {
  const sections: SetupSection[] = [
    {
      id: "equipment",
      label: "Equipment",
      description: "Add your washers and dryers so we can score machine age and condition.",
      href: "/equipment",
      status: isEquipmentComplete(input.equipmentCount) ? "complete" : "not_started",
    },
    {
      id: "occupancy",
      label: "Lease & Occupancy",
      description: "Tell us whether you lease or own — it affects your valuation and lending profile.",
      href: "/lease",
      status: isOccupancyComplete(input.occupancyType, input.hasLease, input.hasRealEstate)
        ? "complete"
        : "not_started",
    },
    {
      id: "debt",
      label: "Debt",
      description: "Add any loans so we can calculate debt service and cash flow accurately.",
      href: "/debt",
      status: isDebtComplete(input.loanCount) ? "complete" : "not_started",
    },
    {
      id: "transactions",
      label: "Bank Import & Transactions",
      description: "Import bank transactions to build your P&L and unlock full financial insights.",
      href: "/transactions",
      status: isTransactionsComplete(input.transactionCount) ? "complete" : "not_started",
    },
  ];

  const completedCount = sections.filter((s) => s.status === "complete").length;

  return {
    sections,
    completedCount,
    totalCount: sections.length,
  };
}

export async function fetchStoreSetupStatus(
  supabase: SupabaseClient,
  storeId: string
): Promise<StoreSetupStatus> {
  const [
    { count: equipmentCount },
    { data: store },
    { data: lease },
    { data: realEstate },
    { count: loanCount },
    { count: transactionCount },
  ] = await Promise.all([
    supabase
      .from("equipment_inventory")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase.from("stores").select("occupancy_type").eq("id", storeId).maybeSingle(),
    supabase.from("leases").select("id").eq("store_id", storeId).maybeSingle(),
    supabase.from("real_estate").select("id").eq("store_id", storeId).maybeSingle(),
    supabase
      .from("store_loans")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
  ]);

  return buildStoreSetupStatus({
    equipmentCount: equipmentCount ?? 0,
    occupancyType: (store?.occupancy_type as OccupancyType) ?? null,
    hasLease: Boolean(lease),
    hasRealEstate: Boolean(realEstate),
    loanCount: loanCount ?? 0,
    transactionCount: transactionCount ?? 0,
  });
}
