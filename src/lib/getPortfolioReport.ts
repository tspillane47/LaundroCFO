import { createClient } from "@/lib/supabase";
import { getStoreValuation, getStoreDebt } from "@/lib/getStoreValuation";

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
    dscr: number;
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
    globalDSCR: number;
    globalLTV: number;
    debtYield: number;
    debtToEbitda: number;
    storeCount: number;
  };
  cashFlow: {
    revenue: number;
    utilities: number;
    rent: number;
    payroll: number;
    repairs: number;
    otherExpenses: number;
    ebitda: number;
    debtService: number;
    cashFlowAfterDebt: number;
  };
}

export async function getPortfolioReport(userId: string): Promise<PortfolioReportData> {
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

  const storeDetails = await Promise.all(
    stores.map(async (store) => {
      const valuation = await getStoreValuation(store.id);
      const debt = await getStoreDebt(store.id);
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
      const { data: loans } = await supabase
        .from("store_loans")
        .select("*")
        .eq("store_id", store.id)
        .eq("is_active", true);

      const annualRevenue = (store.monthly_revenue ?? 0) * 12;
      const annualEbitda = ((store.monthly_revenue ?? 0) - (store.monthly_expenses ?? 0)) * 12;
      const annualDebtService = (loans ?? []).reduce((s, l) => s + (l.monthly_payment ?? 0) * 12, 0);
      const dscr = annualDebtService > 0 ? annualEbitda / annualDebtService : 0;

      const equity = valuation.businessValue - debt + cash;

      let leaseScore = 50;
      let yearsRemaining = 0;
      if (lease?.lease_end_date) {
        yearsRemaining =
          (new Date(lease.lease_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);
        if (yearsRemaining >= 10) leaseScore += 30;
        else if (yearsRemaining >= 5) leaseScore += 20;
        else if (yearsRemaining >= 3) leaseScore += 10;
        const availableOptions = (leaseOptions ?? []).filter((o) => o.status === "Available").length;
        if (availableOptions >= 2) leaseScore += 10;
        else if (availableOptions === 1) leaseScore += 5;
        if (lease.exclusivity_clause) leaseScore += 5;
        if (lease.assignment_rights === "Not Allowed") leaseScore -= 5;
      }
      leaseScore = Math.min(100, Math.max(0, leaseScore));

      const currentYear = new Date().getFullYear();
      const totalMachines = (equipment ?? []).reduce((s, e) => s + e.quantity, 0);
      const avgEquipmentAge =
        totalMachines > 0
          ? (equipment ?? []).reduce(
              (s, e) => s + e.quantity * (currentYear - e.installation_year),
              0
            ) / totalMachines
          : (store.avg_machine_age ?? 0);

      let equipScore = 60;
      if (avgEquipmentAge < 5) equipScore += 30;
      else if (avgEquipmentAge < 8) equipScore += 20;
      else if (avgEquipmentAge < 12) equipScore += 10;
      else if (avgEquipmentAge >= 15) equipScore -= 10;
      const equipmentGrade =
        equipScore >= 90 ? "A" : equipScore >= 75 ? "B" : equipScore >= 60 ? "C" : "D";

      const availableLeaseOptions = (leaseOptions ?? []).filter((o) => o.status === "Available").length;

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
  const portfolioCash = storeDetails.reduce((s, d) => s + d.cash, 0);
  const portfolioEquity = portfolioValue - portfolioDebt + portfolioCash;
  const portfolioNetWorth = portfolioValue + portfolioCash - portfolioDebt;
  const annualRevenue = storeDetails.reduce((s, d) => s + d.annualRevenue, 0);
  const annualEbitda = storeDetails.reduce((s, d) => s + d.annualEbitda, 0);
  const annualDebtService = storeDetails.reduce((s, d) => s + d.annualDebtService, 0);
  const globalDSCR = annualDebtService > 0 ? annualEbitda / annualDebtService : 0;
  const globalLTV = portfolioValue > 0 ? (portfolioDebt / portfolioValue) * 100 : 0;
  const debtYield = portfolioDebt > 0 ? (annualEbitda / portfolioDebt) * 100 : 0;
  const debtToEbitda = annualEbitda > 0 ? portfolioDebt / annualEbitda : 0;

  const cashFlow = {
    revenue: annualRevenue,
    utilities: storeDetails.reduce((s, d) => s + ((d.store.monthly_expenses ?? 0) * 0.25) * 12, 0),
    rent: storeDetails.reduce((s, d) => s + (d.store.monthly_rent ?? 0) * 12, 0),
    payroll: storeDetails.reduce((s, d) => s + ((d.store.monthly_expenses ?? 0) * 0.35) * 12, 0),
    repairs: storeDetails.reduce((s, d) => s + ((d.store.monthly_expenses ?? 0) * 0.05) * 12, 0),
    otherExpenses: storeDetails.reduce((s, d) => s + ((d.store.monthly_expenses ?? 0) * 0.35) * 12, 0),
    ebitda: annualEbitda,
    debtService: annualDebtService,
    cashFlowAfterDebt: annualEbitda - annualDebtService,
  };

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
