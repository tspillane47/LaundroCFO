// src/lib/calculations.ts

function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !Number.isFinite(denominator) || !Number.isFinite(numerator)) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

export function calcDSCR(cashFlow: number, annualDebtService: number) {
  return safeDivide(cashFlow, annualDebtService, 0);
}

export function calcGlobalDSCR(globalCashFlow: number, globalDebtService: number) {
  return safeDivide(globalCashFlow, globalDebtService, 0);
}

export function calcEbitdaMargin(ebitda: number, revenue: number) {
  if (!revenue || revenue <= 0) return 0;
  return safeDivide(ebitda, revenue, 0) * 100;
}

export function calcRentToRevenue(annualRent: number, revenue: number) {
  if (!revenue || revenue <= 0) return 0;
  return safeDivide(annualRent, revenue, 0) * 100;
}

export function calcOccupancyCostRatio(occupancyCost: number, revenue: number) {
  if (!revenue || revenue <= 0) return 0;
  return safeDivide(occupancyCost, revenue, 0) * 100;
}

export function calcUtilityRatio(utilities: number, revenue: number) {
  if (!revenue || revenue <= 0) return 0;
  return safeDivide(utilities, revenue, 0) * 100;
}

export function calcRevenuePerSF(revenue: number, sqft: number) {
  return safeDivide(revenue, sqft, 0);
}

export function calcEbitdaPerSF(ebitda: number, sqft: number) {
  return safeDivide(ebitda, sqft, 0);
}

export function calcRevenuePerMachine(revenue: number, machines: number) {
  return safeDivide(revenue, machines, 0);
}

export function calcDebtYield(noi: number, totalDebt: number) {
  if (!totalDebt || totalDebt <= 0) return 0;
  return safeDivide(noi, totalDebt, 0) * 100;
}

export function calcCapRate(noi: number, estimatedValue: number) {
  if (!estimatedValue || estimatedValue <= 0) return 0;
  return safeDivide(noi, estimatedValue, 0) * 100;
}

export function calcValuation(ebitda: number, multiple: number) {
  if (!Number.isFinite(ebitda) || !Number.isFinite(multiple)) return 0;
  return ebitda * multiple;
}

// Equipment calculations
export function calcAverageEquipmentAge(
  equipment: { qty: number; installed: number }[],
  currentYear = new Date().getFullYear()
) {
  const totalMachines = equipment.reduce((s, e) => s + e.qty, 0);
  const weightedAge = equipment.reduce(
    (s, e) => s + e.qty * (currentYear - e.installed),
    0
  );
  return totalMachines > 0 ? weightedAge / totalMachines : 0;
}

export function calcEquipmentScore(avgAge: number): number {
  if (avgAge < 5) return 97;
  if (avgAge < 10) return 85;
  if (avgAge < 15) return 65;
  return 40;
}

export function equipmentAgeLabel(avgAge: number): string {
  if (avgAge < 5) return "Excellent";
  if (avgAge < 10) return "Good";
  if (avgAge < 15) return "Aging";
  return "High Replacement Risk";
}

// Lease scoring
export function calcLeaseScore(params: {
  yearsRemaining: number;
  renewalOptions: number;
  relocationClause: boolean;
  assignmentWithConsent: boolean;
  exclusiveUse: boolean;
}): number {
  let score = 50;
  if (params.yearsRemaining >= 10) score += 30;
  else if (params.yearsRemaining >= 5) score += 20;
  else if (params.yearsRemaining >= 3) score += 10;
  if (params.renewalOptions >= 2) score += 10;
  else if (params.renewalOptions === 1) score += 5;
  if (params.exclusiveUse) score += 5;
  if (params.relocationClause) score -= 10;
  if (params.assignmentWithConsent) score -= 1;
  return Math.min(100, Math.max(0, score));
}

export function leaseRiskLabel(yearsRemaining: number): string {
  if (yearsRemaining < 3) return "High Risk";
  if (yearsRemaining < 5) return "Moderate Risk";
  if (yearsRemaining < 10) return "Good";
  return "Excellent";
}

// Valuation multiple adjustments
export function calcValuationMultiple(params: {
  dscr: number;
  globalDscr: number;
  leaseYearsRemaining: number;
  rentToRevenue: number;
  utilityRatio: number;
  revenuePerSF: number;
  avgEquipmentAge: number;
  ebitdaMargin: number;
}): number {
  let multiple = 4.5; // base

  // Positive adjustments
  if (params.dscr >= 2.0) multiple += 0.15;
  else if (params.dscr >= 1.5) multiple += 0.1;

  if (params.globalDscr >= 1.75) multiple += 0.1;

  if (params.leaseYearsRemaining >= 10) multiple += 0.25;
  else if (params.leaseYearsRemaining >= 7) multiple += 0.15;

  if (params.rentToRevenue <= 12) multiple += 0.1;

  if (params.ebitdaMargin >= 28) multiple += 0.15;
  else if (params.ebitdaMargin >= 24) multiple += 0.08;

  if (params.revenuePerSF >= 180) multiple += 0.1;

  if (params.avgEquipmentAge < 5) multiple += 0.3;
  else if (params.avgEquipmentAge < 10) multiple += 0.15;

  // Negative adjustments
  if (params.utilityRatio > 20) multiple -= 0.2;
  else if (params.utilityRatio > 17) multiple -= 0.1;

  if (params.leaseYearsRemaining < 3) multiple -= 0.5;
  else if (params.leaseYearsRemaining < 5) multiple -= 0.25;

  if (params.avgEquipmentAge > 15) multiple -= 0.4;
  else if (params.avgEquipmentAge > 12) multiple -= 0.2;

  if (params.ebitdaMargin < 20) multiple -= 0.3;

  if (params.dscr < 1.25) multiple -= 0.4;

  return Math.max(1.5, multiple);
}

const NA_DISPLAY = "—";

export function fmt(n: number, decimals = 0) {
  if (!Number.isFinite(n)) return NA_DISPLAY;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtDollar(n: number) {
  if (!Number.isFinite(n)) return NA_DISPLAY;
  return "$" + fmt(Math.round(n));
}

export function fmtPct(n: number, decimals = 1) {
  if (!Number.isFinite(n)) return NA_DISPLAY;
  return n.toFixed(decimals) + "%";
}

export function fmtMultiple(n: number) {
  if (!Number.isFinite(n)) return NA_DISPLAY;
  return n.toFixed(2) + "x";
}

export function scoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-blue-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

export function pctColor(pct: number, lowerIsBetter = false): string {
  const good = lowerIsBetter ? pct < 15 : pct > 25;
  const warn = lowerIsBetter ? pct > 20 : pct < 18;
  if (good) return "text-green-400";
  if (warn) return "text-red-400";
  return "text-amber-400";
}
