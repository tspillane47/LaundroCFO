export interface ValuationInputs {
  ebitda: number;
  monthlyRevenue: number;
  squareFootage: number;
  avgEquipmentAge: number;
  pct200G: number;
  equipmentScore: number;
  totalLeaseControl: number;
  /** Base lease years remaining; when set, term and option years adjust the multiple separately. */
  leaseYearsRemaining?: number;
  occupancyType: string;
  marketDensity: string;
  storeCondition: string;
  lastRetoolYear?: number;
  retoolInvestment?: number;
  retoolType?: string;
  revenueTrend: string;
  competitionLevel: string;
  selfServicePct: number;
  wdfPct: number;
  commercialPct: number;
  pickupDeliveryPct: number;
  realEstateValue?: number;
}

export interface ValuationAdjustment {
  label: string;
  value: number;
  reason: string;
  category: string;
}

export interface ValuationResult {
  baseMultiple: number;
  adjustments: ValuationAdjustment[];
  finalMultiple: number;
  businessValue: number;
  realEstateValue: number;
  combinedValue: number;
  valueDrivers: string[];
  valueRisks: string[];
  improvements: { action: string; estimatedGain: number }[];
}

const MIN_MULTIPLE = 2.5;
const MAX_MULTIPLE = 6.5;

function pushAdj(
  adjustments: ValuationAdjustment[],
  label: string,
  value: number,
  reason: string,
  category: string
) {
  if (value !== 0) {
    adjustments.push({ label, value, reason, category });
  }
}

function calcLeaseTermAdjustment(yearsRemaining: number): number {
  return yearsRemaining >= 15
    ? 0.5
    : yearsRemaining >= 10
      ? 0.25
      : yearsRemaining >= 7
        ? 0.1
        : yearsRemaining >= 5
          ? 0
          : yearsRemaining >= 3
            ? -0.25
            : -0.75;
}

function calcLeaseOptionAdjustment(optionYears: number): number {
  return optionYears >= 10 ? 0.25 : optionYears >= 5 ? 0.15 : optionYears >= 2 ? 0.05 : 0;
}

function normalizeMarketDensity(value: string): string {
  const v = value.toLowerCase();
  if (v === "urban" || v === "dense_urban" || v === "prime_dense_urban") return "urban";
  if (v === "suburban" || v === "strong_suburban") return "suburban";
  if (v === "rural") return "rural";
  return "average";
}

