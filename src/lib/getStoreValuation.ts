import { createClient } from "@/lib/supabase";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import {
  buildUtilitiesLookup,
  calcTtmMetrics,
  enrichMonthlyRecords,
  sortRecordsDesc,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
} from "@/lib/financials";
import { calcValuation, type ValuationInputs, type ValuationResult } from "@/lib/valuation";

export type ResolvedStoreFinancials = {
  monthlyRevenue: number;
  monthlyExpenses: number;
  annualEbitda: number;
  source: "ttm" | "none";
};

/** True when monthly_financials rows exist and drive resolved figures. */
export function hasMonthlyFinancialRecords(
  resolved?: ResolvedStoreFinancials | null
): boolean {
  return resolved?.source === "ttm";
}

export type StoreValuationResult = ValuationResult & {
  store: Record<string, unknown>;
  context: StoreValuationContext;
  resolvedFinancials: ResolvedStoreFinancials;
};

const valuationCache = new Map<string, { result: StoreValuationResult; timestamp: number }>();
const CACHE_TTL = 30000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(String(value).split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearsRemaining(endDate: string | null | undefined): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  return Math.max(0, (end.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000));
}

function normalizeMarketDensity(raw: string | null | undefined): string {
  if (!raw) return "";
  const v = raw.toLowerCase();
  if (v === "urban" || v === "dense_urban" || v === "prime_dense_urban") return "urban";
  if (v === "suburban" || v === "strong_suburban") return "suburban";
  if (v === "rural") return "rural";
  return "";
}

function normalizeStoreCondition(raw: string | null | undefined): string {
  if (!raw) return "";
  const v = raw.toLowerCase();
  if (v === "excellent" || v === "remodeled") return "excellent";
  if (v === "good") return "good";
  if (v === "poor" || v === "needs_renovation") return "poor";
  if (v === "fair") return "fair";
  return "";
}

export type StoreValuationContext = {
  store: Record<string, unknown>;
  equipment: EquipmentRecord[];
  lease: Record<string, unknown> | null;
  leaseOptions: Record<string, unknown>[];
  realEstate: Record<string, unknown> | null;
  resolvedFinancials?: ResolvedStoreFinancials;
};

export function resolveStoreFinancials(
  _store: Record<string, unknown>,
  ttm: { ttmRevenue: number; ttmEbitda: number; monthsUsed: number } | null = null
): ResolvedStoreFinancials {
  if (ttm && ttm.monthsUsed > 0 && ttm.ttmRevenue > 0) {
    const monthlyRevenue = ttm.ttmRevenue / ttm.monthsUsed;
    const monthlyExpenses = (ttm.ttmRevenue - ttm.ttmEbitda) / ttm.monthsUsed;
    return {
      monthlyRevenue: Number.isFinite(monthlyRevenue) ? monthlyRevenue : 0,
      monthlyExpenses: Number.isFinite(monthlyExpenses) ? monthlyExpenses : 0,
      annualEbitda: Number.isFinite(ttm.ttmEbitda) ? ttm.ttmEbitda : 0,
      source: "ttm",
    };
  }

  return {
    monthlyRevenue: 0,
    monthlyExpenses: 0,
    annualEbitda: 0,
    source: "none",
  };
}

async function fetchStoreTtmMetrics(
  supabase: ReturnType<typeof createClient>,
  storeId: string
): Promise<{ ttmRevenue: number; ttmEbitda: number; monthsUsed: number } | null> {
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

  if (!financialsData?.length) return null;

  const utilitiesLookup = buildUtilitiesLookup((utilitiesData ?? []) as MonthlyUtilityRecord[]);
  const records = enrichMonthlyRecords(
    sortRecordsDesc(financialsData as MonthlyFinancialRecord[]),
    utilitiesLookup
  );
  const ttm = calcTtmMetrics(records);

  if (ttm.monthsUsed === 0 || ttm.ttmRevenue <= 0) return null;

  return {
    ttmRevenue: ttm.ttmRevenue,
    ttmEbitda: ttm.ttmEbitda,
    monthsUsed: ttm.monthsUsed,
  };
}

