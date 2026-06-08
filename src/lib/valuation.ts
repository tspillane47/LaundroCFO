export interface ValuationInputs {
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
}

export interface ValuationResult {
  baseMultiple: number;
  adjustments: { label: string; value: number }[];
  finalMultiple: number;
  businessValue: number;
  realEstateValue: number;
  combinedValue: number;
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

export function calcValuationMultiple(inputs: ValuationInputs): ValuationResult {
  let multiple = 3.5;
  const adjustments: { label: string; value: number }[] = [];

  const locationAdj =
    inputs.locationCategory === "urban"
      ? 0.25
      : inputs.locationCategory === "suburban"
        ? 0.1
        : inputs.locationCategory === "rural"
          ? -0.25
          : 0;
  if (locationAdj !== 0) adjustments.push({ label: "Location", value: locationAdj });

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
  if (leaseAdj !== 0) adjustments.push({ label: "Lease Term", value: leaseAdj });

  const reAdj = inputs.occupancyType === "owned" ? 0.25 : 0;
  if (reAdj !== 0) adjustments.push({ label: "Real Estate Owned", value: reAdj });

  const equipAdj = getEquipmentAdjustment(
    inputs.avgEquipmentAge,
    inputs.pct200GWashers ?? 0
  );
  if (equipAdj !== 0) adjustments.push({ label: "Equipment Age", value: equipAdj });

  const sfAdj =
    inputs.squareFootage > 5000
      ? 0.25
      : inputs.squareFootage >= 3500
        ? 0.1
        : inputs.squareFootage >= 2500
          ? 0
          : inputs.squareFootage >= 1500
            ? -0.25
            : -0.5;
  if (sfAdj !== 0) adjustments.push({ label: "Store Size", value: sfAdj });

  const revAdj =
    inputs.revenueTrend === "growing" ? 0.25 : inputs.revenueTrend === "declining" ? -0.5 : 0;
  if (revAdj !== 0) adjustments.push({ label: "Revenue Trend", value: revAdj });

  const condAdj =
    inputs.storeCondition === "remodeled"
      ? 0.25
      : inputs.storeCondition === "needs_renovation"
        ? -0.5
        : 0;
  if (condAdj !== 0) adjustments.push({ label: "Store Condition", value: condAdj });

  const compAdj =
    inputs.competitionLevel === "protected"
      ? 0.25
      : inputs.competitionLevel === "heavy"
        ? -0.25
        : 0;
  if (compAdj !== 0) adjustments.push({ label: "Competition", value: compAdj });

  const totalAdj = adjustments.reduce((s, a) => s + a.value, 0);
  const finalMultiple = Math.min(6.0, Math.max(2.5, multiple + totalAdj));
  const businessValue = inputs.ebitda * finalMultiple;
  const realEstateValue = inputs.realEstateValue ?? 0;

  return {
    baseMultiple: multiple,
    adjustments,
    finalMultiple,
    businessValue,
    realEstateValue,
    combinedValue: businessValue + realEstateValue,
  };
}
