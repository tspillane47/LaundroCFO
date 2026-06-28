import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { resolveStoreFinancials, type ResolvedStoreFinancials } from "@/lib/getStoreValuation";
import { calcValuation, type ValuationInputs, type ValuationResult } from "@/lib/valuation";

export type ScenarioResult = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  currentValue: number;
  scenarioValue: number;
  valueImpact: number;
  pctChange: number;
  newEbitda: number;
  newMultiple: number;
  detail: Record<string, string | number>;
  note: string;
};

export type StoreScenarioContext = {
  store: Record<string, unknown>;
  equipment: EquipmentRecord[];
  totalLeaseControl: number;
  leaseYearsRemaining: number;
  isOwnerOccupied: boolean;
  realEstateValue: number;
  resolvedFinancials?: ResolvedStoreFinancials;
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(String(value).split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function calcYearsRemaining(endDate: string | null | undefined): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  return Math.max(0, (end.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000));
}

function normalizeMarketDensity(raw: string | null | undefined): string {
  const v = (raw ?? "average").toLowerCase();
  if (v === "urban" || v === "dense_urban") return "urban";
  if (v === "suburban") return "suburban";
  if (v === "rural") return "rural";
  return "average";
}

function normalizeStoreCondition(raw: string | null | undefined): string {
  const v = (raw ?? "fair").toLowerCase();
  if (v === "excellent" || v === "remodeled") return "excellent";
  if (v === "good") return "good";
  if (v === "poor" || v === "needs_renovation") return "poor";
  return "fair";
}

export function buildValuationInputs(
  ctx: StoreScenarioContext,
  overrides: {
    monthlyRevenue?: number;
    monthlyExpenses?: number;
    avgEquipmentAge?: number;
    equipmentScore?: number;
    pct200G?: number;
    totalLeaseControl?: number;
    leaseYearsRemaining?: number;
    wdfPct?: number;
    commercialPct?: number;
    pickupDeliveryPct?: number;
    selfServicePct?: number;
    lastRetoolYear?: number;
    revenueTrend?: string;
  } = {}
): ValuationInputs {
  const store = ctx.store;
  const resolved = ctx.resolvedFinancials ?? resolveStoreFinancials(store);
  const monthlyRevenue = overrides.monthlyRevenue ?? resolved.monthlyRevenue;
  const monthlyExpenses = overrides.monthlyExpenses ?? resolved.monthlyExpenses;
  const equipMetrics = computeEquipmentMetrics(ctx.equipment);
  const wdfPct = overrides.wdfPct ?? (store.wdf_pct != null ? Number(store.wdf_pct) : 18);
  const commercialPct = overrides.commercialPct ?? (store.commercial_pct != null ? Number(store.commercial_pct) : 12);
  const pickupDeliveryPct = overrides.pickupDeliveryPct ?? (Number(store.pickup_delivery_pct) || 0);
  const selfServicePct =
    overrides.selfServicePct ??
    Math.max(0, 100 - wdfPct - commercialPct - pickupDeliveryPct);

  return {
    ebitda: (monthlyRevenue - monthlyExpenses) * 12,
    monthlyRevenue,
    squareFootage: Number(store.square_footage) || 3500,
    avgEquipmentAge:
      overrides.avgEquipmentAge ??
      (equipMetrics.totalMachines > 0 ? equipMetrics.weightedAvgAge : Number(store.avg_machine_age) || 6),
    pct200G: overrides.pct200G ?? equipMetrics.pct200GWashers,
    equipmentScore:
      overrides.equipmentScore ??
      (equipMetrics.totalMachines > 0 ? equipMetrics.qualityScore : 85),
    totalLeaseControl: overrides.totalLeaseControl ?? ctx.totalLeaseControl,
    leaseYearsRemaining: overrides.leaseYearsRemaining ?? ctx.leaseYearsRemaining,
    occupancyType: ctx.isOwnerOccupied ? "owned" : "leased",
    marketDensity: normalizeMarketDensity(
      (store.market_density as string) ?? (store.location_type as string)
    ),
    storeCondition: normalizeStoreCondition(store.store_condition as string),
    lastRetoolYear: overrides.lastRetoolYear ?? (Number(store.last_retool_year) || undefined),
    retoolInvestment: Number(store.retool_investment) || undefined,
    retoolType: (store.retool_type as string) || undefined,
    revenueTrend: overrides.revenueTrend ?? ((store.revenue_trend as string) || "stable"),
    competitionLevel: (store.competition_level as string) || "normal",
    selfServicePct,
    wdfPct,
    commercialPct,
    pickupDeliveryPct,
    realEstateValue: ctx.isOwnerOccupied ? ctx.realEstateValue : undefined,
  };
}

function runValuation(ctx: StoreScenarioContext, overrides: Parameters<typeof buildValuationInputs>[1] = {}): ValuationResult {
  return calcValuation(buildValuationInputs(ctx, overrides));
}

function makeScenario(
  base: Omit<ScenarioResult, "currentValue" | "scenarioValue" | "valueImpact" | "pctChange"> & {
    baselineValue: number;
    scenarioValue: number;
    newEbitda: number;
    newMultiple: number;
  }
): ScenarioResult {
  const valueImpact = base.scenarioValue - base.baselineValue;
  const pctChange = base.baselineValue > 0 ? (valueImpact / base.baselineValue) * 100 : 0;
  return {
    id: base.id,
    emoji: base.emoji,
    title: base.title,
    description: base.description,
    currentValue: Math.round(base.baselineValue),
    scenarioValue: Math.round(base.scenarioValue),
    valueImpact: Math.round(valueImpact),
    pctChange,
    newEbitda: Math.round(base.newEbitda),
    newMultiple: base.newMultiple,
    detail: base.detail,
    note: base.note,
  };
}

export function computeScenarios(ctx: StoreScenarioContext): ScenarioResult[] {
  const store = ctx.store;
  const resolved = ctx.resolvedFinancials ?? resolveStoreFinancials(store);
  const monthlyRevenue = resolved.monthlyRevenue;
  const monthlyExpenses = resolved.monthlyExpenses;
  const annualEbitda = (monthlyRevenue - monthlyExpenses) * 12;
  const commercialPct = store.commercial_pct != null ? Number(store.commercial_pct) : 12;
  const wdfPct = store.wdf_pct != null ? Number(store.wdf_pct) : 18;
  const currentYear = new Date().getFullYear();

  const baseline = runValuation(ctx);
  const baselineValue = baseline.businessValue;

  const retool = runValuation(ctx, {
    avgEquipmentAge: 1,
    equipmentScore: 99,
    pct200G: Math.max(computeEquipmentMetrics(ctx.equipment).pct200GWashers, 55),
    lastRetoolYear: currentYear,
  });

  const revenue10Monthly = monthlyRevenue * 1.1;
  const revenue10 = runValuation(ctx, { monthlyRevenue: revenue10Monthly });

  const utilitySavingsMonthly = monthlyRevenue * 0.03;
  const utility = runValuation(ctx, {
    monthlyExpenses: Math.max(0, monthlyExpenses - utilitySavingsMonthly),
  });

  const leaseExt = runValuation(ctx, {
    leaseYearsRemaining: ctx.leaseYearsRemaining + 5,
    totalLeaseControl: ctx.totalLeaseControl + 5,
  });

  const wdfMonthlyRevenue = monthlyRevenue + 6000;
  const wdfAnnual = wdfMonthlyRevenue * 12;
  const newWdfPct = wdfAnnual > 0 ? Math.min(100, wdfPct + (72000 / wdfAnnual) * 100) : wdfPct + 10;
  const wdf = runValuation(ctx, {
    monthlyRevenue: wdfMonthlyRevenue,
    wdfPct: newWdfPct,
    selfServicePct: Math.max(0, 100 - newWdfPct - commercialPct - (Number(store.pickup_delivery_pct) || 0)),
  });

  const rentIncrease = runValuation(ctx, {
    monthlyExpenses: monthlyExpenses + 2000,
  });

  const commercialLossMonthly = monthlyRevenue * (commercialPct / 100);
  const commercialMonthly = Math.max(0, monthlyRevenue - commercialLossMonthly);
  const newCommercialPct = 0;
  const commercial = runValuation(ctx, {
    monthlyRevenue: commercialMonthly,
    commercialPct: newCommercialPct,
    selfServicePct: Math.max(0, 100 - wdfPct - newCommercialPct - (Number(store.pickup_delivery_pct) || 0)),
  });

  const pdMonthlyRevenue = monthlyRevenue + 10000;
  const pdMonthlyExpenses = monthlyExpenses + 6500;
  const pdAnnual = pdMonthlyRevenue * 12;
  const newPdPct = pdAnnual > 0 ? Math.min(100, (Number(store.pickup_delivery_pct) || 0) + (120000 / pdAnnual) * 100) : 15;
  const pd = runValuation(ctx, {
    monthlyRevenue: pdMonthlyRevenue,
    monthlyExpenses: pdMonthlyExpenses,
    pickupDeliveryPct: newPdPct,
    selfServicePct: Math.max(0, 100 - wdfPct - commercialPct - newPdPct),
  });

  return [
    makeScenario({
      id: "retool",
      emoji: "🔧",
      title: "Retool with New Equipment",
      description: "Replace full washer/dryer fleet",
      baselineValue,
      scenarioValue: retool.businessValue,
      newEbitda: annualEbitda,
      newMultiple: retool.finalMultiple,
      detail: {
        investment: 395000,
        newAvgAge: 1,
        newEquipmentScore: 99,
        multipleImpact: `+${(retool.finalMultiple - baseline.finalMultiple).toFixed(2)}x`,
      },
      note: "New equipment lowers avg age to 1yr and boosts valuation multiple through equipment quality adjustments.",
    }),
    makeScenario({
      id: "revenue",
      emoji: "📈",
      title: "Increase Revenue 10%",
      description: "Add WDF, extend hours, marketing",
      baselineValue,
      scenarioValue: revenue10.businessValue,
      newEbitda: (revenue10Monthly - monthlyExpenses) * 12,
      newMultiple: revenue10.finalMultiple,
      detail: {
        newRevenue: Math.round(revenue10Monthly * 12),
        revenueGain: Math.round(monthlyRevenue * 0.1 * 12),
        newEbitdaMargin:
          revenue10Monthly > 0
            ? `${(((revenue10Monthly - monthlyExpenses) / revenue10Monthly) * 100).toFixed(1)}%`
            : "—",
      },
      note: "10% revenue growth lifts annual EBITDA and store value proportionally.",
    }),
    makeScenario({
      id: "utility",
      emoji: "⚡",
      title: "Reduce Utility Ratio 3%",
      description: "Solar, LED, efficient equipment",
      baselineValue,
      scenarioValue: utility.businessValue,
      newEbitda: (monthlyRevenue - Math.max(0, monthlyExpenses - utilitySavingsMonthly)) * 12,
      newMultiple: utility.finalMultiple,
      detail: {
        annualSavings: Math.round(utilitySavingsMonthly * 12),
        newUtilityRatio: monthlyRevenue > 0 ? `${(3).toFixed(1)}% reduction` : "—",
        newEbitda: Math.round((monthlyRevenue - Math.max(0, monthlyExpenses - utilitySavingsMonthly)) * 12),
      },
      note: "Cutting utility costs by 3% of revenue flows directly to EBITDA and valuation.",
    }),
    makeScenario({
      id: "lease",
      emoji: "📋",
      title: "Extend Lease 5 Years",
      description: "Negotiate early extension with landlord",
      baselineValue,
      scenarioValue: leaseExt.businessValue,
      newEbitda: annualEbitda,
      newMultiple: leaseExt.finalMultiple,
      detail: {
        newYearsRemaining: `${(ctx.leaseYearsRemaining + 5).toFixed(1)} yrs`,
        newTotalControl: `${(ctx.totalLeaseControl + 5).toFixed(1)} yrs`,
        multipleImpact: `+${(leaseExt.finalMultiple - baseline.finalMultiple).toFixed(2)}x`,
      },
      note: "Extending lease control improves lender confidence and adds to the valuation multiple.",
    }),
    makeScenario({
      id: "wdf",
      emoji: "👕",
      title: "Add WDF Service",
      description: "Wash-dry-fold at $1.75/lb",
      baselineValue,
      scenarioValue: wdf.businessValue,
      newEbitda: (wdfMonthlyRevenue - monthlyExpenses) * 12,
      newMultiple: wdf.finalMultiple,
      detail: {
        revenueGain: 72000,
        newRevenue: Math.round(wdfMonthlyRevenue * 12),
        newWdfPct: `${newWdfPct.toFixed(1)}%`,
      },
      note: "WDF adds high-margin recurring revenue with minimal equipment cost.",
    }),
    makeScenario({
      id: "rent",
      emoji: "⬆️",
      title: "Rent Increase",
      description: "Landlord raises rent at renewal",
      baselineValue,
      scenarioValue: rentIncrease.businessValue,
      newEbitda: (monthlyRevenue - (monthlyExpenses + 2000)) * 12,
      newMultiple: rentIncrease.finalMultiple,
      detail: {
        newMonthlyRent: (Number(store.monthly_rent) || 0) + 2000,
        ebitdaImpact: -24000,
        newAnnualEbitda: Math.round((monthlyRevenue - (monthlyExpenses + 2000)) * 12),
      },
      note: "A $2,000/mo rent increase compresses EBITDA and reduces store value.",
    }),
    makeScenario({
      id: "commercial",
      emoji: "🏢",
      title: "Lose Commercial Account",
      description: "Lose hotel/restaurant contract",
      baselineValue,
      scenarioValue: commercial.businessValue,
      newEbitda: (commercialMonthly - monthlyExpenses) * 12,
      newMultiple: commercial.finalMultiple,
      detail: {
        revenueLoss: Math.round(commercialLossMonthly * 12),
        commercialPctLost: `${commercialPct}%`,
        newRevenue: Math.round(commercialMonthly * 12),
      },
      note: `Losing commercial revenue (${commercialPct}% of sales) materially reduces EBITDA and value.`,
    }),
    makeScenario({
      id: "delivery",
      emoji: "🚐",
      title: "Add Pickup & Delivery",
      description: "Driver + van + route optimization",
      baselineValue,
      scenarioValue: pd.businessValue,
      newEbitda: (pdMonthlyRevenue - pdMonthlyExpenses) * 12,
      newMultiple: pd.finalMultiple,
      detail: {
        revenueGain: 120000,
        addedCosts: 78000,
        netEbitdaGain: Math.round((pdMonthlyRevenue - pdMonthlyExpenses) * 12 - annualEbitda),
        newRevenue: Math.round(pdMonthlyRevenue * 12),
      },
      note: "P&D adds $120k/yr revenue with ~$78k/yr in added operating costs.",
    }),
  ];
}
