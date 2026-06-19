import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { calcDSCR, calcEbitdaMargin, fmtDollar, fmtMultiple, fmtPct } from "@/lib/calculations";
import type { ValuationResult } from "@/lib/valuation";
import type { ReportFinancialContext } from "@/lib/reportFinancials";

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearsRemaining(endDate: string | null | undefined): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  const now = new Date();
  return Math.max(0, (end.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function marginComparison(margin: number): string {
  if (margin >= 28) return "significantly above";
  if (margin >= 22) return "above";
  if (margin >= 18) return "near";
  return "below";
}

function performanceLabel(margin: number, dscr: number): string {
  if (margin >= 25 && dscr >= 1.5) return "strong-performing";
  if (margin >= 20 && dscr >= 1.25) return "solid";
  if (margin >= 15) return "moderately performing";
  return "underperforming";
}

export function generateExecutiveSummary({
  store,
  lease,
  leaseOptions = [],
  equipment,
  valuation,
  financial,
}: {
  store: any;
  lease: any | null;
  leaseOptions?: any[];
  equipment: any[];
  valuation: ValuationResult;
  financial: ReportFinancialContext;
}): string {
  const storeName = store?.name ?? "This store";
  const address = store?.address ?? "its market area";
  const sqft = store?.square_footage ?? 0;
  const annualRevenue = financial.revenueTtmTotal;
  const annualEbitda = financial.ebitdaTtmTotal;
  const ebitdaMargin = calcEbitdaMargin(annualEbitda, annualRevenue);
  const annualDebtService = financial.annualDebtService;
  const dscr = financial.dscr ?? 0;
  const isOwnerOccupied = store?.occupancy_type === "owner_occupied";
  const dataNote = financial.limitedData
    ? financial.hasMonthlyFinancials
      ? " (based on limited trailing financial history)"
      : " (based on owner-reported profile data — enter monthly financials for TTM accuracy)"
    : " (trailing twelve-month financials)";

  const equipMetrics = computeEquipmentMetrics((equipment ?? []) as EquipmentRecord[]);
  const totalMachines = equipMetrics.totalMachines;

  const yearsRemaining = lease ? calcYearsRemaining(lease.lease_end_date) : 0;
  const optionYears = (leaseOptions ?? [])
    .filter((o) => o.status === "Available")
    .reduce((s, o) => s + (o.option_years ?? 0), 0);
  const totalLeaseControl = isOwnerOccupied ? 15 : yearsRemaining + optionYears;

  const perf = performanceLabel(ebitdaMargin, dscr);
  const marginVs = marginComparison(ebitdaMargin);

  let leaseSentence: string;
  if (isOwnerOccupied) {
    leaseSentence =
      "Fee-simple real estate ownership eliminates lease rollover risk and strengthens the collateral position.";
  } else if (lease && totalLeaseControl >= 10) {
    leaseSentence = `The lease structure provides ${totalLeaseControl.toFixed(1)} years of total site control, a lender-friendly profile that supports long-term financing.`;
  } else if (lease) {
    leaseSentence = `Lease control of ${totalLeaseControl.toFixed(1)} years warrants monitoring — renewal options and assignment rights should be confirmed before financing.`;
  } else {
    leaseSentence = "Lease details are not fully on file; site control should be verified during due diligence.";
  }

  let equipSentence: string;
  if (totalMachines === 0) {
    equipSentence = "Equipment inventory has not been fully documented.";
  } else if (equipMetrics.weightedAvgAge < 8) {
    equipSentence = `The equipment fleet averages ${equipMetrics.weightedAvgAge.toFixed(1)} years with a quality score of ${equipMetrics.qualityScore}/100, indicating low near-term replacement risk.`;
  } else {
    equipSentence = `Equipment averages ${equipMetrics.weightedAvgAge.toFixed(1)} years with an estimated replacement cost of ${fmtDollar(equipMetrics.estimatedReplacementValue)}, which should be factored into underwriting.`;
  }

  let dscrSentence: string;
  if (annualDebtService <= 0) {
    dscrSentence = "No active loan debt service on file — enter loan details to complete DSCR analysis.";
  } else if (dscr >= 1.5) {
    dscrSentence = `DSCR of ${fmtMultiple(dscr)} reflects a strong debt coverage position well above the 1.25x lender minimum.`;
  } else if (dscr >= 1.25) {
    dscrSentence = `DSCR of ${fmtMultiple(dscr)} meets the standard 1.25x minimum lender threshold.`;
  } else {
    dscrSentence = `DSCR of ${fmtMultiple(dscr)} is below the 1.25x minimum — debt restructuring or EBITDA improvement is recommended before financing.`;
  }

  const topDriver =
    valuation.valueDrivers[0] ??
    (ebitdaMargin >= 22 ? "above-median operating margins" : "stable cash flow generation");

  const parts = [
    `${storeName} is a ${perf} laundromat located at ${address}${sqft > 0 ? ` with ${sqft.toLocaleString()} SF` : ""}${totalMachines > 0 ? ` and ${totalMachines} machines` : ""}.`,
    `The store generates ${fmtDollar(annualRevenue)} in annual revenue with a ${fmtPct(ebitdaMargin)} EBITDA margin, ${marginVs} the industry median of ~22%${dataNote}.`,
    `Estimated business value of ${fmtDollar(valuation.businessValue)} at ${fmtMultiple(valuation.finalMultiple)} reflects ${topDriver.toLowerCase().replace(/\.$/, "")}.`,
    leaseSentence,
    equipSentence,
    dscrSentence,
  ];

  if (valuation.valueRisks.length > 0) {
    parts.push(`Key underwriting consideration: ${valuation.valueRisks[0]}.`);
  }

  return parts.join(" ");
}
