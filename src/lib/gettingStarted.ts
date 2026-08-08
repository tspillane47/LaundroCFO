import type { SupabaseClient } from "@supabase/supabase-js";

export type SetupSectionId =
  | "equipment"
  | "occupancy"
  | "debt"
  | "financials"
  | "co_owner";

export type SetupSectionStatus = "complete" | "not_started";

export type FinancialDataOptionId = "quickbooks" | "plaid" | "csv";

export type FinancialDataOption = {
  id: FinancialDataOptionId;
  label: string;
  connectedLabel: string;
  description: string;
  href: string;
  connected: boolean;
};

export type SetupSection = {
  id: SetupSectionId;
  label: string;
  description: string;
  href: string;
  status: SetupSectionStatus;
  financialOptions?: FinancialDataOption[];
  optional?: boolean;
  actionLabel?: string;
};

export type StoreSetupStatus = {
  sections: SetupSection[];
  optionalSections: SetupSection[];
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

export function isFinancialDataComplete(
  hasQuickBooks: boolean,
  hasPlaid: boolean,
  transactionCount: number
): boolean {
  return hasQuickBooks || hasPlaid || transactionCount > 0;
}

export function isCoOwnerComplete(coOwnerCount: number): boolean {
  return coOwnerCount > 0;
}

export function buildFinancialDataOptions(input: {
  hasQuickBooks: boolean;
  hasPlaid: boolean;
  hasTransactions: boolean;
}): FinancialDataOption[] {
  return [
    {
      id: "quickbooks",
      label: "Connect QuickBooks",
      connectedLabel: "QuickBooks connected",
      description: "Sync your books automatically if you already use QuickBooks.",
      href: "/financials?tab=quickbooks",
      connected: input.hasQuickBooks,
    },
    {
      id: "plaid",
      label: "Connect Bank Account",
      connectedLabel: "Bank account connected",
      description: "Link your business bank account for automatic transaction imports.",
      href: "/financials?tab=bank",
      connected: input.hasPlaid,
    },
    {
      id: "csv",
      label: "Import Bank Statement (CSV)",
      connectedLabel: "Bank transactions imported",
      description: "Upload a CSV export from your bank if you prefer not to connect accounts.",
      href: "/transactions",
      connected: input.hasTransactions,
    },
  ];
}

export function buildStoreSetupStatus(input: {
  equipmentCount: number;
  occupancyType: OccupancyType;
  hasLease: boolean;
  hasRealEstate: boolean;
  loanCount: number;
  hasQuickBooks: boolean;
  hasPlaid: boolean;
  transactionCount: number;
  coOwnerCount: number;
}): StoreSetupStatus {
  const financialOptions = buildFinancialDataOptions({
    hasQuickBooks: input.hasQuickBooks,
    hasPlaid: input.hasPlaid,
    hasTransactions: input.transactionCount > 0,
  });

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
      id: "financials",
      label: "Connect Your Financial Data",
      description: "Choose how you'd like to bring in revenue and expenses — any one option counts.",
      href: "/financials",
      status: isFinancialDataComplete(input.hasQuickBooks, input.hasPlaid, input.transactionCount)
        ? "complete"
        : "not_started",
      financialOptions,
    },
  ];

  const optionalSections: SetupSection[] = [
    {
      id: "co_owner",
      label: "Invite a Co-Owner",
      description:
        "Share access with a business partner or co-owner so you can both manage this store together.",
      href: "/settings#manage-access",
      status: isCoOwnerComplete(input.coOwnerCount) ? "complete" : "not_started",
      optional: true,
      actionLabel: "Manage Access →",
    },
  ];

  const completedCount = sections.filter((s) => s.status === "complete").length;

  return {
    sections,
    optionalSections,
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
    { data: quickBooksConnection },
    { data: plaidConnectionsData },
    { count: transactionCount },
    { count: coOwnerCount },
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
    supabase.from("quickbooks_connections").select("id").eq("store_id", storeId).maybeSingle(),
    supabase.from("plaid_connections").select("id").eq("store_id", storeId).limit(1),
    supabase
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("store_members")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
  ]);

  return buildStoreSetupStatus({
    equipmentCount: equipmentCount ?? 0,
    occupancyType: (store?.occupancy_type as OccupancyType) ?? null,
    hasLease: Boolean(lease),
    hasRealEstate: Boolean(realEstate),
    loanCount: loanCount ?? 0,
    hasQuickBooks: Boolean(quickBooksConnection),
    hasPlaid: (plaidConnectionsData?.length ?? 0) > 0,
    transactionCount: transactionCount ?? 0,
    coOwnerCount: coOwnerCount ?? 0,
  });
}
