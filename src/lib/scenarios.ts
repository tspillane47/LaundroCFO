import { fmtDollar } from "@/lib/calculations";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { resolveSquareFootage } from "@/lib/storeCanonical";
import { calcValuation, type ValuationInputs, type ValuationResult } from "@/lib/valuation";

export type ScenarioId =
  | "retool"
  | "revenue"
  | "utility"
  | "lease"
  | "wdf"
  | "rent"
  | "commercial"
  | "delivery";

export type ScenarioResult = {
  id: ScenarioId;
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
  tip: string;
  slider?: ScenarioSliderConfig;
};

export type ScenarioSliderConfig = {
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  format: (value: number) => string;
};

export type ScenarioFinancials = {
  monthlyRevenue: number;
  monthlyExpenses: number;
  waterKpi: {
    ratio: number;
    status: "Healthy" | "Watch" | "High";
    waterMonthlyAverage: number;
    selfServiceMonthlyAverage: number;
  };
};

export type StoreScenarioContext = {
  store: Record<string, unknown>;
  equipment: EquipmentRecord[];
  totalLeaseControl: number;
  isOwnerOccupied: boolean;
  realEstateValue: number;
  leaseMonthlyRent?: number | null;
  financials?: ScenarioFinancials | null;
};

export type ScenarioParams = Partial<Record<ScenarioId, number>>;

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
    wdfPct?: number;
    commercialPct?: number;
    pickupDeliveryPct?: number;
    selfServicePct?: number;
    lastRetoolYear?: number;
    revenueTrend?: string;
  } = {}
): ValuationInputs {
  const store = ctx.store;
  const monthlyRevenue = overrides.monthlyRevenue ?? (Number(store.monthly_revenue) || 0);
  const monthlyExpenses = overrides.monthlyExpenses ?? (Number(store.monthly_expenses) || 0);
  const equipMetrics = computeEquipmentMetrics(ctx.equipment);
  const wdfPct = overrides.wdfPct ?? (Number(store.wdf_pct) || 18);
  const commercialPct = overrides.commercialPct ?? (Number(store.commercial_pct) || 12);
  const pickupDeliveryPct = overrides.pickupDeliveryPct ?? (Number(store.pickup_delivery_pct) || 0);
  const selfServicePct =
    overrides.selfServicePct ??
    Math.max(0, 100 - wdfPct - commercialPct - pickupDeliveryPct);

  return {
    ebitda: (monthlyRevenue - monthlyExpenses) * 12,
    monthlyRevenue,
    squareFootage: resolveSquareFootage(store, null, null) ?? 3500,
    avgEquipmentAge:
      overrides.avgEquipmentAge ??
      (equipMetrics.totalMachines > 0 ? equipMetrics.weightedAvgAge : Number(store.avg_machine_age) || 6),
    pct200G: overrides.pct200G ?? equipMetrics.pct200GWashers,
    equipmentScore:
      overrides.equipmentScore ??
      (equipMetrics.totalMachines > 0 ? equipMetrics.qualityScore : 85),
    totalLeaseControl: overrides.totalLeaseControl ?? ctx.totalLeaseControl,
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

function runValuation(
  ctx: StoreScenarioContext,
  overrides: Parameters<typeof buildValuationInputs>[1] = {}
): ValuationResult {
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
    tip: base.tip,
    slider: base.slider,
  };
}

export type RetoolInvestmentBounds = {
  min: number;
  max: number;
  default: number;
  fullFleet: number;
};

/** Full-fleet retool reference investment and slider bounds for this store's equipment. */
export function getRetoolInvestmentBounds(ctx: StoreScenarioContext): RetoolInvestmentBounds {
  const equipMetrics = computeEquipmentMetrics(ctx.equipment);
  const storeFullFleet = Number(ctx.store.retool_investment) || 0;
  const inventoryFullFleet = equipMetrics.estimatedReplacementValue;
  const fullFleet =
    storeFullFleet > 0
      ? storeFullFleet
      : inventoryFullFleet > 0
        ? inventoryFullFleet
        : 395000;
  const min = Math.max(50000, Math.round(fullFleet * 0.1));
  const max = Math.max(fullFleet, inventoryFullFleet > 0 ? inventoryFullFleet : fullFleet);
  return { min, max, default: fullFleet, fullFleet };
}

function retoolFraction(investment: number, fullFleet: number): number {
  if (fullFleet <= 0) return 0;
  return Math.min(1, Math.max(0, investment / fullFleet));
}

function buildRetoolOverrides(
  ctx: StoreScenarioContext,
  investment: number,
  equipMetrics: ReturnType<typeof computeEquipmentMetrics>,
  currentYear: number
): {
  avgEquipmentAge: number;
  equipmentScore: number;
  pct200G: number;
  lastRetoolYear?: number;
} {
  const store = ctx.store;
  const { fullFleet } = getRetoolInvestmentBounds(ctx);
  const fraction = retoolFraction(investment, fullFleet);

  const currentAvgAge =
    equipMetrics.totalMachines > 0
      ? equipMetrics.weightedAvgAge
      : Number(store.avg_machine_age) || 6;
  const currentScore =
    equipMetrics.totalMachines > 0 ? equipMetrics.qualityScore : 85;
  const currentPct200G = equipMetrics.pct200GWashers;
  const targetAvgAge = 1;
  const targetScore = 99;
  const targetPct200G = Math.max(currentPct200G, 55);

  const overrides: {
    avgEquipmentAge: number;
    equipmentScore: number;
    pct200G: number;
    lastRetoolYear?: number;
  } = {
    avgEquipmentAge: currentAvgAge + (targetAvgAge - currentAvgAge) * fraction,
    equipmentScore: currentScore + (targetScore - currentScore) * fraction,
    pct200G: currentPct200G + (targetPct200G - currentPct200G) * fraction,
  };

  if (fraction >= 1) {
    overrides.lastRetoolYear = currentYear;
  }

  return overrides;
}

function getUtilitySliderConfig(ctx: StoreScenarioContext): ScenarioSliderConfig | null {
  if (!ctx.financials?.waterKpi) return null;
  const currentPct = ctx.financials.waterKpi.ratio * 100;
  const minPct = Math.max(5, Math.min(10, currentPct - 10));
  const maxPct = Math.max(minPct, currentPct);
  return {
    label: "Water KPI (target)",
    min: minPct,
    max: maxPct,
    step: 0.5,
    default: maxPct,
    format: (v) => `${v.toFixed(1)}%`,
  };
}

export function getScenarioSliderDefaults(ctx: StoreScenarioContext): ScenarioParams {
  const retoolBounds = getRetoolInvestmentBounds(ctx);
  const utilitySlider = getUtilitySliderConfig(ctx);
  const defaults: ScenarioParams = {
    retool: retoolBounds.default,
    revenue: 10,
    utility: utilitySlider?.default ?? 3,
    wdf: 6000,
    rent: 2000,
    commercial: 100,
    delivery: 10000,
  };
  if (!ctx.isOwnerOccupied) {
    defaults.lease = 5;
  }
  return defaults;
}

export function computeScenario(
  ctx: StoreScenarioContext,
  id: ScenarioId,
  param: number,
  baselineValue: number,
  baseline: ValuationResult
): ScenarioResult | null {
  const store = ctx.store;
  const monthlyRevenue = Number(store.monthly_revenue) || 0;
  const monthlyExpenses = Number(store.monthly_expenses) || 0;
  const annualEbitda = (monthlyRevenue - monthlyExpenses) * 12;
  const commercialPct = Number(store.commercial_pct) || 12;
  const wdfPct = Number(store.wdf_pct) || 18;
  const pickupDeliveryPct = Number(store.pickup_delivery_pct) || 0;
  const currentYear = new Date().getFullYear();
  const equipMetrics = computeEquipmentMetrics(ctx.equipment);

  switch (id) {
    case "retool": {
      const bounds = getRetoolInvestmentBounds(ctx);
      const investment = Math.min(bounds.max, Math.max(bounds.min, param));
      const fraction = retoolFraction(investment, bounds.fullFleet);
      const overrides = buildRetoolOverrides(ctx, investment, equipMetrics, currentYear);
      const retool = runValuation(ctx, overrides);
      const scaledAvgAge = overrides.avgEquipmentAge;
      const scaledScore = overrides.equipmentScore;
      const scaledPct200G = overrides.pct200G;

      return makeScenario({
        id: "retool",
        emoji: "🔧",
        title: "Retool with New Equipment",
        description: "Replace washer/dryer fleet (scaled to investment)",
        baselineValue,
        scenarioValue: retool.businessValue,
        newEbitda: annualEbitda,
        newMultiple: retool.finalMultiple,
        detail: {
          investment: Math.round(investment),
          fleetShare: `${Math.round(fraction * 100)}% of full fleet`,
          newAvgAge: Number(scaledAvgAge.toFixed(1)),
          newEquipmentScore: Math.round(scaledScore),
          multipleImpact: `+${(retool.finalMultiple - baseline.finalMultiple).toFixed(2)}x`,
        },
        note:
          fraction >= 1
            ? "Full fleet retool lowers avg age to ~1 yr and maximizes equipment multiple adjustments."
            : `At ${Math.round(fraction * 100)}% of a full fleet retool, equipment age, quality score, and 200G share improve proportionally.`,
        tip: `Investment scales equipment outcomes between today's fleet and a full replacement (${fmtDollar(bounds.fullFleet)} reference). At full investment: avg age → 1 yr, quality score → 99, 200G+ share ≥ 55%, and recent-retool multiple bonus. EBITDA is unchanged; value lift is from the multiple.`,
        slider: {
          label: "Equipment investment",
          min: bounds.min,
          max: bounds.max,
          step: 25000,
          default: bounds.default,
          format: (v) => fmtDollar(v),
        },
      });
    }

    case "revenue": {
      const growthPct = param;
      const scenarioMonthlyRevenue = monthlyRevenue * (1 + growthPct / 100);
      const result = runValuation(ctx, { monthlyRevenue: scenarioMonthlyRevenue });
      const newEbitda = (scenarioMonthlyRevenue - monthlyExpenses) * 12;
      return makeScenario({
        id: "revenue",
        emoji: "📈",
        title: "Increase Revenue",
        description: "Add WDF, extend hours, marketing",
        baselineValue,
        scenarioValue: result.businessValue,
        newEbitda,
        newMultiple: result.finalMultiple,
        detail: {
          newRevenue: Math.round(scenarioMonthlyRevenue * 12),
          revenueGain: Math.round(monthlyRevenue * (growthPct / 100) * 12),
          newEbitdaMargin:
            scenarioMonthlyRevenue > 0
              ? `${(((scenarioMonthlyRevenue - monthlyExpenses) / scenarioMonthlyRevenue) * 100).toFixed(1)}%`
              : "—",
        },
        note: `${growthPct}% revenue growth lifts annual EBITDA and store value; a higher rev/SF ratio can also nudge the multiple.`,
        tip: "Increases monthly revenue by the selected percentage while holding expenses flat. EBITDA and business value (EBITDA × multiple) both rise; revenue per SF may improve the operations multiple tier.",
        slider: {
          label: "Revenue increase",
          min: 0,
          max: 25,
          step: 0.5,
          default: 10,
          format: (v) => `${v}%`,
        },
      });
    }

    case "utility": {
      const utilitySlider = getUtilitySliderConfig(ctx);

      if (ctx.financials && utilitySlider) {
        const {
          monthlyRevenue: plRevenue,
          monthlyExpenses: plExpenses,
          waterKpi,
        } = ctx.financials;
        const plBaseline = runValuation(ctx, {
          monthlyRevenue: plRevenue,
          monthlyExpenses: plExpenses,
        });
        const plBaselineValue = plBaseline.businessValue;
        const currentRatioPct = waterKpi.ratio * 100;
        const targetRatioPct = Math.min(
          currentRatioPct,
          Math.max(utilitySlider.min, param)
        );
        const targetRatio = targetRatioPct / 100;
        const newWaterMonthly = targetRatio * waterKpi.selfServiceMonthlyAverage;
        const waterSavingsMonthly = Math.max(0, waterKpi.waterMonthlyAverage - newWaterMonthly);
        const scenarioMonthlyExpenses = Math.max(0, plExpenses - waterSavingsMonthly);
        const result = runValuation(ctx, {
          monthlyRevenue: plRevenue,
          monthlyExpenses: scenarioMonthlyExpenses,
        });
        const newEbitda = (plRevenue - scenarioMonthlyExpenses) * 12;
        const reductionPct = currentRatioPct - targetRatioPct;

        return makeScenario({
          id: "utility",
          emoji: "⚡",
          title: "Reduce Water KPI",
          description: "Solar, LED, efficient equipment",
          baselineValue: plBaselineValue,
          scenarioValue: result.businessValue,
          newEbitda,
          newMultiple: result.finalMultiple,
          detail: {
            currentWaterKpi: `${currentRatioPct.toFixed(1)}%`,
            targetWaterKpi: `${targetRatioPct.toFixed(1)}%`,
            annualWaterSavings: Math.round(waterSavingsMonthly * 12),
            newEbitda: Math.round(newEbitda),
          },
          note:
            reductionPct > 0
              ? `Lowering Water KPI by ${reductionPct.toFixed(1)} pts (${fmtAnnual(waterSavingsMonthly)}/yr water savings) flows to EBITDA and valuation.`
              : "At the current Water KPI there is no modeled water savings.",
          tip: "Uses trailing P&L water cost and self-service revenue (same Water KPI as Financials → Current Monthly Averages). Sliding down reduces monthly water expense; EBITDA rises dollar-for-dollar. Multiple is unchanged.",
          slider: utilitySlider,
        });
      }

      const savingsPctOfRevenue = param;
      const utilitySavingsMonthly = monthlyRevenue * (savingsPctOfRevenue / 100);
      const scenarioMonthlyExpenses = Math.max(0, monthlyExpenses - utilitySavingsMonthly);
      const result = runValuation(ctx, { monthlyExpenses: scenarioMonthlyExpenses });
      const newEbitda = (monthlyRevenue - scenarioMonthlyExpenses) * 12;
      return makeScenario({
        id: "utility",
        emoji: "⚡",
        title: "Reduce Utility Costs",
        description: "Solar, LED, efficient equipment",
        baselineValue,
        scenarioValue: result.businessValue,
        newEbitda,
        newMultiple: result.finalMultiple,
        detail: {
          annualSavings: Math.round(utilitySavingsMonthly * 12),
          savingsPctOfRevenue: `${savingsPctOfRevenue.toFixed(1)}% of revenue`,
          newEbitda: Math.round(newEbitda),
        },
        note: `Cutting costs by ${savingsPctOfRevenue}% of revenue (${fmtAnnual(utilitySavingsMonthly)}/yr) flows directly to EBITDA and valuation.`,
        tip: "No trailing P&L data — using simplified savings as % of store revenue. Add monthly financials for Water KPI–based modeling.",
        slider: {
          label: "Savings (% of revenue)",
          min: 0,
          max: 10,
          step: 0.5,
          default: 3,
          format: (v) => `${v}%`,
        },
      });
    }

    case "lease": {
      if (ctx.isOwnerOccupied) return null;
      const yearsAdded = param;
      const result = runValuation(ctx, {
        totalLeaseControl: ctx.totalLeaseControl + yearsAdded,
      });
      return makeScenario({
        id: "lease",
        emoji: "📋",
        title: "Extend Lease",
        description: "Negotiate early extension with landlord",
        baselineValue,
        scenarioValue: result.businessValue,
        newEbitda: annualEbitda,
        newMultiple: result.finalMultiple,
        detail: {
          newTotalControl: `${(ctx.totalLeaseControl + yearsAdded).toFixed(1)} yrs`,
          multipleImpact: `+${(result.finalMultiple - baseline.finalMultiple).toFixed(2)}x`,
        },
        note: `Adding ${yearsAdded} yr(s) of lease control improves lender confidence and adds to the valuation multiple.`,
        tip: "Adds years to total lease control (remaining term + available options). EBITDA is unchanged; value moves via the lease-term multiple tier in the valuation model.",
        slider: {
          label: "Years added",
          min: 1,
          max: 10,
          step: 1,
          default: 5,
          format: (v) => `${v} yr`,
        },
      });
    }

    case "wdf": {
      const monthlyWdfAdded = param;
      const scenarioMonthlyRevenue = monthlyRevenue + monthlyWdfAdded;
      const wdfAnnual = scenarioMonthlyRevenue * 12;
      const annualWdfAdded = monthlyWdfAdded * 12;
      const newWdfPct =
        wdfAnnual > 0
          ? Math.min(100, wdfPct + (annualWdfAdded / wdfAnnual) * 100)
          : wdfPct;
      const result = runValuation(ctx, {
        monthlyRevenue: scenarioMonthlyRevenue,
        wdfPct: newWdfPct,
        selfServicePct: Math.max(0, 100 - newWdfPct - commercialPct - pickupDeliveryPct),
      });
      const newEbitda = (scenarioMonthlyRevenue - monthlyExpenses) * 12;
      return makeScenario({
        id: "wdf",
        emoji: "👕",
        title: "Add WDF Service",
        description: "Wash-dry-fold at $1.75/lb",
        baselineValue,
        scenarioValue: result.businessValue,
        newEbitda,
        newMultiple: result.finalMultiple,
        detail: {
          revenueGain: Math.round(annualWdfAdded),
          newRevenue: Math.round(scenarioMonthlyRevenue * 12),
          newWdfPct: `${newWdfPct.toFixed(1)}%`,
        },
        note: "WDF adds high-margin recurring revenue with minimal equipment cost; WDF mix also lifts the multiple.",
        tip: "Adds monthly WDF revenue at full margin (no extra opex modeled). WDF % of revenue is recalculated from the added dollars, which can trigger WDF revenue-mix multiple adjustments.",
        slider: {
          label: "Monthly WDF revenue",
          min: 0,
          max: 15000,
          step: 250,
          default: 6000,
          format: (v) => fmtMonthly(v),
        },
      });
    }

    case "rent": {
      const monthlyRentIncrease = param;
      const scenarioMonthlyExpenses = monthlyExpenses + monthlyRentIncrease;
      const result = runValuation(ctx, { monthlyExpenses: scenarioMonthlyExpenses });
      const newEbitda = (monthlyRevenue - scenarioMonthlyExpenses) * 12;
      return makeScenario({
        id: "rent",
        emoji: "⬆️",
        title: "Rent Increase",
        description: "Landlord raises rent at renewal",
        baselineValue,
        scenarioValue: result.businessValue,
        newEbitda,
        newMultiple: result.finalMultiple,
        detail: {
          newMonthlyRent: (ctx.leaseMonthlyRent ?? 0) + monthlyRentIncrease,
          ebitdaImpact: -Math.round(monthlyRentIncrease * 12),
          newAnnualEbitda: Math.round(newEbitda),
        },
        note: `A ${fmtMonthly(monthlyRentIncrease)}/mo rent increase compresses EBITDA and reduces store value.`,
        tip: "Increases monthly expenses by the rent hike amount. EBITDA falls dollar-for-dollar; business value drops via both lower EBITDA and the same multiple.",
        slider: {
          label: "Monthly rent increase",
          min: 0,
          max: 5000,
          step: 100,
          default: 2000,
          format: (v) => fmtMonthly(v),
        },
      });
    }

    case "commercial": {
      const pctLost = param;
      const commercialLossMonthly = monthlyRevenue * (commercialPct / 100) * (pctLost / 100);
      const scenarioMonthlyRevenue = Math.max(0, monthlyRevenue - commercialLossMonthly);
      const newCommercialPct = commercialPct * (1 - pctLost / 100);
      const result = runValuation(ctx, {
        monthlyRevenue: scenarioMonthlyRevenue,
        commercialPct: newCommercialPct,
        selfServicePct: Math.max(0, 100 - wdfPct - newCommercialPct - pickupDeliveryPct),
      });
      const newEbitda = (scenarioMonthlyRevenue - monthlyExpenses) * 12;
      return makeScenario({
        id: "commercial",
        emoji: "🏢",
        title: "Lose Commercial Account",
        description: "Lose hotel/restaurant contract",
        baselineValue,
        scenarioValue: result.businessValue,
        newEbitda,
        newMultiple: result.finalMultiple,
        detail: {
          revenueLoss: Math.round(commercialLossMonthly * 12),
          commercialPctLost: `${pctLost.toFixed(0)}% of ${commercialPct}%`,
          newRevenue: Math.round(scenarioMonthlyRevenue * 12),
        },
        note: `Losing ${pctLost}% of commercial revenue (${commercialPct}% of sales) reduces EBITDA and can lower the commercial-mix multiple.`,
        tip: "Scales revenue loss by how much of the commercial book is lost. Commercial % of revenue is reduced proportionally, which may affect the commercial revenue-mix multiple tier.",
        slider: {
          label: "Commercial revenue lost",
          min: 0,
          max: 100,
          step: 5,
          default: 100,
          format: (v) => `${v}%`,
        },
      });
    }

    case "delivery": {
      const monthlyPdRevenue = param;
      const monthlyPdCost = monthlyPdRevenue * 0.65;
      const scenarioMonthlyRevenue = monthlyRevenue + monthlyPdRevenue;
      const scenarioMonthlyExpenses = monthlyExpenses + monthlyPdCost;
      const pdAnnual = scenarioMonthlyRevenue * 12;
      const annualPdAdded = monthlyPdRevenue * 12;
      const newPdPct =
        pdAnnual > 0
          ? Math.min(100, pickupDeliveryPct + (annualPdAdded / pdAnnual) * 100)
          : pickupDeliveryPct;
      const result = runValuation(ctx, {
        monthlyRevenue: scenarioMonthlyRevenue,
        monthlyExpenses: scenarioMonthlyExpenses,
        pickupDeliveryPct: newPdPct,
        selfServicePct: Math.max(0, 100 - wdfPct - commercialPct - newPdPct),
      });
      const newEbitda = (scenarioMonthlyRevenue - scenarioMonthlyExpenses) * 12;
      return makeScenario({
        id: "delivery",
        emoji: "🚐",
        title: "Add Pickup & Delivery",
        description: "Driver + van + route optimization",
        baselineValue,
        scenarioValue: result.businessValue,
        newEbitda,
        newMultiple: result.finalMultiple,
        detail: {
          revenueGain: Math.round(annualPdAdded),
          addedCosts: Math.round(monthlyPdCost * 12),
          netEbitdaGain: Math.round(newEbitda - annualEbitda),
          newRevenue: Math.round(scenarioMonthlyRevenue * 12),
        },
        note: `P&D at ${fmtMonthly(monthlyPdRevenue)}/mo revenue adds ~${fmtMonthly(monthlyPdCost)}/mo in operating costs (65% cost ratio).`,
        tip: "Adds monthly P&D revenue and scales operating costs at 65% of added revenue (the ratio baked into the default $10k/$6.5k scenario). P&D % of revenue updates from added dollars, affecting the P&D multiple tier.",
        slider: {
          label: "Monthly P&D revenue",
          min: 0,
          max: 20000,
          step: 500,
          default: 10000,
          format: (v) => fmtMonthly(v),
        },
      });
    }

    default:
      return null;
  }
}

function fmtMonthly(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtAnnual(monthly: number): string {
  const annual = monthly * 12;
  if (annual >= 1000) return `$${Math.round(annual / 1000).toLocaleString()}k`;
  return `$${Math.round(annual).toLocaleString()}`;
}

const SCENARIO_ORDER: ScenarioId[] = [
  "retool",
  "revenue",
  "utility",
  "lease",
  "wdf",
  "rent",
  "commercial",
  "delivery",
];

export function computeScenarios(
  ctx: StoreScenarioContext,
  params: ScenarioParams = {}
): ScenarioResult[] {
  const baseline = runValuation(ctx);
  const baselineValue = baseline.businessValue;
  const defaults = getScenarioSliderDefaults(ctx);

  return SCENARIO_ORDER
    .map((id) => {
      const param = params[id] ?? defaults[id];
      if (param === undefined) return null;
      return computeScenario(ctx, id, param, baselineValue, baseline);
    })
    .filter((s): s is ScenarioResult => s !== null);
}