export function buildStoreValuationInputs(
  ctx: StoreValuationContext,
  overrides: Partial<ValuationInputs> = {}
): ValuationInputs {
  const { store, equipment, lease, leaseOptions, realEstate } = ctx;
  const equipMetrics = computeEquipmentMetrics(equipment);
  const isOwnerOccupied = store.occupancy_type === "owner_occupied";

  let totalLeaseControl = 0;
  let leaseYearsRemaining = 0;
  if (!isOwnerOccupied && lease?.lease_end_date) {
    const yearsRemaining = calcYearsRemaining(lease.lease_end_date as string);
    const optionYears = leaseOptions
      .filter((o) => o.status === "Available")
      .reduce((s, o) => s + (Number(o.option_years) || 0), 0);
    leaseYearsRemaining = yearsRemaining;
    totalLeaseControl = yearsRemaining + optionYears;
  }

  const resolved = ctx.resolvedFinancials ?? resolveStoreFinancials(store);
  if (resolved.source === "none") {
    return {
      ebitda: 0,
      monthlyRevenue: 0,
      squareFootage: Number(store.square_footage) || 0,
      avgEquipmentAge: 0,
      pct200G: 0,
      equipmentScore: 0,
      totalLeaseControl: 0,
      leaseYearsRemaining: 0,
      occupancyType: isOwnerOccupied ? "owned" : "leased",
      marketDensity: "",
      storeCondition: "",
      revenueTrend: "",
      competitionLevel: "",
      selfServicePct: 0,
      wdfPct: 0,
      commercialPct: 0,
      pickupDeliveryPct: 0,
      realEstateValue: undefined,
      ...overrides,
    };
  }

  const monthlyRevenue = resolved.monthlyRevenue;
  const monthlyExpenses = resolved.monthlyExpenses;
  const hasRevenueMix =
    store.wdf_pct != null ||
    store.commercial_pct != null ||
    store.pickup_delivery_pct != null ||
    store.self_service_pct != null;
  const wdfPct = store.wdf_pct != null ? Number(store.wdf_pct) : 0;
  const commercialPct = store.commercial_pct != null ? Number(store.commercial_pct) : 0;
  const pickupDeliveryPct = store.pickup_delivery_pct != null ? Number(store.pickup_delivery_pct) : 0;
  const selfServicePct =
    store.self_service_pct != null
      ? Number(store.self_service_pct)
      : hasRevenueMix
        ? Math.max(0, 100 - wdfPct - commercialPct - pickupDeliveryPct)
        : 0;

  const base: ValuationInputs = {
    ebitda: resolved.annualEbitda,
    monthlyRevenue,
    squareFootage: Number(store.square_footage) || 0,
    avgEquipmentAge:
      equipMetrics.totalMachines > 0
        ? equipMetrics.weightedAvgAge
        : Number(store.avg_machine_age) || 0,
    pct200G: equipMetrics.pct200GWashers,
    equipmentScore: equipMetrics.totalMachines > 0 ? equipMetrics.qualityScore : 0,
    totalLeaseControl,
    leaseYearsRemaining,
    occupancyType: isOwnerOccupied ? "owned" : "leased",
    marketDensity: normalizeMarketDensity(
      (store.market_density as string) ?? (store.location_type as string)
    ),
    storeCondition: normalizeStoreCondition(store.store_condition as string),
    lastRetoolYear: store.last_retool_year ? Number(store.last_retool_year) : undefined,
    retoolInvestment: store.retool_investment ? Number(store.retool_investment) : undefined,
    retoolType: (store.retool_type as string) || undefined,
    revenueTrend: (store.revenue_trend as string) ?? "",
    competitionLevel: (store.competition_level as string) ?? "",
    selfServicePct,
    wdfPct,
    commercialPct,
    pickupDeliveryPct,
    realEstateValue: isOwnerOccupied ? Number(realEstate?.estimated_value) || 0 : undefined,
  };

  return { ...base, ...overrides };
}

export function computeStoreValuation(
  ctx: StoreValuationContext,
  overrides: Partial<ValuationInputs> = {}
): ValuationResult {
  return calcValuation(buildStoreValuationInputs(ctx, overrides));
}

export function invalidateValuationCache(storeId: string) {
  valuationCache.delete(storeId);
}

export async function getStoreValuation(
  storeId: string
): Promise<StoreValuationResult> {
  const cached = valuationCache.get(storeId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const supabase = createClient();

  const [{ data: store }, { data: lease }, { data: equipment }, { data: realEstate }, ttmMetrics] =
    await Promise.all([
      supabase.from("stores").select("*").eq("id", storeId).single(),
      supabase.from("leases").select("*").eq("store_id", storeId).maybeSingle(),
      supabase.from("equipment_inventory").select("*").eq("store_id", storeId),
      supabase.from("real_estate").select("*").eq("store_id", storeId).maybeSingle(),
      fetchStoreTtmMetrics(supabase, storeId),
    ]);

  const { data: leaseOptions } = await supabase
    .from("lease_options")
    .select("*")
    .eq("lease_id", lease?.id ?? "");

  const storeRecord = store ?? {};
  const resolvedFinancials = resolveStoreFinancials(storeRecord, ttmMetrics);

  const ctx: StoreValuationContext = {
    store: storeRecord,
    equipment: (equipment ?? []) as EquipmentRecord[],
    lease: lease ?? null,
    leaseOptions: leaseOptions ?? [],
    realEstate: realEstate ?? null,
    resolvedFinancials,
  };

  const result: StoreValuationResult = {
    ...computeStoreValuation(ctx),
    store: storeRecord,
    context: ctx,
    resolvedFinancials,
  };

  valuationCache.set(storeId, { result, timestamp: Date.now() });
  return result;
}

export async function getPortfolioValuation(userId: string) {
  const supabase = createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("*")
    .eq("user_id", userId)
    .eq("archived", false);

  if (!stores || stores.length === 0) {
    return { totalValue: 0, storeValuations: [] as { store: Record<string, unknown>; valuation: StoreValuationResult }[] };
  }

  const storeValuations = await Promise.all(
    stores.map(async (store) => {
      const valuation = await getStoreValuation(store.id);
      return { store, valuation };
    })
  );

  const totalValue = storeValuations.reduce((sum, sv) => sum + sv.valuation.businessValue, 0);

  return { totalValue, storeValuations };
}

export async function getStoreScheduledDebtService(storeId: string): Promise<number> {
  const supabase = createClient();
  const { data: loans } = await supabase
    .from("store_loans")
    .select("monthly_payment")
    .eq("store_id", storeId)
    .eq("is_active", true);
  if (!loans) return 0;
  return loans.reduce((sum, loan) => sum + (loan.monthly_payment ?? 0) * 12, 0);
}

export async function getStoreDebt(storeId: string): Promise<number> {
  const supabase = createClient();
  const { data: loans } = await supabase
    .from("store_loans")
    .select("*")
    .eq("store_id", storeId)
    .eq("is_active", true);
  if (!loans) return 0;

  const { calcEstimatedBalance } = await import("@/lib/amortization");
  return loans.reduce((sum, loan) => {
    const estimated = calcEstimatedBalance({
      currentBalance: loan.current_balance,
      interestRate: loan.interest_rate,
      monthlyPayment: loan.monthly_payment,
      lastUpdated: loan.updated_at,
    });
    return sum + estimated;
  }, 0);
}