export function calcValuation(inputs: ValuationInputs): ValuationResult {
  const base = 4.0;
  const adjustments: ValuationAdjustment[] = [];
  const currentYear = new Date().getFullYear();

  // Equipment age adjustment
  const equipAdj =
    inputs.avgEquipmentAge < 5 ? 0.5 :
    inputs.avgEquipmentAge < 8 ? 0.25 :
    inputs.avgEquipmentAge < 12 ? 0.0 :
    inputs.avgEquipmentAge < 15 ? -0.25 : -0.5;
  pushAdj(
    adjustments,
    "Equipment Age",
    equipAdj,
    `Avg age ${inputs.avgEquipmentAge.toFixed(1)} years`,
    "equipment"
  );

  // 200G washer bonus
  if (inputs.pct200G > 50) {
    pushAdj(
      adjustments,
      "High Speed Extract",
      0.1,
      `${inputs.pct200G.toFixed(0)}% 200G+ machines`,
      "equipment"
    );
  }

  // Equipment quality score
  const scoreAdj =
    inputs.equipmentScore >= 90 ? 0.2 :
    inputs.equipmentScore >= 75 ? 0.1 :
    inputs.equipmentScore >= 60 ? 0 :
    inputs.equipmentScore >= 40 ? -0.15 : -0.3;
  pushAdj(
    adjustments,
    "Equipment Quality",
    scoreAdj,
    `Quality score ${Math.round(inputs.equipmentScore)}/100`,
    "equipment"
  );

  // Retool bonus
  if (inputs.lastRetoolYear) {
    const yearsSinceRetool = currentYear - inputs.lastRetoolYear;
    const retoolAdj = yearsSinceRetool <= 2 ? 0.25 : yearsSinceRetool <= 5 ? 0.1 : 0;
    if (retoolAdj > 0) {
      pushAdj(
        adjustments,
        "Recent Retool",
        retoolAdj,
        `${inputs.retoolType ?? "Retool"} in ${inputs.lastRetoolYear}`,
        "equipment"
      );
    }
  }

  // Lease adjustment
  const isOwned = inputs.occupancyType === "owned" || inputs.occupancyType === "owner_occupied";
  if (!isOwned) {
    if (inputs.leaseYearsRemaining != null) {
      const yearsRemaining = inputs.leaseYearsRemaining;
      const optionYears = Math.max(0, inputs.totalLeaseControl - yearsRemaining);
      const termAdj = calcLeaseTermAdjustment(yearsRemaining);
      const optionAdj = calcLeaseOptionAdjustment(optionYears);
      pushAdj(
        adjustments,
        "Base Lease Term",
        termAdj,
        `${yearsRemaining.toFixed(1)} years remaining on current term`,
        "lease"
      );
      pushAdj(
        adjustments,
        "Renewal Options",
        optionAdj,
        `${optionYears.toFixed(1)} years of available renewal options`,
        "lease"
      );
    } else {
      const leaseAdj =
        inputs.totalLeaseControl >= 15
          ? 0.5
          : inputs.totalLeaseControl >= 10
            ? 0.25
            : inputs.totalLeaseControl >= 7
              ? 0.1
              : inputs.totalLeaseControl >= 5
                ? 0
                : inputs.totalLeaseControl >= 3
                  ? -0.25
                  : -0.75;
      pushAdj(
        adjustments,
        "Lease Term Control",
        leaseAdj,
        `${inputs.totalLeaseControl.toFixed(1)} years total control`,
        "lease"
      );
    }
  }

  // Real estate ownership
  if (isOwned) {
    pushAdj(adjustments, "Real Estate Owned", 0.25, "Building owned — fee simple", "lease");
  }

  // Market density
  const density = normalizeMarketDensity(inputs.marketDensity);
  const marketAdj =
    density === "urban" ? 0.25 :
    density === "suburban" ? 0.1 :
    density === "rural" ? -0.25 : 0;
  pushAdj(
    adjustments,
    "Market Density",
    marketAdj,
    density === "urban" ? "Prime dense urban market" :
    density === "suburban" ? "Strong suburban market" :
    density === "rural" ? "Rural market" : "Average small city market",
    "market"
  );

  // Store size
  const sfAdj =
    inputs.squareFootage > 5000 ? 0.25 :
    inputs.squareFootage >= 3500 ? 0.1 :
    inputs.squareFootage >= 2500 ? 0 :
    inputs.squareFootage >= 1500 ? -0.25 : -0.5;
  pushAdj(
    adjustments,
    "Store Size",
    sfAdj,
    `${inputs.squareFootage.toLocaleString()} sq ft`,
    "operations"
  );

  // Revenue per SF efficiency
  const annualRevenue = inputs.monthlyRevenue * 12;
  const revPerSF = inputs.squareFootage > 0 ? annualRevenue / inputs.squareFootage : 0;
  const revSfAdj =
    revPerSF >= 200 ? 0.15 :
    revPerSF >= 170 ? 0.1 :
    revPerSF >= 140 ? 0 :
    revPerSF >= 100 ? -0.1 : -0.2;
  pushAdj(
    adjustments,
    "Revenue Efficiency",
    revSfAdj,
    `$${revPerSF.toFixed(0)}/SF annual revenue`,
    "operations"
  );

  // Revenue trend
  const revAdj =
    inputs.revenueTrend === "growing" ? 0.25 :
    inputs.revenueTrend === "declining" ? -0.5 : 0;
  pushAdj(
    adjustments,
    "Revenue Trend",
    revAdj,
    inputs.revenueTrend === "growing" ? "Growing revenue" :
    inputs.revenueTrend === "declining" ? "Declining revenue" : "Stable revenue",
    "operations"
  );

  // Store condition
  const condition = inputs.storeCondition.toLowerCase();
  const condAdj =
    condition === "excellent" || condition === "remodeled" ? 0.25 :
    condition === "good" ? 0.1 :
    condition === "poor" || condition === "needs_renovation" ? -0.5 :
    condition === "fair" ? -0.1 : 0;
  pushAdj(
    adjustments,
    "Store Condition",
    condAdj,
    condition === "excellent" || condition === "remodeled" ? "Excellent condition" :
    condition === "good" ? "Good condition" :
    condition === "poor" || condition === "needs_renovation" ? "Poor condition" :
    condition === "fair" || condition === "average" ? "Fair condition" : "Average condition",
    "operations"
  );

  // Competition
  const compAdj =
    inputs.competitionLevel === "protected" ? 0.25 :
    inputs.competitionLevel === "heavy" ? -0.25 : 0;
  pushAdj(
    adjustments,
    "Competition",
    compAdj,
    inputs.competitionLevel === "protected" ? "Protected market" :
    inputs.competitionLevel === "heavy" ? "Heavy competition" : "Normal competition",
    "market"
  );

  // Revenue mix — WDF premium
  const wdfAdj =
    inputs.wdfPct >= 30 ? 0.2 :
    inputs.wdfPct >= 20 ? 0.15 :
    inputs.wdfPct >= 10 ? 0.05 : 0;
  pushAdj(
    adjustments,
    "WDF Revenue Mix",
    wdfAdj,
    `${inputs.wdfPct.toFixed(0)}% wash-dry-fold`,
    "revenue_mix"
  );

  // Commercial accounts stability
  const commercialAdj =
    inputs.commercialPct >= 25 ? 0.15 :
    inputs.commercialPct >= 15 ? 0.1 :
    inputs.commercialPct >= 5 ? 0.05 : 0;
  pushAdj(
    adjustments,
    "Commercial Mix",
    commercialAdj,
    `${inputs.commercialPct.toFixed(0)}% commercial revenue`,
    "revenue_mix"
  );

  // Pickup & delivery growth channel
  const pdAdj =
    inputs.pickupDeliveryPct >= 15 ? 0.2 :
    inputs.pickupDeliveryPct >= 8 ? 0.1 :
    inputs.pickupDeliveryPct >= 3 ? 0.05 : 0;
  pushAdj(
    adjustments,
    "Pickup & Delivery",
    pdAdj,
    `${inputs.pickupDeliveryPct.toFixed(0)}% P&D revenue`,
    "revenue_mix"
  );

  // Self-service concentration risk
  if (inputs.selfServicePct > 90) {
    pushAdj(
      adjustments,
      "Revenue Concentration",
      -0.1,
      `${inputs.selfServicePct.toFixed(0)}% self-service — limited diversification`,
      "revenue_mix"
    );
  }

  const totalAdj = adjustments.reduce((s, a) => s + a.value, 0);
  const finalMultiple = Math.min(MAX_MULTIPLE, Math.max(MIN_MULTIPLE, base + totalAdj));
  const businessValue = inputs.ebitda * finalMultiple;
  const realEstateValue = inputs.realEstateValue ?? 0;

  const valueDrivers: string[] = [];
  const valueRisks: string[] = [];

  for (const adj of adjustments) {
    if (adj.value >= 0.15) {
      valueDrivers.push(`${adj.label}: ${adj.reason} (+${adj.value.toFixed(2)}x)`);
    } else if (adj.value <= -0.15) {
      valueRisks.push(`${adj.label}: ${adj.reason} (${adj.value.toFixed(2)}x)`);
    }
  }

  if (inputs.ebitda > 0 && revPerSF >= 170) {
    valueDrivers.push(`Strong revenue productivity at $${revPerSF.toFixed(0)}/SF`);
  }
  if (inputs.equipmentScore >= 85) {
    valueDrivers.push(`Modern, well-maintained equipment fleet (${Math.round(inputs.equipmentScore)}/100)`);
  }
  if (isOwned) {
    valueDrivers.push("Fee-simple real estate ownership adds asset value");
  }

  if (!isOwned && inputs.totalLeaseControl < 5) {
    valueRisks.push(`Short lease control (${inputs.totalLeaseControl.toFixed(1)} yrs) limits buyer pool`);
  }
  if (inputs.avgEquipmentAge >= 12) {
    valueRisks.push(`Aging equipment (${inputs.avgEquipmentAge.toFixed(1)} yr avg) signals near-term capex`);
  }
  if (inputs.revenueTrend === "declining") {
    valueRisks.push("Declining revenue trend compresses buyer confidence");
  }
  if (inputs.wdfPct < 10 && inputs.pickupDeliveryPct < 5) {
    valueRisks.push("Limited high-margin service revenue (WDF/P&D underdeveloped)");
  }

  const improvements: { action: string; estimatedGain: number }[] = [];

  function addImprovement(action: string, multipleDelta: number) {
    if (multipleDelta > 0 && inputs.ebitda > 0) {
      improvements.push({
        action,
        estimatedGain: Math.round(inputs.ebitda * multipleDelta),
      });
    }
  }

  if (!isOwned && inputs.totalLeaseControl < 10) {
    const targetAdj = inputs.totalLeaseControl >= 7 ? 0.15 : inputs.totalLeaseControl >= 5 ? 0.25 : 0.5;
    addImprovement("Extend lease term or exercise renewal options", targetAdj);
  }
  if (inputs.avgEquipmentAge >= 10) {
    addImprovement("Replace aging equipment fleet", inputs.avgEquipmentAge >= 15 ? 0.5 : 0.25);
  }
  if (inputs.pct200G <= 50) {
    addImprovement("Upgrade to 200G high-speed extract washers", 0.1);
  }
  if (inputs.wdfPct < 15) {
    addImprovement("Launch or expand wash-dry-fold service", 0.15);
  }
  if (inputs.pickupDeliveryPct < 8) {
    addImprovement("Add pickup & delivery route", 0.2);
  }
  const storeCond = inputs.storeCondition.toLowerCase();
  if (storeCond === "needs_renovation" || storeCond === "poor" || storeCond === "fair") {
    addImprovement("Renovate store interior and customer areas", storeCond === "poor" ? 0.25 : 0.15);
  }
  if (revPerSF < 140 && inputs.squareFootage > 0) {
    addImprovement("Improve revenue per SF through pricing and hours optimization", 0.1);
  }
  if (inputs.commercialPct < 10) {
    addImprovement("Develop commercial B2B accounts (hotels, restaurants)", 0.1);
  }

  improvements.sort((a, b) => b.estimatedGain - a.estimatedGain);

  return {
    baseMultiple: base,
    adjustments,
    finalMultiple,
    businessValue,
    realEstateValue,
    combinedValue: businessValue + realEstateValue,
    valueDrivers,
    valueRisks,
    improvements: improvements.slice(0, 5),
  };
}

