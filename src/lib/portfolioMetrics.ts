import { calcGlobalDSCR } from "@/lib/calculations";
import { computeStoreDscr } from "@/lib/dscr";
import {
  buildPortfolioTtmSummary,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecordWithStore,
  type PortfolioTtmSummary,
  type TtmMetrics,
} from "@/lib/financials";

export type PortfolioFinancialTotals = {
  summary: PortfolioTtmSummary;
  annualEbitda: number;
  annualDebtService: number;
  globalDSCR: number | null;
};

/** Single source of truth for portfolio EBITDA and Global DSCR (utilities-aware TTM). */
export function computePortfolioFinancialTotals(
  financialsData: MonthlyFinancialRecord[],
  storeIds: string[],
  annualDebtByStore: Record<string, number>,
  utilityRows: MonthlyUtilityRecordWithStore[] = []
): PortfolioFinancialTotals {
  const summary = buildPortfolioTtmSummary(
    financialsData,
    storeIds,
    annualDebtByStore,
    utilityRows
  );
  const annualDebtService = summary.ttmDebtService;
  return {
    summary,
    annualEbitda: summary.ttmEbitda,
    annualDebtService,
    globalDSCR:
      annualDebtService > 0 ? calcGlobalDSCR(summary.ttmEbitda, annualDebtService) : null,
  };
}

export function computePortfolioStoreDscr(
  storeTtm: TtmMetrics | undefined,
  scheduledAnnualDebtService: number
): number | null {
  if (!storeTtm || storeTtm.monthsUsed <= 0) return null;
  return computeStoreDscr(storeTtm.ttmEbitda, scheduledAnnualDebtService);
}

export function sumPortfolioCash(
  stores: Array<{
    operating_account_balance?: number | null;
    reserve_account_balance?: number | null;
    petty_cash?: number | null;
  }>
): number {
  return stores.reduce(
    (sum, store) =>
      sum +
      (store.operating_account_balance ?? 0) +
      (store.reserve_account_balance ?? 0) +
      (store.petty_cash ?? 0),
    0
  );
}

/** Portfolio equity: business value + cash − business debt (excludes building mortgages). */
export function computePortfolioEquity(
  portfolioValue: number,
  portfolioDebt: number,
  portfolioCash: number
): number {
  return portfolioValue + portfolioCash - portfolioDebt;
}
