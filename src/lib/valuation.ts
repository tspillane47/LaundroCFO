export interface ValuationInputs {
  ebitda: number;
  locationCategory: string;
  totalLeaseControl: number;
  occupancyType: string;
  avgEquipmentAge: number;
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

export function calcValuationMultiple(inputs: ValuationInputs): ValuationResult {
  let multiple = 3.5;
  const adjustments: { label: string; value: number }[] = [];

  // Location
  const locationAdj =
    inputs.locationCategory === 'urban' ? 0.25 :
    inputs.locationCategory === 'suburban' ? 0.10 :
    inputs.locationCategory === 'rural' ? -0.25 : 0;
  if (locationAdj !== 0) adjustments.push({ label: 'Location', value: locationAdj });

  // Lease control
  const leaseAdj =
    inputs.totalLeaseControl >= 15 ? 0.50 :
    inputs.totalLeaseControl >= 10 ? 0.25 :
    inputs.totalLeaseControl >= 7 ? 0.10 :
    inputs.totalLeaseControl >= 5 ? 0 :
    inputs.totalLeaseControl >= 3 ? -0.25 : -0.75;
  if (leaseAdj !== 0) adjustments.push({ label: 'Lease Term', value: leaseAdj });

  // Real estate
  const reAdj = inputs.occupancyType === 'owned' ? 0.25 : 0;
  if (reAdj !== 0) adjustments.push({ label: 'Real Estate Owned', value: reAdj });

  // Equipment age
  const equipAdj =
    inputs.avgEquipmentAge <= 5 ? 0.50 :
    inputs.avgEquipmentAge <= 10 ? 0.25 :
    inputs.avgEquipmentAge <= 15 ? 0 :
    inputs.avgEquipmentAge <= 20 ? -0.50 : -1.00;
  if (equipAdj !== 0) adjustments.push({ label: 'Equipment Age', value: equipAdj });

  // Square footage
  const sfAdj =
    inputs.squareFootage > 5000 ? 0.25 :
    inputs.squareFootage >= 3500 ? 0.10 :
    inputs.squareFootage >= 2500 ? 0 :
    inputs.squareFootage >= 1500 ? -0.25 : -0.50;
  if (sfAdj !== 0) adjustments.push({ label: 'Store Size', value: sfAdj });

  // Revenue trend
  const revAdj =
    inputs.revenueTrend === 'growing' ? 0.25 :
    inputs.revenueTrend === 'declining' ? -0.50 : 0;
  if (revAdj !== 0) adjustments.push({ label: 'Revenue Trend', value: revAdj });

  // Store condition
  const condAdj =
    inputs.storeCondition === 'remodeled' ? 0.25 :
    inputs.storeCondition === 'needs_renovation' ? -0.50 : 0;
  if (condAdj !== 0) adjustments.push({ label: 'Store Condition', value: condAdj });

  // Competition
  const compAdj =
    inputs.competitionLevel === 'protected' ? 0.25 :
    inputs.competitionLevel === 'heavy' ? -0.25 : 0;
  if (compAdj !== 0) adjustments.push({ label: 'Competition', value: compAdj });

  // Total
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