/** @deprecated Use calcValuation instead */
export interface LegacyValuationInputs {
  ebitda: number;
  locationCategory: string;
  totalLeaseControl: number;
  occupancyType: string;
  avgEquipmentAge: number;
  pct200GWashers?: number;
  squareFootage: number;
  revenueTrend: string;
  storeCondition: string;
  competitionLevel: string;
  realEstateValue?: number;
  monthlyRevenue?: number;
  equipmentScore?: number;
  selfServicePct?: number;
  wdfPct?: number;
  commercialPct?: number;
  pickupDeliveryPct?: number;
}

/** @deprecated Use calcValuation instead */
export function calcValuationMultiple(inputs: LegacyValuationInputs): ValuationResult {
  const monthlyRevenue =
    inputs.monthlyRevenue ??
    (inputs.ebitda > 0 ? (inputs.ebitda / 12) / 0.286 : 0);

  const equipmentScore =
    inputs.equipmentScore ??
    (inputs.avgEquipmentAge < 5 ? 97 :
     inputs.avgEquipmentAge < 10 ? 85 :
     inputs.avgEquipmentAge < 15 ? 65 : 40);

  const wdfPct = inputs.wdfPct ?? 18;
  const commercialPct = inputs.commercialPct ?? 12;
  const pickupDeliveryPct = inputs.pickupDeliveryPct ?? 0;
  const selfServicePct =
    inputs.selfServicePct ??
    Math.max(0, 100 - wdfPct - commercialPct - pickupDeliveryPct);

  return calcValuation({
    ebitda: inputs.ebitda,
    monthlyRevenue,
    squareFootage: inputs.squareFootage,
    avgEquipmentAge: inputs.avgEquipmentAge,
    pct200G: inputs.pct200GWashers ?? 0,
    equipmentScore,
    totalLeaseControl: inputs.totalLeaseControl,
    occupancyType: inputs.occupancyType,
    marketDensity: inputs.locationCategory,
    storeCondition: inputs.storeCondition,
    revenueTrend: inputs.revenueTrend,
    competitionLevel: inputs.competitionLevel,
    selfServicePct,
    wdfPct,
    commercialPct,
    pickupDeliveryPct,
    realEstateValue: inputs.realEstateValue,
  });
}

export function getEquipmentAdjustment(avgAge: number, pct200G: number): number {
  let adjustment = 0;
  if (avgAge < 5) adjustment = 0.5;
  else if (avgAge < 8) adjustment = 0.25;
  else if (avgAge < 12) adjustment = 0;
  else if (avgAge < 15) adjustment = -0.25;
  else adjustment = -0.5;
  if (pct200G > 50) adjustment += 0.1;
  return adjustment;
}
