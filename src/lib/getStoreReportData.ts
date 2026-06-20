import { createClient } from "@/lib/supabase";
import { getStoreValuation, type StoreValuationResult } from "@/lib/getStoreValuation";
import { computeLaundroCfoScoreFromRaw } from "@/lib/laundroCfoScore";
import type { LaundroCfoScoreResult } from "@/lib/laundroCfoScore";
import type { EquipmentRecord } from "@/lib/equipment";
import {
  fetchReportFinancialContext,
  type ReportFinancialContext,
} from "@/lib/reportFinancials";

export type StoreReportData = {
  financial: ReportFinancialContext;
  valuation: StoreValuationResult;
  laundroCfoScore: LaundroCfoScoreResult;
};

export async function getStoreReportData(args: {
  storeId: string;
  store?: Record<string, unknown>;
  equipment?: EquipmentRecord[];
  lease?: Record<string, unknown> | null;
  realEstate?: Record<string, unknown> | null;
}): Promise<StoreReportData> {
  const supabase = createClient();
  const camMonthly = args.lease?.cam_charges != null ? Number(args.lease.cam_charges) : 0;

  const [financial, valuation] = await Promise.all([
    fetchReportFinancialContext(supabase, args.storeId, {
      camMonthly,
      store: args.store,
      equipment: args.equipment,
      lease: args.lease,
      realEstate: args.realEstate,
    }),
    getStoreValuation(args.storeId),
  ]);

  const storeForScore = {
    ...(args.store ?? valuation.store),
    annual_debt_service: financial.annualDebtService,
    loan_balance: financial.totalOutstandingDebt,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("[getStoreReportData] TTM months used:", financial.ttm.monthsUsed);
    console.log("[getStoreReportData] TTM revenue:", financial.revenueTtmTotal);
    console.log("[getStoreReportData] chartData:", financial.ttmChartData);
  }

  const laundroCfoScore = computeLaundroCfoScoreFromRaw({
    store: storeForScore,
    equipment: args.equipment ?? (valuation.context.equipment as EquipmentRecord[]),
    lease: args.lease ?? valuation.context.lease,
    realEstate: args.realEstate ?? valuation.context.realEstate,
    monthlyFinancials: financial.monthlyFinancialsForScore,
    monthlyUtilities: financial.monthlyUtilities,
    ttmMonthsUsed: financial.ttm.monthsUsed,
  });

  return { financial, valuation, laundroCfoScore };
}

export function buildEquitySnapshot(
  storeValue: number,
  totalDebt: number
): { storeValue: number; debt: number; equity: number } {
  return {
    storeValue,
    debt: totalDebt,
    equity: storeValue - totalDebt,
  };
}
