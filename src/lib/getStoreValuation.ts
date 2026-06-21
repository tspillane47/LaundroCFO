import { createClient } from "@/lib/supabase";
import {
  computeEquipmentMetrics,
  computeTurnsPerDay,
  type EquipmentRecord,
  type TurnsPerDayResult,
  DEFAULT_DRYER_REVENUE_PCT,
} from "@/lib/equipment";
import { fetchStoreTtmMetrics, resolveAnnualEbitda } from "@/lib/financials";
import { resolveSquareFootage } from "@/lib/storeCanonical";
import { calcValuation, type ValuationInputs, type ValuationResult } from "@/lib/valuation";

export type StoreValuationContext = {
  store: Record<string, unknown>;
  equipment: EquipmentRecord[];
  lease: Record<string, unknown> | null;
  leaseOptions: Record<string, unknown>[];
  realEstate: Record<string, unknown> | null;
};

export type StoreValuationResult = ValuationResult & {
  store: Record<string, unknown>;
  context: StoreValuationContext;
  /** Trailing-12-month EBITDA from monthly_financials (0 when no P&L history exists) */
  annualEbitda: number;
  /** Number of monthly_financials months summed (0 when using store field fallback) */
  ttmMonthsUsed: number;
  /** Trailing-12-month revenue from monthly_financials (0 when no P&L history exists) */
  ttmRevenue: number;
  /** Trailing-12-month EBITDA from monthly_financials (0 when no P&L history exists) */
  ttmEbitda: number;
  /** Trailing-12-month DSCR from monthly_financials (0 when no P&L history exists) */
  ttmDscr: number;
  /** Turns-per-day operating metrics when self-service TTM and vend prices are available. */
  equipmentOperating?: {
    turnsAvailable: boolean;
    turnsPerDay: number | null;
    lowTurnsRisk: boolean;
    turns: TurnsPerDayResult | null;
  };
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
  const v = String(raw ?? "average").toLowerCase();
  if (v === "urban" || v === "dense_urban" || v === "prime_dense_urban") return "urban";
  if (v === "suburban" || v === "strong_suburban") return "suburban";
  if (v === "rural") return "rural";
  return "average";
}

function normalizeStoreCondition(raw: string | null | undefined): string {
  const v = String(raw ?? "fair").toLowerCase();
  if (v === "excellent" || v === "remodeled") return "excellent";
  if (v === "good") return "good";
  if (v === "poor" || v === "needs_renovation") return "poor";
  return "fair";
}


