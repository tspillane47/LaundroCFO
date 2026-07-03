import { calcDSCR } from "@/lib/calculations";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { resolveStoreFinancials, type ResolvedStoreFinancials } from "@/lib/getStoreValuation";
import { calcValuation, type ValuationInputs, type ValuationResult } from "@/lib/valuation";

export const SCENARIO_ICON_NAMES = [
  "Wrench",
  "TrendingUp",
  "Zap",
  "Building2",
  "Shirt",
  "ArrowUp",
  "BriefcaseBusiness",
  "Truck",
] as const;

export type ScenarioIconName = (typeof SCENARIO_ICON_NAMES)[number];

export type ScenarioResult = {
  id: string;
  icon: ScenarioIconName;
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
  /** Annual debt service for DSCR (TTM or loan schedule). */
  annualDebtService?: number;
};

export type ScenarioInputParams = {
  retool: { investment: number; equipmentAge: number };
  revenue: { increasePct: number };
  utility: { reductionPct: number };
  lease: { yearsToExtend: number };
  wdf: { wdfPct: number; pricePerLb: number };
  rent: { increasePct: number };
  commercial: { revenueLossPct: number };
  delivery: { routeRevenueMonthly: number };
};

export type InteractiveScenarioResult = ScenarioResult & {
  baselineDscr: number | null;
  newDscr: number | null;
  currentEbitda: number;
  ebitdaChange: number;
  monthlyCashFlowImpact: number;
  investmentRequired: number | null;
  paybackMonths: number | null;
  breakEvenMonths: number | null;
};

export type RankedScenario = InteractiveScenarioResult & {
  rank: number;
  opportunityReason: string;
};

