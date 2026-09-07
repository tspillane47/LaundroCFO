"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { canShowStoreValuation, getStoreValuation, getStoreDebt, getStoreScheduledDebtService, hasMonthlyFinancialRecords, type StoreValuationResult } from "@/lib/getStoreValuation";
import { calcEquipmentScore, calcLeaseScore, DSCR_NO_DEBT_LABEL, fmtDollar, fmtMultiple } from "@/lib/calculations";
import { computeStoreDscr } from "@/lib/dscr";
import {
  applyLoanDebtServiceToTtm,
  buildUtilitiesLookup,
  calcTtmMetrics,
  enrichMonthlyRecords,
  fetchStoreMonthlyFinancials,
  fetchUncategorizedReviewCountsByStore,
  sortRecordsDesc,
  ttmWindowRecords,
  type CalculatedMonthly,
  type MonthlyUtilityRecord,
} from "@/lib/financials";
import { computeLaundroCfoScoreFromRaw, type LaundroCfoScoreResult } from "@/lib/laundroCfoScore";
import {
  getStorePlaidBalanceSnapshot,
  storeHasPlaidConnections,
  type PlaidBalanceSnapshot,
} from "@/lib/plaidBalances";
import {
  calcBuildingEquity,
  calcOccupancyCostRatioFromRent,
  calcRealEstateLTV,
} from "@/lib/real-estate-calculations";
import type { EquipmentRecord } from "@/lib/equipment";
import { generateStoreFeed } from "@/lib/intelligence";
import { IntelligenceFeedMobileShell } from "@/components/ui/IntelligenceFeedMobileShell";
import { IntelligenceFeedPanel } from "@/components/ui/IntelligenceFeedPanel";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddStoreLink } from "@/components/ui/AddStoreLink";
import { CopyableEmail } from "@/components/onboarding/CopyableEmail";
import { JOIN_STORE_SETTINGS_HINT } from "@/lib/onboarding";
import { useOnboardingStatus } from "@/lib/useOnboardingStatus";
import { KpiCard } from "@/components/ui/KpiCard";
import { DSCRCard } from "@/components/ui/DSCRCard";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";
import { PageError } from "@/components/ui/PageError";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { BankBalancesPanel, MANUAL_CASH_SUBTEXT } from "@/components/ui/BankBalancesPanel";
import { ManualCashEditor } from "@/components/ui/ManualCashEditor";
import { formatCashPositionSubtext } from "@/components/ui/CashPositionIndicator";
import { computeStoreCashPosition } from "@/lib/cashPosition";
import { resolveOccupancyRentDisplay } from "@/lib/storeCanonical";
import {
  buildThisMonthChartModel,
  fetchThisMonthBankTransactions,
  type ThisMonthTransaction,
} from "@/lib/thisMonthChart";
import {
  buildRevenueEbitdaChartData,
  buildValuationHistorySeries,
  computeValuationDeltas,
  hasEnoughChartHistory,
} from "@/lib/valuationHistory";
import { CompactEstimatedStoreValue } from "@/components/dashboard/CompactEstimatedStoreValue";
import { RevenueEbitdaBarChart } from "@/components/dashboard/RevenueEbitdaBarChart";
import { ThisMonthChart } from "@/components/dashboard/ThisMonthChart";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearsRemaining(endDate: string | null): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  const now = new Date();
  const ms = end.getTime() - now.getTime();
  return Math.max(0, ms / (365.25 * 24 * 60 * 60 * 1000));
}

