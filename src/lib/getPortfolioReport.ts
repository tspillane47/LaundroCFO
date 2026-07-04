import { createClient } from "@/lib/supabase";
import { calcDebtYield, calcLeaseScore } from "@/lib/calculations";
import {
  computeEquipmentMetrics,
  getEquipmentGrade,
  getEquipmentQualityScore,
  type EquipmentRecord,
} from "@/lib/equipment";
import {
  calcYearsRemaining,
  getStoreValuation,
  getStoreBusinessDebt,
} from "@/lib/getStoreValuation";
import {
  computePortfolioEquity,
  computePortfolioFinancialTotals,
  computePortfolioStoreDscr,
  sumPortfolioCash,
} from "@/lib/portfolioMetrics";
import {
  buildPortfolioTtmCashFlow,
  fetchAnnualDebtServiceByStore,
  fetchMonthlyFinancialsForStores,
  fetchMonthlyUtilitiesForStores,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecordWithStore,
  type PortfolioTtmCashFlow,
} from "@/lib/financials";

export interface PortfolioReportData {
  stores: any[];
  storeDetails: {
    store: any;
    valuation: any;
    debt: number;
    cash: number;
    equity: number;
    lease: any;
    equipment: any[];
    insurance: any[];
    annualRevenue: number;
    annualEbitda: number;
    annualDebtService: number;
    dscr: number | null;
    leaseScore: number;
    equipmentGrade: string;
    avgEquipmentAge: number;
    availableLeaseOptions: number;
    yearsRemaining: number;
  }[];
  totals: {
    portfolioValue: number;
    portfolioDebt: number;
    portfolioCash: number;
    portfolioEquity: number;
    portfolioNetWorth: number;
    annualRevenue: number;
    annualEbitda: number;
    annualDebtService: number;
    globalDSCR: number | null;
    globalLTV: number;
    debtYield: number;
    debtToEbitda: number;
    storeCount: number;
  };
  cashFlow: PortfolioTtmCashFlow;
}