export function buildStoreValuationInputs(
  ctx: StoreValuationContext,
  overrides: Partial<ValuationInputs> = {}
): ValuationInputs {
  const { store, equipment, lease, leaseOptions, realEstate } = ctx;
  const equipMetrics = computeEquipmentMetrics(equipment);
  const isOwnerOccupied = store.occupancy_type === "owner_occupied";

  let totalLeaseControl = 0;
  if (isOwnerOccupied) {
    totalLeaseControl = 15;
  } else if (lease?.lease_end_date) {
    const yearsRemaining = calcYearsRemaining(lease.lease_end_date as string);
    const optionYears = leaseOptions
      .filter((o) => o.status === "Available")
      .reduce((s, o) => s + (Number(o.option_years) || 0), 0);
    totalLeaseControl = yearsRemaining + optionYears;
  }

  const monthlyRevenue = Number(store.monthly_revenue) || 0;
  const monthlyExpenses = Number(store.monthly_expenses) || 0;
  const wdfPct = Number(store.wdf_pct) || 18;
  const commercialPct = Number(store.commercial_pct) || 12;
  const pickupDeliveryPct = Number(store.pickup_delivery_pct) || 0;
  const selfServicePct =
    store.self_service_pct != null
      ? Number(store.self_service_pct)
      : Math.max(0, 100 - wdfPct - commercialPct - pickupDeliveryPct);

  const sqft = resolveSquareFootage(store, lease, realEstate) ?? 3500;

  const base: ValuationInputs = {
    ebitda: overrides.ebitda ?? (monthlyRevenue - monthlyExpenses) * 12,
    monthlyRevenue,
    squareFootage: sqft,
    avgEquipmentAge:
      equipMetrics.totalMachines > 0
        ? equipMetrics.weightedAvgAge
        : Number(store.avg_machine_age) || 6,
    pct200G: equipMetrics.pct200GWashers,
    equipmentScore: equipMetrics.totalMachines > 0 ? equipMetrics.qualityScore : 85,
    totalLeaseControl,
    occupancyType: isOwnerOccupied ? "owned" : "leased",
    marketDensity: normalizeMarketDensity(
      (store.market_density as string) ?? (store.location_type as string)
    ),
    storeCondition: normalizeStoreCondition(store.store_condition as string),
    lastRetoolYear: store.last_retool_year ? Number(store.last_retool_year) : undefined,
    retoolInvestment: store.retool_investment ? Number(store.retool_investment) : undefined,
    retoolType: (store.retool_type as string) || undefined,
    revenueTrend: (store.revenue_trend as string) || "stable",
    competitionLevel: (store.competition_level as string) || "normal",
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

  const { data: store } = await supabase.from("stores").select("*").eq("id", storeId).single();
  const { data: lease } = await supabase
    .from("leases")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  const { data: leaseOptions } = await supabase
    .from("lease_options")
    .select("*")
    .eq("lease_id", lease?.id ?? "");
  const { data: equipment } = await supabase
    .from("equipment_inventory")
    .select("*")
    .eq("store_id", storeId);
  const { data: realEstate } = await supabase
    .from("real_estate")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  const ctx: StoreValuationContext = {
    store: store ?? {},
    equipment: (equipment ?? []) as EquipmentRecord[],
    lease: lease ?? null,
    leaseOptions: leaseOptions ?? [],
    realEstate: realEstate ?? null,
  };

  const ttmData = await fetchStoreTtmMetrics(supabase, storeId);
  const ttm = ttmData?.metrics ?? null;
  const { annualEbitda, ttmMonthsUsed } = resolveAnnualEbitda(ttm);
  const valuationOverrides: Partial<ValuationInputs> = { ebitda: annualEbitda };
  if (ttm && ttm.monthsUsed > 0 && ttm.ttmRevenue > 0) {
    valuationOverrides.monthlyRevenue = ttm.ttmRevenue / ttm.monthsUsed;
  }

  const valuation = computeStoreValuation(ctx, valuationOverrides);

  let equipmentOperating: StoreValuationResult["equipmentOperating"];
  let valueRisks = [...valuation.valueRisks];

  const selfServiceTtmRevenue = ttmData
    ? ttmData.ttmRecords.reduce((sum, r) => sum + (r.self_service_revenue ?? 0), 0)
    : 0;

  const dryerRevenuePct =
    store?.dryer_revenue_pct != null
      ? Number(store.dryer_revenue_pct)
      : DEFAULT_DRYER_REVENUE_PCT;

  if (selfServiceTtmRevenue > 0 && ctx.equipment.length > 0) {
    const turns = computeTurnsPerDay(ctx.equipment, selfServiceTtmRevenue, dryerRevenuePct);
    const turnsAvailable =
      !turns.missingVendPrices && turns.overallTurnsPerDay != null;
    const lowTurnsRisk =
      turnsAvailable && turns.overallTurnsPerDay != null && turns.overallTurnsPerDay < 3;

    equipmentOperating = {
      turnsAvailable,
      turnsPerDay: turns.overallTurnsPerDay,
      lowTurnsRisk,
      turns,
    };

    if (lowTurnsRisk && turns.overallTurnsPerDay != null) {
      valueRisks.push(
        `Low washer utilization (${turns.overallTurnsPerDay.toFixed(1)} turns/day) — verify revenue or pricing assumptions`
      );
    }
  } else {
    equipmentOperating = {
      turnsAvailable: false,
      turnsPerDay: null,
      lowTurnsRisk: false,
      turns: null,
    };
  }

  const result: StoreValuationResult = {
    ...valuation,
    valueRisks,
    store: store ?? {},
    context: ctx,
    annualEbitda,
    ttmMonthsUsed,
    ttmRevenue: ttm?.ttmRevenue ?? 0,
    ttmEbitda: ttm?.ttmEbitda ?? 0,
    ttmDscr: ttm?.dscr ?? 0,
    equipmentOperating,
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
    return { totalValue: 0, storeValuations: [] as { store: Record<string, unknown>; valuation: ValuationResult & { store: Record<string, unknown> } }[] };
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