function formatPlaidLastSynced(iso: string | null): string {
  if (!iso) return "Not synced yet";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPlaidAccountCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function cashRunwayDays(totalCash: number, monthlyExpenses: number): number | null {
  if (!(monthlyExpenses > 0)) return null;
  return Math.round(totalCash / (monthlyExpenses / 30));
}

function cashRunwayColor(days: number | null, hasFinancialData: boolean): string {
  if (!hasFinancialData || days == null) return "var(--text-muted)";
  if (days < 14) return "var(--text-danger)";
  if (days < 30) return "var(--text-warning)";
  return "var(--text-success)";
}

type BenchmarkRow = {
  label: string;
  value: string;
  median: number;
  storeValue: number;
  displayMedian: string;
  invert: boolean;
};

function HowYouCompareCard({
  benchmarks,
  hasFinancialData,
}: {
  benchmarks: BenchmarkRow[];
  hasFinancialData: boolean;
}) {
  return (
    <div className="card">
      <div className="section-title">How You Compare</div>
      <div className="space-y-0">
        {benchmarks.map((b) => {
          const aboveMedian =
            hasFinancialData &&
            (b.invert ? b.storeValue < b.median : b.storeValue >= b.median);
          return (
            <div
              key={b.label}
              className="flex items-center justify-between py-2.5 text-[12px] border-b last:border-b-0"
              style={{ borderColor: "var(--border)" }}
            >
              <span style={{ color: "var(--text-secondary)" }}>{b.label}</span>
              <div className="text-right">
                <span
                  className="font-semibold tabular-nums"
                  style={{
                    color: !hasFinancialData
                      ? "var(--text-muted)"
                      : aboveMedian
                        ? "var(--text-success)"
                        : "var(--text-warning)",
                  }}
                >
                  {b.value}
                </span>
                <span className="text-[10px] ml-2" style={{ color: "var(--text-muted)" }}>
                  vs {b.displayMedian} median
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { stores, selectedStore, isAllStores, setSelectedStore, setIsAllStores, loading: storesLoading } = useStores();
  const { isJoining, userEmail, loading: onboardingStatusLoading } = useOnboardingStatus();
  const [store, setStore] = useState<any>(null);
  const [storeData, setStoreData] = useState<any>(null);
  const [lease, setLease] = useState<any>(null);
  const [leaseOptions, setLeaseOptions] = useState<any[]>([]);
  const [realEstate, setRealEstate] = useState<any>(null);
  const [insuranceCount, setInsuranceCount] = useState(0);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [insurancePolicies, setInsurancePolicies] = useState<any[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [detailLoading, setDetailLoading] = useState(true);
  const [valuation, setValuation] = useState<StoreValuationResult | null>(null);
  const [totalDebt, setTotalDebt] = useState(0);
  const [scheduledDebtService, setScheduledDebtService] = useState(0);
  const [monthlyFinancials, setMonthlyFinancials] = useState<CalculatedMonthly[]>([]);
  const [monthlyUtilities, setMonthlyUtilities] = useState<MonthlyUtilityRecord[]>([]);
  const [uncategorizedTransactionCount, setUncategorizedTransactionCount] = useState(0);
  const [hasPlaidConnections, setHasPlaidConnections] = useState(false);
  const [plaidBalanceSnapshot, setPlaidBalanceSnapshot] = useState<PlaidBalanceSnapshot | null>(null);
  const [thisMonthTransactions, setThisMonthTransactions] = useState<ThisMonthTransaction[]>([]);
  const supabase = createClient();

  const loadDashboardData = useCallback(async () => {
    if (!selectedStore) {
      setStore(null);
      setValuation(null);
      setTotalDebt(0);
      setScheduledDebtService(0);
      setMonthlyFinancials([]);
      setMonthlyUtilities([]);
      setUncategorizedTransactionCount(0);
      setHasPlaidConnections(false);
      setPlaidBalanceSnapshot(null);
      setThisMonthTransactions([]);
      setLoadError(false);
      setDetailLoading(false);
      return;
    }

    const loadedStore = selectedStore;
    setStore(loadedStore);
    setStoreData(loadedStore);
    setDetailLoading(true);
    setLoadError(false);

    try {
      const storeValuation = await getStoreValuation(loadedStore.id);
      setValuation(storeValuation);

      const [debt, scheduledAnnual, financialsData, { data: utilitiesData, error: utilitiesError }, uncategorizedCounts, plaidConnected, plaidBalances, monthTransactions] =
        await Promise.all([
        getStoreDebt(loadedStore.id),
        getStoreScheduledDebtService(loadedStore.id),
        fetchStoreMonthlyFinancials(supabase, loadedStore.id),
        supabase.from("monthly_utilities").select("*").eq("store_id", loadedStore.id),
        fetchUncategorizedReviewCountsByStore(supabase, [loadedStore.id]),
        storeHasPlaidConnections(loadedStore.id),
        getStorePlaidBalanceSnapshot(loadedStore.id),
        fetchThisMonthBankTransactions(supabase, loadedStore.id),
      ]);
      setTotalDebt(debt);
      setScheduledDebtService(scheduledAnnual);
      setUncategorizedTransactionCount(uncategorizedCounts[loadedStore.id] ?? 0);
      setHasPlaidConnections(plaidConnected);
      setPlaidBalanceSnapshot(plaidBalances);
      setThisMonthTransactions(monthTransactions);
      if (utilitiesError) throw utilitiesError;
      const utilitiesLookup = buildUtilitiesLookup((utilitiesData ?? []) as MonthlyUtilityRecord[]);
      setMonthlyUtilities((utilitiesData ?? []) as MonthlyUtilityRecord[]);
      setMonthlyFinancials(enrichMonthlyRecords(sortRecordsDesc(financialsData), utilitiesLookup));

      const [{ data: policiesData, error: policiesError }, { data: equipmentData, error: equipmentError }] =
        await Promise.all([
          supabase
            .from("insurance_policies")
            .select("*")
            .eq("store_id", loadedStore.id)
            .eq("is_active", true),
          supabase
            .from("equipment_inventory")
            .select("*")
            .eq("store_id", loadedStore.id),
        ]);

      if (policiesError) throw policiesError;
      if (equipmentError) throw equipmentError;

      setInsurancePolicies(policiesData ?? []);
      setInsuranceCount(policiesData?.length ?? 0);
      setEquipment(equipmentData ?? []);

      if (loadedStore.occupancy_type === "owner_occupied") {
        const { data: reData, error: reError } = await supabase
          .from("real_estate")
          .select("*")
          .eq("store_id", loadedStore.id)
          .limit(1)
          .maybeSingle();
        if (reError) throw reError;
        setRealEstate(reData);
        setLease(null);
        setLeaseOptions([]);
      } else {
        setRealEstate(null);
        const { data: leaseData, error: leaseError } = await supabase
          .from("leases")
          .select("*")
          .eq("store_id", loadedStore.id)
          .limit(1)
          .maybeSingle();
        if (leaseError) throw leaseError;

        if (leaseData) {
          setLease(leaseData);
          const { data: optionsData, error: optionsError } = await supabase
            .from("lease_options")
            .select("*")
            .eq("lease_id", leaseData.id)
            .order("option_number", { ascending: true });
          if (optionsError) throw optionsError;
          setLeaseOptions(optionsData ?? []);
        } else {
          setLease(null);
          setLeaseOptions([]);
        }
      }
    } catch {
      setLoadError(true);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedStore, supabase]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  function openStore(s: (typeof stores)[0]) {
    setSelectedStore(s);
    setIsAllStores(false);
    router.push("/dashboard");
  }

  const resolvedFinancials = valuation?.resolvedFinancials;
  const hasFinancialData = hasMonthlyFinancialRecords(resolvedFinancials);
  const isOwnerOccupied = store?.occupancy_type === "owner_occupied";
  const canShowValuation = canShowStoreValuation(
    resolvedFinancials,
    store,
    realEstate
  );
  const missingMarketRent = isOwnerOccupied && hasFinancialData && !canShowValuation;

  const revenue = hasFinancialData ? (resolvedFinancials?.monthlyRevenue ?? 0) : 0;
  const expenses = hasFinancialData ? (resolvedFinancials?.monthlyExpenses ?? 0) : 0;
  const ebitda = hasFinancialData ? revenue - expenses : 0;
  const annualEbitda = hasFinancialData ? (resolvedFinancials?.annualEbitda ?? 0) : 0;
  const debtService = scheduledDebtService;
  const ttm = useMemo(
    () => applyLoanDebtServiceToTtm(calcTtmMetrics(monthlyFinancials), scheduledDebtService),
    [monthlyFinancials, scheduledDebtService]
  );
  const ttmNoi = hasFinancialData ? ttm.ttmNoi : 0;
  const annualCashFlow = hasFinancialData ? annualEbitda - debtService : 0;
  const monthlyCashFlow = hasFinancialData ? annualCashFlow / 12 : 0;
  const dscrNum = hasFinancialData ? computeStoreDscr(annualEbitda, debtService) : null;
  const ebitdaMargin = hasFinancialData && revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const utilities = hasFinancialData ? (store?.monthly_utilities ?? 0) : 0;
  const utilityRatio = hasFinancialData && revenue > 0 ? (utilities / revenue) * 100 : 0;
  const sqft = store?.square_footage ?? 0;
  const revenuePerSF = hasFinancialData && sqft > 0 ? (revenue * 12) / sqft : 0;
  const avgEquipmentAge = store?.avg_machine_age ?? 0;
  const equipmentScore = calcEquipmentScore(avgEquipmentAge);
  const machines = (store?.washers ?? 0) + (store?.dryers ?? 0);

  const ttmMonthsUsed = resolvedFinancials?.ttmMonthsUsed ?? ttm.monthsUsed;

  const estimatedValue =
    valuation && canShowValuation ? Math.round(valuation.businessValue) : 0;
  const finalMultiple = valuation && canShowValuation ? valuation.finalMultiple : 0;

  const cashPosition = useMemo(
    () =>
      computeStoreCashPosition(
        {
          operating_account_balance: storeData?.operating_account_balance,
          reserve_account_balance: storeData?.reserve_account_balance,
          petty_cash: storeData?.petty_cash,
        },
        hasPlaidConnections,
        plaidBalanceSnapshot ?? undefined
      ),
    [storeData, hasPlaidConnections, plaidBalanceSnapshot]
  );
  const totalCash = hasFinancialData ? cashPosition.amount : 0;
  const isCashLive = cashPosition.source === "plaid";
  const businessValue = estimatedValue;
  const equity = hasFinancialData && canShowValuation ? businessValue + totalCash - totalDebt : 0;
  const monthlyExpenses = hasFinancialData ? (resolvedFinancials?.monthlyExpenses ?? 0) : 0;
  const runwayDays = hasFinancialData ? cashRunwayDays(totalCash, monthlyExpenses) : null;
  const occupancyRent =
    hasFinancialData && (resolvedFinancials?.monthlyRent ?? 0) > 0
      ? resolvedFinancials?.monthlyRent ?? null
      : resolveOccupancyRentDisplay(lease, realEstate, isOwnerOccupied);
  const occupancyCostPct =
    hasFinancialData && occupancyRent != null
      ? calcOccupancyCostRatioFromRent(occupancyRent, revenue)
      : null;

  const leaseMetrics = useMemo(() => {
    if (!lease) return null;
    const yearsRemaining = calcYearsRemaining(lease.lease_end_date);
    const available = leaseOptions.filter((o) => o.status === "Available");
    const optionYears = available.reduce((s: number, o: any) => s + (o.option_years ?? 0), 0);
    const score = calcLeaseScore({
      yearsRemaining,
      availableOptions: available.length,
      exclusivityClause: lease.exclusivity_clause ?? false,
      personalGuaranty: lease.personal_guaranty ?? false,
      assignmentRights: lease.assignment_rights ?? null,
      monthlyRent: lease.monthly_rent ?? null,
      monthlyRevenue: hasFinancialData ? revenue : null,
    });
    const end = parseDate(lease.lease_end_date);
    const expires = end
      ? end.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : "—";

    return {
      score,
      yearsRemaining,
      availableCount: available.length,
      optionYears,
      totalControl: yearsRemaining + optionYears,
      expires,
    };
  }, [lease, leaseOptions, hasFinancialData, revenue]);

  const realEstateMetrics = useMemo(() => {
    if (!realEstate) return null;
    const equity = calcBuildingEquity(
      realEstate.estimated_value,
      realEstate.current_loan_balance
    );
    const ltv = calcRealEstateLTV(
      realEstate.current_loan_balance,
      realEstate.estimated_value
    );
    const occupancyCostRatio = calcOccupancyCostRatioFromRent(
      realEstate.monthly_rent_charged,
      hasFinancialData ? revenue : null
    );

    return {
      estimatedValue: realEstate.estimated_value,
      equity,
      ltv,
      occupancyCostRatio,
    };
  }, [realEstate, hasFinancialData, revenue]);

  const valuationHistorySeries = useMemo(() => {
    if (!canShowValuation || !valuation?.context || !hasEnoughChartHistory(monthlyFinancials)) return [];
    return buildValuationHistorySeries(valuation.context, monthlyFinancials);
  }, [canShowValuation, valuation?.context, monthlyFinancials]);

  const thisMonthChartModel = useMemo(
    () => buildThisMonthChartModel(thisMonthTransactions),
    [thisMonthTransactions]
  );

  const revenueEbitdaData = useMemo(
    () =>
      hasEnoughChartHistory(monthlyFinancials)
        ? buildRevenueEbitdaChartData(monthlyFinancials)
        : [],
    [monthlyFinancials]
  );

  const { monthlyChange, yearChangePct } = useMemo(
    () => computeValuationDeltas(valuationHistorySeries),
    [valuationHistorySeries]
  );

  const laundroCfoScoreResult = useMemo((): LaundroCfoScoreResult | null => {
    if (!store || !hasFinancialData) return null;

    const resolved = valuation?.resolvedFinancials;
    return computeLaundroCfoScoreFromRaw({
      store: {
        ...store,
        monthly_revenue: resolved?.monthlyRevenue ?? store.monthly_revenue,
        monthly_expenses: resolved?.monthlyExpenses ?? store.monthly_expenses,
        annual_debt_service: scheduledDebtService,
      },
      equipment: equipment as EquipmentRecord[],
      lease,
      realEstate,
      monthlyFinancials: ttmWindowRecords(monthlyFinancials).map((r) => ({
        year: r.year,
        month: r.month,
        revenue: r.revenue,
        utilities: r.utilities,
        ebitda: r.ebitda,
      })),
      monthlyUtilities,
      ttmMonthsUsed: ttm.monthsUsed,
    });
  }, [store, hasFinancialData, valuation, scheduledDebtService, equipment, lease, realEstate, monthlyFinancials, monthlyUtilities, ttm.monthsUsed]);

  const laundrocfoScore = laundroCfoScoreResult?.total ?? 0;

  const feedItems = useMemo(
    () =>
      store
        ? generateStoreFeed(store, lease, equipment, insurancePolicies, {
            scheduledAnnualDebtService: scheduledDebtService,
            resolvedFinancials,
            ttmRevenue: ttm.ttmRevenue,
            ttmUtilities: ttm.ttmUtilities,
            isOwnerOccupied,
            valuation:
              valuation && canShowValuation
                ? {
                    businessValue: valuation.businessValue,
                    finalMultiple: valuation.finalMultiple,
                  }
                : null,
            valuationMonthlyChange: monthlyChange ?? undefined,
            uncategorizedTransactionCount,
          })
        : [],
    [
      store,
      lease,
      equipment,
      insurancePolicies,
      scheduledDebtService,
      resolvedFinancials,
      isOwnerOccupied,
      valuation,
      canShowValuation,
      monthlyChange,
      ttm,
      uncategorizedTransactionCount,
    ]
  );

  if (loadError) {
    return <PageError onRetry={loadDashboardData} />;
  }

  const isDashboardLoading =
    storesLoading ||
    onboardingStatusLoading ||
    (!loadError && !!selectedStore && !isAllStores && (detailLoading || valuation === null));

  if (isDashboardLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="metric-card" />
          ))}
        </div>
        <LoadingSkeleton variant="chart" />
      </div>
    );
  }

  if (isAllStores && stores.length > 1) {
    return (
      <div className="space-y-5">
        <div className="card text-center py-10">
          <div className="text-[16px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Select a store from the dropdown above to view store details
          </div>
          <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>
            Or choose a store below to open its dashboard.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openStore(s)}
              className="card text-left hover:opacity-90 transition-opacity"
            >
              <div className="text-[16px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>{s.name}</div>
              <div className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>{s.address ?? "No address"}</div>
              <div className="text-[12px] font-medium text-blue-400">Open Store →</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!selectedStore && stores.length === 0) {
    if (isJoining) {
      return (
        <div className="space-y-5">
          <EmptyState
            icon="Store"
            title="Waiting for store access"
            description={`${JOIN_STORE_SETTINGS_HINT} Once the owner adds you, their store will appear here.`}
            ctaLabel="Go to Portfolio"
            ctaHref="/portfolio"
          />
          {userEmail ? (
            <div className="max-w-md mx-auto">
              <CopyableEmail email={userEmail} />
            </div>
          ) : null}
          <div className="text-center">
            <AddStoreLink
              className="text-[13px] font-medium underline underline-offset-2"
              href="/onboarding?add=true&switch=own"
            >
              Or set up your own store instead
            </AddStoreLink>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <EmptyState
          icon="Store"
          title="No stores yet"
          description="Add your first store to start tracking performance, financials, and alerts."
        />
        <div className="text-center">
          <AddStoreLink className="btn-primary inline-flex text-[13px]">
            Add Your First Store →
          </AddStoreLink>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="metric-card" />
          ))}
        </div>
        <LoadingSkeleton variant="chart" />
      </div>
    );
  }

  const benchmarks = [
    {
      label: "EBITDA Margin",
      value: hasFinancialData ? `${ebitdaMargin.toFixed(1)}%` : "—",
      median: 22,
      storeValue: ebitdaMargin,
      displayMedian: "22%",
      invert: false,
    },
    {
      label: "Revenue/SF",
      value: hasFinancialData ? `$${revenuePerSF.toFixed(0)}` : "—",
      median: 140,
      storeValue: revenuePerSF,
      displayMedian: "$140",
      invert: false,
    },
    {
      label: "DSCR",
      value: hasFinancialData && debtService > 0 && dscrNum != null ? `${dscrNum.toFixed(2)}x` : DSCR_NO_DEBT_LABEL,
      median: 1.5,
      storeValue: dscrNum ?? 0,
      displayMedian: "1.5x",
      invert: false,
    },
    {
      label: "Utility Ratio",
      value: hasFinancialData ? `${utilityRatio.toFixed(1)}%` : "—",
      median: 17,
      storeValue: utilityRatio,
      displayMedian: "17%",
      invert: true,
    },
  ];

  const compactValueProps = {
    canShowValuation,
    estimatedValue,
    finalMultiple,
    ttmMonthsUsed,
    missingMarketRent,
    monthlyChange,
    yearChangePct,
  };
  const showPlaidCredit = hasPlaidConnections && plaidBalanceSnapshot != null;
  const bankCashSub = !hasFinancialData
    ? "Add monthly financials"
    : isCashLive && plaidBalanceSnapshot
      ? `${formatPlaidAccountCount(plaidBalanceSnapshot.depositoryAccountCount, "depository account")} · Last synced ${formatPlaidLastSynced(plaidBalanceSnapshot.lastSyncedAt)} · Synced from connected bank accounts`
      : formatCashPositionSubtext("all_manual", 0, 1) ?? MANUAL_CASH_SUBTEXT;
  const bankCreditSub = showPlaidCredit
    ? `${formatPlaidAccountCount(plaidBalanceSnapshot.creditAccountCount, "credit account")} · Last synced ${formatPlaidLastSynced(plaidBalanceSnapshot.lastSyncedAt)} · Credit card balances from connected banks`
    : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold truncate" style={{ color: "var(--text-primary)", maxWidth: "100%" }}>
            {store.name ?? "Store Dashboard"}
          </h1>
          <p
            className="text-[14px] md:text-[12px] mt-0.5 truncate"
            style={{ color: "var(--text-muted)", maxWidth: "100%" }}
          >
            {store.address ?? "No address set"}
          </p>
        </div>
        <Link href="/settings" className="btn-outline text-[14px] md:text-[12px] w-full sm:w-auto text-center">
          Edit Store
        </Link>
      </div>

      <div className="hidden xl:block">
        <CompactEstimatedStoreValue {...compactValueProps} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 space-y-5 min-w-0">
          <ThisMonthChart model={thisMonthChartModel} />

          <IntelligenceFeedMobileShell items={feedItems} />

          <div className="xl:hidden">
            <CompactEstimatedStoreValue {...compactValueProps} />
          </div>

          <div className="metric-grid">
            <DSCRCard
              className="kpi-fade-in kpi-glow-card"
              style={{ animationDelay: "0s" }}
              dscr={dscrNum}
              scheduledAnnualDebtService={debtService}
              hasFinancialData={hasFinancialData}
              ttmMonthsUsed={ttmMonthsUsed}
            />

            <KpiCard
              className="kpi-fade-in kpi-glow-card"
              style={{ animationDelay: "0.05s" }}
              label={<DisclaimerLabel>EBITDA Margin</DisclaimerLabel>}
              value={
                hasFinancialData ? (
                  <AnimatedNumber value={ebitdaMargin} decimals={1} suffix="%" duration={1000} />
                ) : (
                  "—"
                )
              }
              sub={hasFinancialData ? `${fmtDollar(ebitda)}/mo EBITDA` : "Add monthly financials"}
            />

            <KpiCard
              className="kpi-fade-in kpi-glow-card"
              style={{ animationDelay: "0.1s" }}
              label={<DisclaimerLabel>LaundroCFO Score</DisclaimerLabel>}
              value={
                hasFinancialData && laundroCfoScoreResult ? (
                  <AnimatedNumber value={laundrocfoScore} duration={1000} />
                ) : (
                  "—"
                )
              }
              sub={
                !hasFinancialData
                  ? "Add monthly financials"
                  : laundroCfoScoreResult
                    ? [
                        `Grade ${laundroCfoScoreResult.grade}`,
                        laundroCfoScoreResult.metricsIncluded < laundroCfoScoreResult.metricsTotal
                          ? `${laundroCfoScoreResult.metricsIncluded}/${laundroCfoScoreResult.metricsTotal} metrics`
                          : null,
                        laundroCfoScoreResult.potentialScore != null
                          ? `Could reach ${laundroCfoScoreResult.potentialScore} with complete data`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "—"
              }
            />

            <KpiCard
              className="kpi-fade-in kpi-glow-card"
              style={{ animationDelay: "0.15s" }}
              label="Monthly Cash Flow"
              value={
                hasFinancialData ? (
                  <AnimatedNumber value={monthlyCashFlow} prefix="$" duration={1000} />
                ) : (
                  "—"
                )
              }
              sub={hasFinancialData ? `${fmtDollar(annualCashFlow)}/yr after debt service` : "Add monthly financials"}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              className="kpi-fade-in kpi-glow-card"
              style={{ animationDelay: "0.2s" }}
              label="Cash Runway"
              value={
                hasFinancialData && runwayDays != null ? (
                  <AnimatedNumber value={runwayDays} suffix=" days" duration={1000} />
                ) : (
                  "—"
                )
              }
              sub={
                hasFinancialData && monthlyExpenses > 0
                  ? `at ${fmtDollar(monthlyExpenses)}/mo expenses`
                  : "Add monthly financials"
              }
              valueColor={cashRunwayColor(runwayDays, hasFinancialData)}
            />

            <KpiCard
              className="kpi-fade-in kpi-glow-card"
              style={{ animationDelay: "0.25s" }}
              label="Total Debt"
              value={<AnimatedNumber value={totalDebt} prefix="$" duration={1000} />}
              sub="Outstanding loan balance"
            />

            <KpiCard
              className="kpi-fade-in kpi-glow-card"
              style={{ animationDelay: "0.3s" }}
              label="Net Equity"
              value={
                canShowValuation ? (
                  <AnimatedNumber value={equity} prefix="$" duration={1000} />
                ) : (
                  "—"
                )
              }
              sub={
                canShowValuation
                  ? "Value + cash − debt"
                  : missingMarketRent
                    ? "Enter an estimated market rent to get an accurate valuation"
                    : "Add monthly financials"
              }
              valueColor={
                canShowValuation
                  ? equity > 0
                    ? "var(--text-success)"
                    : "var(--text-danger)"
                  : "var(--text-muted)"
              }
            />
          </div>

          <BankBalancesPanel
            cashOnHand={totalCash}
            creditCardDebt={showPlaidCredit ? plaidBalanceSnapshot?.creditCardDebt : undefined}
            cashSub={bankCashSub}
            creditSub={bankCreditSub}
            isLiveFromBank={isCashLive}
            hasFinancialData={hasFinancialData}
          >
            <ManualCashEditor
              store={storeData}
              hasFinancialData={hasFinancialData}
              isLiveFromBank={isCashLive}
              onUpdate={(data) => {
                setStoreData(data);
                setStore(data);
              }}
            />
          </BankBalancesPanel>

          <RevenueEbitdaBarChart data={revenueEbitdaData} hasFinancialData={hasFinancialData} />

          <HowYouCompareCard benchmarks={benchmarks} hasFinancialData={hasFinancialData} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="section-title mb-0">
                  {isOwnerOccupied ? "Real Estate" : "Lease & Occupancy"}
                </div>
                <Link href="/lease" className="text-[11px] hover:underline" style={{ color: "var(--accent)" }}>
                  View →
                </Link>
              </div>
              {isOwnerOccupied ? (
                realEstateMetrics ? (
                  <div className="space-y-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    <div className="flex justify-between">
                      <span>Property Value</span>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {fmtDollar(realEstateMetrics.estimatedValue ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Building Equity</span>
                      <span className="font-semibold text-green-500">
                        {fmtDollar(realEstateMetrics.equity ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>LTV</span>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {realEstateMetrics.ltv != null ? `${realEstateMetrics.ltv.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No real estate profile on file.</p>
                )
              ) : leaseMetrics ? (
                <div className="space-y-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  <div className="flex justify-between">
                    <span>Lease Score</span>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {leaseMetrics.score}/100
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Years Remaining</span>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {leaseMetrics.yearsRemaining.toFixed(1)} yrs
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expires</span>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {leaseMetrics.expires}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
                    {leaseMetrics.yearsRemaining.toFixed(1)}yr base + {leaseMetrics.optionYears}yr options = {leaseMetrics.totalControl.toFixed(1)}yr total control
                  </div>
                </div>
              ) : (
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Add lease data to see score and term details.
                </p>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="section-title mb-0">Equipment</div>
                <Link href="/equipment" className="text-[11px] hover:underline" style={{ color: "var(--accent)" }}>
                  View →
                </Link>
              </div>
              <div className="space-y-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                <div className="flex justify-between">
                  <span>Equipment Score</span>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {equipmentScore}/100
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Age</span>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {avgEquipmentAge.toFixed(1)} years
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total Machines</span>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {machines}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
                  Avg {avgEquipmentAge.toFixed(1)}yr · 87% under 10yr · 0% over 15yr
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-title mb-4">Valuation Summary</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {[
                {
                  label: "Occupancy Cost",
                  value:
                    occupancyCostPct != null ? `${occupancyCostPct.toFixed(1)}%` : "—",
                },
                {
                  label: "Multiple",
                  value: canShowValuation ? fmtMultiple(finalMultiple) : "—",
                  tooltip: "Applied to annual EBITDA to estimate store value. Higher multiples reflect better lease, equipment, and market factors.",
                },
                { label: "Annual EBITDA", value: hasFinancialData ? fmtDollar(annualEbitda) : "—" },
                { label: "Annual Revenue", value: hasFinancialData ? fmtDollar(revenue * 12) : "—" },
                {
                  label: "NOI",
                  value: hasFinancialData ? fmtDollar(ttmNoi) : "—",
                },
                {
                  label: "DSCR",
                  value:
                    hasFinancialData && debtService > 0 && dscrNum != null
                      ? `${dscrNum.toFixed(2)}x`
                      : hasFinancialData
                        ? DSCR_NO_DEBT_LABEL
                        : "—",
                },
                { label: "Cash Flow", value: hasFinancialData ? fmtDollar(annualCashFlow) : "—" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="metric-label">
                    <DisclaimerLabel>{item.label}</DisclaimerLabel>
                  </div>
                  <div className="text-[16px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <IntelligenceFeedPanel items={feedItems} />
      </div>

    </div>
  );
}