export async function getPortfolioReport(
  userId: string,
  options?: {
    financialsData?: MonthlyFinancialRecord[];
    utilitiesData?: MonthlyUtilityRecordWithStore[];
    annualDebtByStore?: Record<string, number>;
  }
): Promise<PortfolioReportData> {
  const supabase = createClient();

  const { data: stores } = await supabase
    .from("stores")
    .select("*")
    .eq("user_id", userId)
    .eq("archived", false);

  if (!stores || stores.length === 0) {
    return {
      stores: [],
      storeDetails: [],
      totals: {
        portfolioValue: 0,
        portfolioDebt: 0,
        portfolioCash: 0,
        portfolioEquity: 0,
        portfolioNetWorth: 0,
        annualRevenue: 0,
        annualEbitda: 0,
        annualDebtService: 0,
        globalDSCR: 0,
        globalLTV: 0,
        debtYield: 0,
        debtToEbitda: 0,
        storeCount: 0,
      },
      cashFlow: {
        revenue: 0,
        utilities: 0,
        rent: 0,
        payroll: 0,
        repairs: 0,
        otherExpenses: 0,
        ebitda: 0,
        debtService: 0,
        cashFlowAfterDebt: 0,
      },
    };
  }

  const storeIds = stores.map((s) => s.id);
  const financialsData =
    options?.financialsData ??
    (await fetchMonthlyFinancialsForStores(supabase, storeIds));
  const utilitiesData =
    options?.utilitiesData ??
    (await fetchMonthlyUtilitiesForStores(supabase, storeIds));
  const annualDebtByStore =
    options?.annualDebtByStore ??
    (await fetchAnnualDebtServiceByStore(supabase, storeIds));

  const portfolioFinancials = computePortfolioFinancialTotals(
    financialsData,
    storeIds,
    annualDebtByStore,
    utilitiesData
  );
  const cashFlow = buildPortfolioTtmCashFlow(
    financialsData,
    storeIds,
    annualDebtByStore,
    utilitiesData
  );

  const storeDetails = await Promise.all(
    stores.map(async (store) => {
      const valuation = await getStoreValuation(store.id);
      const debt = await getStoreBusinessDebt(store.id);
      const cash =
        (store.operating_account_balance ?? 0) +
        (store.reserve_account_balance ?? 0) +
        (store.petty_cash ?? 0);

      const { data: lease } = await supabase
        .from("leases")
        .select("*")
        .eq("store_id", store.id)
        .maybeSingle();
      const { data: leaseOptions } = await supabase
        .from("lease_options")
        .select("*")
        .eq("lease_id", lease?.id ?? "");
      const { data: equipment } = await supabase
        .from("equipment_inventory")
        .select("*")
        .eq("store_id", store.id);
      const { data: insurance } = await supabase
        .from("insurance_policies")
        .select("*")
        .eq("store_id", store.id)
        .eq("is_active", true);

      const ttm = portfolioFinancials.summary.byStoreId[store.id];
      const hasTtm = (ttm?.monthsUsed ?? 0) > 0;
      const annualRevenue = hasTtm ? ttm.ttmRevenue : 0;
      const annualEbitda = hasTtm ? ttm.ttmEbitda : 0;
      const annualDebtService = annualDebtByStore[store.id] ?? 0;
      const dscr = computePortfolioStoreDscr(ttm, annualDebtService);

      const equity = computePortfolioEquity(valuation.businessValue, debt, cash);

      const yearsRemaining = lease ? calcYearsRemaining(lease.lease_end_date) : 0;
      const availableLeaseOptions = (leaseOptions ?? []).filter((o) => o.status === "Available").length;
      const monthlyRevenue =
        hasTtm && ttm.monthsUsed > 0 ? ttm.ttmRevenue / ttm.monthsUsed : null;
      const leaseScore = lease
        ? calcLeaseScore({
            yearsRemaining,
            availableOptions: availableLeaseOptions,
            exclusivityClause: lease.exclusivity_clause ?? false,
            personalGuaranty: lease.personal_guaranty ?? false,
            assignmentRights: lease.assignment_rights ?? null,
            monthlyRent: lease.monthly_rent ?? null,
            monthlyRevenue: monthlyRevenue != null && monthlyRevenue > 0 ? monthlyRevenue : null,
          })
        : store.occupancy_type === "owner_occupied"
          ? 95
          : 50;

      const equipRecords = (equipment ?? []) as EquipmentRecord[];
      const equipMetrics = computeEquipmentMetrics(equipRecords);
      const avgEquipmentAge =
        equipRecords.length > 0
          ? equipMetrics.weightedAvgAge
          : (store.avg_machine_age ?? 0);
      const equipmentGrade =
        equipRecords.length > 0
          ? equipMetrics.grade
          : getEquipmentGrade(getEquipmentQualityScore(avgEquipmentAge, 0, 0, []));

      return {
        store,
        valuation,
        debt,
        cash,
        equity,
        lease,
        equipment: equipment ?? [],
        insurance: insurance ?? [],
        annualRevenue,
        annualEbitda,
        annualDebtService,
        dscr,
        leaseScore,
        equipmentGrade,
        avgEquipmentAge,
        availableLeaseOptions,
        yearsRemaining,
      };
    })
  );

  const portfolioValue = storeDetails.reduce((s, d) => s + d.valuation.businessValue, 0);
  const portfolioDebt = storeDetails.reduce((s, d) => s + d.debt, 0);
  const portfolioCash = sumPortfolioCash(stores);
  const portfolioEquity = computePortfolioEquity(portfolioValue, portfolioDebt, portfolioCash);
  const portfolioNetWorth = portfolioEquity;
  const annualRevenue = storeDetails.reduce((s, d) => s + d.annualRevenue, 0);
  const annualEbitda = portfolioFinancials.annualEbitda;
  const annualDebtService = portfolioFinancials.annualDebtService;
  const globalDSCR = portfolioFinancials.globalDSCR;
  const globalLTV = portfolioValue > 0 ? (portfolioDebt / portfolioValue) * 100 : 0;
  const annualNoi = portfolioFinancials.summary.ttmEbitda - portfolioFinancials.annualDebtService;
  const debtYield = calcDebtYield(annualNoi, portfolioDebt);
  const debtToEbitda = annualEbitda > 0 ? portfolioDebt / annualEbitda : 0;

  return {
    stores,
    storeDetails,
    totals: {
      portfolioValue,
      portfolioDebt,
      portfolioCash,
      portfolioEquity,
      portfolioNetWorth,
      annualRevenue,
      annualEbitda,
      annualDebtService,
      globalDSCR,
      globalLTV,
      debtYield,
      debtToEbitda,
      storeCount: stores.length,
    },
    cashFlow,
  };
}