export const SCENARIO_IDS = [
  "retool",
  "revenue",
  "utility",
  "lease",
  "wdf",
  "rent",
  "commercial",
  "delivery",
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

const INVESTMENT_SCENARIO_IDS = new Set<ScenarioId>(["retool", "wdf", "delivery"]);

const WDF_STARTUP_COST = 15_000;
const DELIVERY_STARTUP_COST = 35_000;

export function isInvestmentScenario(id: string): boolean {
  return INVESTMENT_SCENARIO_IDS.has(id as ScenarioId);
}

export function getScenarioInvestment(
  scenarioId: string,
  params: ScenarioInputParams
): number | null {
  switch (scenarioId) {
    case "retool":
      return params.retool.investment;
    case "wdf":
      return WDF_STARTUP_COST;
    case "delivery":
      return DELIVERY_STARTUP_COST;
    default:
      return null;
  }
}

export function calcPaybackMonths(
  investment: number,
  annualEbitdaIncrease: number,
  valueImpact: number
): number | null {
  if (investment <= 0) return null;
  const annualBenefit =
    annualEbitdaIncrease > 0 ? annualEbitdaIncrease : valueImpact > 0 ? valueImpact : 0;
  if (annualBenefit <= 0) return null;
  return (investment / annualBenefit) * 12;
}

function enrichInteractiveResult(
  ctx: StoreScenarioContext,
  scenarioId: string,
  params: ScenarioInputParams,
  base: Omit<
    InteractiveScenarioResult,
    | "currentEbitda"
    | "ebitdaChange"
    | "monthlyCashFlowImpact"
    | "investmentRequired"
    | "paybackMonths"
    | "breakEvenMonths"
  > & { newEbitda: number }
): InteractiveScenarioResult {
  const resolved = ctx.resolvedFinancials ?? resolveStoreFinancials(ctx.store);
  const currentEbitda = resolved.annualEbitda;
  const ebitdaChange = base.newEbitda - currentEbitda;
  const monthlyCashFlowImpact = ebitdaChange / 12;
  const investmentRequired = getScenarioInvestment(scenarioId, params);
  const paybackMonths =
    investmentRequired != null
      ? calcPaybackMonths(investmentRequired, ebitdaChange, base.valueImpact)
      : null;
  const breakEvenMonths = paybackMonths;

  return {
    ...base,
    currentEbitda: Math.round(currentEbitda),
    ebitdaChange: Math.round(ebitdaChange),
    monthlyCashFlowImpact: Math.round(monthlyCashFlowImpact),
    investmentRequired,
    paybackMonths,
    breakEvenMonths,
  };
}

export const DEFAULT_SCENARIO_INPUTS: ScenarioInputParams = {
  retool: { investment: 395000, equipmentAge: 1 },
  revenue: { increasePct: 10 },
  utility: { reductionPct: 3 },
  lease: { yearsToExtend: 5 },
  wdf: { wdfPct: 25, pricePerLb: 1.75 },
  rent: { increasePct: 10 },
  commercial: { revenueLossPct: 12 },
  delivery: { routeRevenueMonthly: 10000 },
};

function retoolEquipmentScore(age: number): number {
  return Math.round(99 - ((age - 1) / 4) * 14);
}

const SCENARIO_META: Record<
  string,
  Pick<ScenarioResult, "id" | "icon" | "title" | "description" | "note">
> = {
  retool: {
    id: "retool",
    icon: "Wrench",
    title: "Retool with New Equipment",
    description: "Replace full washer/dryer fleet",
    note: "New equipment lowers avg age and boosts valuation multiple through equipment quality adjustments.",
  },
  revenue: {
    id: "revenue",
    icon: "TrendingUp",
    title: "Increase Revenue 10%",
    description: "Add WDF, extend hours, marketing",
    note: "Revenue growth lifts annual EBITDA and store value proportionally.",
  },
  utility: {
    id: "utility",
    icon: "Zap",
    title: "Reduce Utility Ratio 3%",
    description: "Solar, LED, efficient equipment",
    note: "Cutting utility costs flows directly to EBITDA and valuation.",
  },
  lease: {
    id: "lease",
    icon: "Building2",
    title: "Extend Lease 5 Years",
    description: "Negotiate early extension with landlord",
    note: "Extending lease control improves lender confidence and adds to the valuation multiple.",
  },
  wdf: {
    id: "wdf",
    icon: "Shirt",
    title: "Add WDF Service",
    description: "Wash-dry-fold service line",
    note: "WDF adds high-margin recurring revenue with minimal equipment cost.",
  },
  rent: {
    id: "rent",
    icon: "ArrowUp",
    title: "Rent Increase",
    description: "Landlord raises rent at renewal",
    note: "A rent increase compresses EBITDA and reduces store value.",
  },
  commercial: {
    id: "commercial",
    icon: "BriefcaseBusiness",
    title: "Lose Commercial Account",
    description: "Lose hotel/restaurant contract",
    note: "Losing commercial revenue materially reduces EBITDA and value.",
  },
  delivery: {
    id: "delivery",
    icon: "Truck",
    title: "Add Pickup & Delivery",
    description: "Driver + van + route optimization",
    note: "P&D adds route revenue with incremental operating costs.",
  },
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
    retoolInvestment?: number;
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
    retoolInvestment: overrides.retoolInvestment ?? (Number(store.retool_investment) || undefined),
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
  const pctChange =
    base.baselineValue > 0 && Number.isFinite(valueImpact)
      ? (valueImpact / base.baselineValue) * 100
      : 0;
  return {
    id: base.id,
    icon: base.icon,
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
      icon: "Wrench",
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
      icon: "TrendingUp",
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
      icon: "Zap",
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
      icon: "Building2",
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
      icon: "Shirt",
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
      icon: "ArrowUp",
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
      icon: "BriefcaseBusiness",
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
      icon: "Truck",
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

export function buildDefaultScenarioInputs(ctx: StoreScenarioContext): ScenarioInputParams {
  const store = ctx.store;
  const resolved = ctx.resolvedFinancials ?? resolveStoreFinancials(store);
  const monthlyRevenue = resolved.monthlyRevenue;
  const commercialPct = store.commercial_pct != null ? Number(store.commercial_pct) : 12;
  const wdfPct = store.wdf_pct != null ? Number(store.wdf_pct) : 18;
  const wdfMonthlyRevenue = monthlyRevenue + 6000;
  const wdfAnnual = wdfMonthlyRevenue * 12;
  const defaultWdfPct =
    wdfAnnual > 0 ? Math.min(40, wdfPct + (72000 / wdfAnnual) * 100) : Math.min(40, wdfPct + 10);

  const monthlyRent = Number(store.monthly_rent) || 0;
  const rentIncreasePct =
    monthlyRent > 0 ? Math.min(30, Math.round((2000 / monthlyRent) * 100)) : 10;

  return {
    ...DEFAULT_SCENARIO_INPUTS,
    wdf: { wdfPct: Math.round(defaultWdfPct), pricePerLb: 1.75 },
    rent: { increasePct: rentIncreasePct },
    commercial: { revenueLossPct: Math.min(30, Math.max(1, Math.round(commercialPct))) },
  };
}

export function computeInteractiveScenario(
  ctx: StoreScenarioContext,
  scenarioId: string,
  params: ScenarioInputParams
): InteractiveScenarioResult | null {
  const store = ctx.store;
  const resolved = ctx.resolvedFinancials ?? resolveStoreFinancials(store);
  const monthlyRevenue = resolved.monthlyRevenue;
  const monthlyExpenses = resolved.monthlyExpenses;
  const annualEbitda = (monthlyRevenue - monthlyExpenses) * 12;
  const commercialPct = store.commercial_pct != null ? Number(store.commercial_pct) : 12;
  const wdfPct = store.wdf_pct != null ? Number(store.wdf_pct) : 18;
  const pickupPct = Number(store.pickup_delivery_pct) || 0;
  const annualDebtService = ctx.annualDebtService ?? 0;
  const currentYear = new Date().getFullYear();
  const baseline = runValuation(ctx);
  const baselineValue = baseline.businessValue;
  const baselineDscr =
    annualDebtService > 0 ? calcDSCR(annualEbitda, annualDebtService) : null;

  const baseMeta = SCENARIO_META[scenarioId];
  if (!baseMeta) return null;

  let scenarioValuation: ValuationResult;
  let newEbitda: number;
  let detail: Record<string, string | number> = {};
  let newDscr: number | null = baselineDscr;

  switch (scenarioId) {
    case "retool": {
      const { investment, equipmentAge } = params.retool;
      scenarioValuation = runValuation(ctx, {
        avgEquipmentAge: equipmentAge,
        equipmentScore: retoolEquipmentScore(equipmentAge),
        pct200G: Math.max(computeEquipmentMetrics(ctx.equipment).pct200GWashers, 55),
        lastRetoolYear: currentYear,
        retoolInvestment: investment,
      });
      newEbitda = annualEbitda;
      detail = {
        investment,
        newAvgAge: equipmentAge,
        newEquipmentScore: retoolEquipmentScore(equipmentAge),
        multipleImpact: `${scenarioValuation.finalMultiple - baseline.finalMultiple >= 0 ? "+" : ""}${(scenarioValuation.finalMultiple - baseline.finalMultiple).toFixed(2)}x`,
      };
      break;
    }
    case "revenue": {
      const { increasePct } = params.revenue;
      const newMonthly = monthlyRevenue * (1 + increasePct / 100);
      scenarioValuation = runValuation(ctx, { monthlyRevenue: newMonthly });
      newEbitda = (newMonthly - monthlyExpenses) * 12;
      detail = {
        revenueIncrease: `${increasePct}%`,
        revenueGain: Math.round(monthlyRevenue * (increasePct / 100) * 12),
        newRevenue: Math.round(newMonthly * 12),
      };
      break;
    }
    case "utility": {
      const { reductionPct } = params.utility;
      const savingsMonthly = monthlyRevenue * (reductionPct / 100);
      const newExpenses = Math.max(0, monthlyExpenses - savingsMonthly);
      scenarioValuation = runValuation(ctx, { monthlyExpenses: newExpenses });
      newEbitda = (monthlyRevenue - newExpenses) * 12;
      detail = {
        annualSavings: Math.round(savingsMonthly * 12),
        utilityReduction: `${reductionPct}%`,
      };
      break;
    }
    case "lease": {
      const { yearsToExtend } = params.lease;
      scenarioValuation = runValuation(ctx, {
        leaseYearsRemaining: ctx.leaseYearsRemaining + yearsToExtend,
        totalLeaseControl: ctx.totalLeaseControl + yearsToExtend,
      });
      newEbitda = annualEbitda;
      detail = {
        yearsExtended: yearsToExtend,
        newYearsRemaining: `${(ctx.leaseYearsRemaining + yearsToExtend).toFixed(1)} yrs`,
        multipleImpact: `${scenarioValuation.finalMultiple - baseline.finalMultiple >= 0 ? "+" : ""}${(scenarioValuation.finalMultiple - baseline.finalMultiple).toFixed(2)}x`,
      };
      break;
    }
    case "wdf": {
      const { wdfPct: targetWdfPct, pricePerLb } = params.wdf;
      const nonWdfMonthly = monthlyRevenue * (1 - wdfPct / 100);
      const targetTotalMonthly =
        targetWdfPct >= 100 ? monthlyRevenue : nonWdfMonthly / (1 - targetWdfPct / 100);
      const baseAddedMonthly = Math.max(0, targetTotalMonthly - monthlyRevenue);
      const referencePrice = 1.75;
      const impliedLbsPerMonth =
        referencePrice > 0 ? baseAddedMonthly / referencePrice : 0;
      const addedMonthly = impliedLbsPerMonth * pricePerLb;
      const newMonthlyRevenue = monthlyRevenue + addedMonthly;
      const effectiveWdfPct =
        newMonthlyRevenue > 0
          ? Math.min(100, ((monthlyRevenue * wdfPct) / 100 + addedMonthly) / newMonthlyRevenue * 100)
          : targetWdfPct;
      scenarioValuation = runValuation(ctx, {
        monthlyRevenue: newMonthlyRevenue,
        wdfPct: effectiveWdfPct,
        selfServicePct: Math.max(0, 100 - effectiveWdfPct - commercialPct - pickupPct),
      });
      newEbitda = (newMonthlyRevenue - monthlyExpenses) * 12;
      detail = {
        newWdfPct: `${effectiveWdfPct.toFixed(1)}%`,
        pricePerLb: `$${pricePerLb.toFixed(2)}`,
        impliedLbsPerMonth: Math.round(impliedLbsPerMonth),
        revenueGain: Math.round(addedMonthly * 12),
      };
      break;
    }
    case "rent": {
      const { increasePct } = params.rent;
      const monthlyRent = Number(store.monthly_rent) || monthlyExpenses * 0.15;
      const rentIncrease = monthlyRent * (increasePct / 100);
      const newExpenses = monthlyExpenses + rentIncrease;
      scenarioValuation = runValuation(ctx, { monthlyExpenses: newExpenses });
      newEbitda = (monthlyRevenue - newExpenses) * 12;
      newDscr = annualDebtService > 0 ? calcDSCR(newEbitda, annualDebtService) : null;
      detail = {
        rentIncrease: `${increasePct}%`,
        monthlyRentIncrease: Math.round(rentIncrease),
        newMonthlyRent: Math.round(monthlyRent + rentIncrease),
        ebitdaImpact: Math.round(newEbitda - annualEbitda),
      };
      break;
    }
    case "commercial": {
      const { revenueLossPct } = params.commercial;
      const lossMonthly = monthlyRevenue * (revenueLossPct / 100);
      const newMonthly = Math.max(0, monthlyRevenue - lossMonthly);
      const newCommercialPct = Math.max(0, commercialPct - revenueLossPct);
      scenarioValuation = runValuation(ctx, {
        monthlyRevenue: newMonthly,
        commercialPct: newCommercialPct,
        selfServicePct: Math.max(0, 100 - wdfPct - newCommercialPct - pickupPct),
      });
      newEbitda = (newMonthly - monthlyExpenses) * 12;
      detail = {
        revenueLoss: Math.round(lossMonthly * 12),
        revenueLossPct: `${revenueLossPct}%`,
        newRevenue: Math.round(newMonthly * 12),
      };
      break;
    }
    case "delivery": {
      const { routeRevenueMonthly } = params.delivery;
      const addedCosts = routeRevenueMonthly * 0.65;
      const newMonthlyRevenue = monthlyRevenue + routeRevenueMonthly;
      const newMonthlyExpenses = monthlyExpenses + addedCosts;
      const pdAnnual = newMonthlyRevenue * 12;
      const addedPdPct =
        pdAnnual > 0 ? (routeRevenueMonthly * 12 / pdAnnual) * 100 : 0;
      const newPdPct = Math.min(100, pickupPct + addedPdPct);
      scenarioValuation = runValuation(ctx, {
        monthlyRevenue: newMonthlyRevenue,
        monthlyExpenses: newMonthlyExpenses,
        pickupDeliveryPct: newPdPct,
        selfServicePct: Math.max(0, 100 - wdfPct - commercialPct - newPdPct),
      });
      newEbitda = (newMonthlyRevenue - newMonthlyExpenses) * 12;
      detail = {
        routeRevenueMonthly,
        addedCosts: Math.round(addedCosts * 12),
        revenueGain: Math.round(routeRevenueMonthly * 12),
        netEbitdaGain: Math.round(newEbitda - annualEbitda),
      };
      break;
    }
    default:
      return null;
  }

  const result = makeScenario({
    id: baseMeta.id,
    icon: baseMeta.icon,
    title: baseMeta.title,
    description: baseMeta.description,
    baselineValue,
    scenarioValue: scenarioValuation.businessValue,
    newEbitda,
    newMultiple: scenarioValuation.finalMultiple,
    detail,
    note: baseMeta.note,
  });

  return enrichInteractiveResult(ctx, scenarioId, params, {
    ...result,
    baselineDscr,
    newDscr,
  });
}

export function computeAllInteractiveScenarios(
  ctx: StoreScenarioContext,
  params: ScenarioInputParams
): InteractiveScenarioResult[] {
  return SCENARIO_IDS.map((id) => computeInteractiveScenario(ctx, id, params)).filter(
    (s): s is InteractiveScenarioResult => s != null
  );
}

function buildOpportunityReason(
  scenario: InteractiveScenarioResult,
  ctx: StoreScenarioContext
): string {
  const store = ctx.store;
  const baselineMultiple = runValuation(ctx).finalMultiple;

  switch (scenario.id) {
    case "retool":
      return `New equipment would lift your multiple from ${baselineMultiple.toFixed(2)}x to ${scenario.newMultiple.toFixed(2)}x, adding ${fmtCompact(scenario.valueImpact)} in business value.`;
    case "revenue":
      return `A ${scenario.detail.revenueIncrease ?? "10%"} revenue lift flows almost entirely to EBITDA at your current ${fmtCompact(scenario.currentEbitda)} annual base.`;
    case "utility":
      return `Utility savings drop straight to the bottom line with no revenue risk — worth ${fmtCompact(scenario.valueImpact)} at your current valuation multiple.`;
    case "lease":
      return `With ${ctx.leaseYearsRemaining.toFixed(1)} years remaining, extending lease control strengthens lender confidence and adds ${fmtCompact(scenario.valueImpact)} in value.`;
    case "wdf":
      return `WDF is high-margin revenue; at ${scenario.detail.newWdfPct ?? "25%"} of sales it adds ${fmtCompact(scenario.ebitdaChange)} in annual EBITDA.`;
    case "rent":
      return `A rent hike would compress EBITDA by ${fmtCompact(Math.abs(scenario.ebitdaChange))}/yr — know the downside before renewal talks.`;
    case "commercial":
      return `Commercial accounts typically represent ${store.commercial_pct ?? 12}% of your revenue; losing that volume cuts value by ${fmtCompact(Math.abs(scenario.valueImpact))}.`;
    case "delivery":
      return `Route revenue adds recurring cash flow with ${fmtCompact(scenario.ebitdaChange)} net annual EBITDA after route costs.`;
    default:
      return scenario.note;
  }
}

function fmtCompact(n: number): string {
  const abs = Math.abs(Math.round(n));
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(abs / 1_000)}K`;
  return `$${abs.toLocaleString()}`;
}

export function rankScenariosByImpact(
  ctx: StoreScenarioContext,
  params: ScenarioInputParams
): RankedScenario[] {
  const all = computeAllInteractiveScenarios(ctx, params);
  const sorted = [...all].sort((a, b) => b.valueImpact - a.valueImpact);
  return sorted.map((scenario, index) => ({
    ...scenario,
    rank: index + 1,
    opportunityReason: buildOpportunityReason(scenario, ctx),
  }));
}

export function buildScenarioNarrative(
  scenario: InteractiveScenarioResult,
  ctx: StoreScenarioContext,
  params: ScenarioInputParams
): string {
  const baseline = runValuation(ctx);
  const parts: string[] = [];

  parts.push(
    `At your current EBITDA of $${scenario.currentEbitda.toLocaleString()}, this scenario ${scenario.valueImpact >= 0 ? "increases" : "reduces"} store value by ${scenario.valueImpact >= 0 ? "+" : "−"}$${Math.abs(scenario.valueImpact).toLocaleString()} (${Math.abs(scenario.pctChange).toFixed(1)}%).`
  );

  if (scenario.id === "retool" || scenario.id === "lease") {
    parts.push(
      `Your valuation multiple would move from ${baseline.finalMultiple.toFixed(2)}x to ${scenario.newMultiple.toFixed(2)}x.`
    );
  } else {
    parts.push(
      `EBITDA would ${scenario.ebitdaChange >= 0 ? "rise" : "fall"} by ${scenario.ebitdaChange >= 0 ? "+" : "−"}$${Math.abs(scenario.ebitdaChange).toLocaleString()}/yr to $${scenario.newEbitda.toLocaleString()}.`
    );
  }

  const investment = getScenarioInvestment(scenario.id, params);
  if (investment != null && investment > 0 && scenario.paybackMonths != null) {
    const paybackYears = scenario.paybackMonths / 12;
    parts.push(
      `The $${investment.toLocaleString()} investment has a payback period of ${paybackYears.toFixed(1)} years based on the $${Math.max(scenario.ebitdaChange, scenario.valueImpact).toLocaleString()} annual benefit.`
    );
  }

  if (scenario.baselineDscr != null && scenario.newDscr != null && ctx.annualDebtService) {
    const dscrNote =
      scenario.newDscr >= 1.25
        ? `Your DSCR would remain above the 1.25x minimum (${scenario.newDscr.toFixed(2)}x).`
        : scenario.newDscr < scenario.baselineDscr
          ? `DSCR would drop from ${scenario.baselineDscr.toFixed(2)}x to ${scenario.newDscr.toFixed(2)}x — monitor lender covenant risk.`
          : `DSCR improves from ${scenario.baselineDscr.toFixed(2)}x to ${scenario.newDscr.toFixed(2)}x.`;
    parts.push(dscrNote);
  }

  return parts.slice(0, 3).join(" ");
}

export function formatPayback(months: number | null): string {
  if (months == null || !Number.isFinite(months)) return "—";
  if (months < 12) return `${Math.round(months)} mo`;
  return `${(months / 12).toFixed(1)} yr`;
}

export function formatRank(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}
