import { calcDSCR, DSCR_NO_DEBT_LABEL } from "@/lib/calculations";
import {
  applyLoanDebtServiceToTtm,
  buildUtilitiesLookup,
  calcTtmMetrics,
  enrichMonthlyRecords,
  sortRecordsDesc,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
  type TtmMetrics,
} from "@/lib/financials";

export { DSCR_NO_DEBT_LABEL };

/** Single source of truth: TTM EBITDA ÷ scheduled annual debt service. */
export const DSCR_LENDER_MINIMUM = 1.25;

export function computeStoreDscr(
  annualEbitda: number,
  scheduledAnnualDebtService: number
): number | null {
  return calcDSCR(annualEbitda, scheduledAnnualDebtService);
}

/** Scheduled annual debt service from active store_loans (same basis as computeStoreDscr). */
export function hasScheduledDebtService(scheduledAnnualDebtService: number): boolean {
  return scheduledAnnualDebtService > 0;
}

/** Warn only when the store has scheduled debt and DSCR is below the lender minimum. */
export function shouldTriggerLowDscrAlert(
  dscr: number | null,
  scheduledAnnualDebtService: number
): boolean {
  return hasScheduledDebtService(scheduledAnnualDebtService) && dscr != null && dscr < DSCR_LENDER_MINIMUM;
}

/** Build TTM metrics with utilities-aware EBITDA and loan-scheduled DSCR. */
export function buildStoreTtmWithDscr(
  financialRecords: MonthlyFinancialRecord[],
  scheduledAnnualDebtService: number,
  utilityRecords: MonthlyUtilityRecord[] = []
): TtmMetrics {
  const utilitiesLookup = buildUtilitiesLookup(utilityRecords);
  const records = enrichMonthlyRecords(sortRecordsDesc(financialRecords), utilitiesLookup);
  return applyLoanDebtServiceToTtm(calcTtmMetrics(records), scheduledAnnualDebtService);
}

export type DscrDisplayOptions = {
  hasFinancialData: boolean;
  scheduledAnnualDebtService: number;
};

export function getDscrSubtext(
  dscr: number | null,
  { hasFinancialData, scheduledAnnualDebtService }: DscrDisplayOptions
): string {
  if (!hasFinancialData) return "Add monthly financials";
  if (scheduledAnnualDebtService <= 0) return "No debt — strong position";
  if (dscr != null && dscr >= 1.5) return "Strong coverage";
  if (dscr != null && dscr >= 1.25) return "Adequate";
  return "Below threshold";
}

export function getDscrValueColor(
  dscr: number | null,
  { hasFinancialData, scheduledAnnualDebtService }: DscrDisplayOptions
): string {
  if (!hasFinancialData) return "var(--text-muted)";
  if (scheduledAnnualDebtService <= 0) return "var(--text-success)";
  if (dscr != null && dscr >= 1.5) return "var(--text-success)";
  if (dscr != null && dscr >= 1.25) return "var(--text-warning)";
  return "var(--text-danger)";
}
