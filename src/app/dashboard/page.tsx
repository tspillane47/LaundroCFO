"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { canShowStoreValuation, getStoreValuation, getStoreDebt, getStoreScheduledDebtService, hasMonthlyFinancialRecords, type StoreValuationResult } from "@/lib/getStoreValuation";
import { MissingMarketRentPrompt } from "@/components/valuation/MissingMarketRentPrompt";
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
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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
import { FinancialDataConfidenceNote } from "@/components/ui/FinancialDataConfidenceNote";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";
import { CashCard } from "@/components/ui/CashCard";
import { PageError } from "@/components/ui/PageError";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ValueChangeIndicator } from "@/components/ui/ValueChangeIndicator";
import { BankBalancesPanel } from "@/components/ui/BankBalancesPanel";
import {
  formatCashPositionSubtext,
  LiveFromBankBadge,
} from "@/components/ui/CashPositionIndicator";
import { computeStoreCashPosition } from "@/lib/cashPosition";
import {
  buildRevenueEbitdaChartData,
  buildValuationHistorySeries,
  computeValuationDeltas,
  hasEnoughChartHistory,
  INSUFFICIENT_HISTORY_MESSAGE,
} from "@/lib/valuationHistory";
import { RevenueEbitdaBarChart } from "@/components/dashboard/RevenueEbitdaBarChart";

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

function formatAxisValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value}`;
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

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg p-3 text-xs shadow-lg"
      style={{ background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
    >
      <div style={{ color: "var(--text-muted)" }} className="mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="font-semibold">
          {p.name}: {typeof p.value === "number" && p.dataKey !== "month" ? fmtDollar(p.value) : p.value}
        </div>
      ))}
    </div>
  );
};

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

      const [debt, scheduledAnnual, financialsData, { data: utilitiesData, error: utilitiesError }, uncategorizedCounts, plaidConnected, plaidBalances] =
        await Promise.all([
        getStoreDebt(loadedStore.id),
        getStoreScheduledDebtService(loadedStore.id),
        fetchStoreMonthlyFinancials(supabase, loadedStore.id),
        supabase.from("monthly_utilities").select("*").eq("store_id", loadedStore.id),
        fetchUncategorizedReviewCountsByStore(supabase, [loadedStore.id]),
        storeHasPlaidConnections(loadedStore.id),
        getStorePlaidBalanceSnapshot(loadedStore.id),
      ]);
      setTotalDebt(debt);
      setScheduledDebtService(scheduledAnnual);
      setUncategorizedTransactionCount(uncategorizedCounts[loadedStore.id] ?? 0);
      setHasPlaidConnections(plaidConnected);
      setPlaidBalanceSnapshot(plaidBalances);
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
  const cashPositionComposition = cashPosition.source === "plaid" ? "all_live" : "all_manual";
  const businessValue = estimatedValue;
  const equity = hasFinancialData && canShowValuation ? businessValue + totalCash - totalDebt : 0;

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

  const valuationTrend = useMemo(
    () =>
      valuationHistorySeries
        .slice(-12)
        .map(({ label, value }) => ({ month: label, value })),
    [valuationHistorySeries]
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
      monthlyFinancials: monthlyFinancials.map((r) => ({
        revenue: r.revenue,
        utilities: r.utilities,
        ebitda: r.ebitda,
      })),
      monthlyUtilities,
    });
  }, [store, hasFinancialData, valuation, scheduledDebtService, equipment, lease, realEstate, monthlyFinancials, monthlyUtilities]);

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

      {/* Section 1: Hero Valuation Banner */}
      <div className="hero-value-card">
        <div style={{ fontSize: '12px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          Estimated Store Value
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          {canShowValuation ? (
            <>
              <AnimatedNumber value={estimatedValue} prefix="$" className="hero-value-text" duration={1200} />
              <ValueChangeIndicator value={estimatedValue} />
            </>
          ) : (
            <span className="hero-value-text">—</span>
          )}
        </div>
        {canShowValuation && (monthlyChange != null || yearChangePct != null) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            {monthlyChange != null && (
              <span
                style={{
                  background: monthlyChange >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: monthlyChange >= 0 ? '#4ade80' : '#f87171',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                {monthlyChange >= 0 ? "+" : ""}{fmtDollar(monthlyChange)} this month
              </span>
            )}
            {yearChangePct != null && (
              <span
                style={{
                  background: yearChangePct >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: yearChangePct >= 0 ? '#4ade80' : '#f87171',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                {yearChangePct >= 0 ? "+" : ""}{yearChangePct.toFixed(1)}% vs last year
              </span>
            )}
          </div>
        )}
        <FinancialDataConfidenceNote monthsUsed={ttmMonthsUsed} variant="hero" className="mt-2" />
        {missingMarketRent && <MissingMarketRentPrompt variant="hero" className="mt-2" />}
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '12px', lineHeight: 1.6 }}>
          {canShowValuation
            ? `Based on ${fmtMultiple(finalMultiple)} EBITDA multiple · Equipment grade B · ${leaseMetrics ? `${leaseMetrics.yearsRemaining.toFixed(1)}yr lease` : "—"} · ${sqft.toLocaleString()} SF`
            : missingMarketRent
              ? null
              : "Add monthly financials to estimate store value."}
        </div>
      </div>

      {hasPlaidConnections && plaidBalanceSnapshot && (
        <BankBalancesPanel
          cashOnHand={plaidBalanceSnapshot.cashOnHand}
          creditCardDebt={plaidBalanceSnapshot.creditCardDebt}
          cashSub={`${formatPlaidAccountCount(plaidBalanceSnapshot.depositoryAccountCount, "depository account")} · Last synced ${formatPlaidLastSynced(plaidBalanceSnapshot.lastSyncedAt)} · Synced from connected bank accounts`}
          creditSub={`${formatPlaidAccountCount(plaidBalanceSnapshot.creditAccountCount, "credit account")} · Last synced ${formatPlaidLastSynced(plaidBalanceSnapshot.lastSyncedAt)} · Credit card balances from connected banks`}
        />
      )}

      {/* Section 2: KPI Cards */}
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

      {/* Financial Position */}
      <div className="metric-grid">
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.2s" }}
          label="Business Value"
          value={
            canShowValuation ? (
              <AnimatedNumber value={businessValue} prefix="$" duration={1000} />
            ) : (
              "—"
            )
          }
          sub={
            canShowValuation
              ? `${fmtMultiple(finalMultiple)} EBITDA multiple`
              : missingMarketRent
                ? "Enter an estimated market rent to get an accurate valuation"
                : "Add monthly financials"
          }
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.25s" }}
          label={
            <span className="inline-flex flex-wrap items-center gap-2">
              Cash Position
              {hasFinancialData && cashPositionComposition === "all_live" && <LiveFromBankBadge />}
            </span>
          }
          value={
            hasFinancialData ? (
              <AnimatedNumber value={totalCash} prefix="$" duration={1000} />
            ) : (
              "—"
            )
          }
          sub={
            hasFinancialData
              ? formatCashPositionSubtext(cashPositionComposition, cashPositionComposition === "all_live" ? 1 : 0, 1) ??
                undefined
              : "Add monthly financials"
          }
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.3s" }}
          label="Total Debt"
          value={<AnimatedNumber value={totalDebt} prefix="$" duration={1000} />}
          sub="Outstanding loan balance"
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.35s" }}
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

      {/* Section 3: Two Column Layout */}
      <div className="grid-3 grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* Left Column */}
        <div className="xl:col-span-2 space-y-4">
          {/* Valuation Trend Chart */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title mb-0">12-Month Valuation Trend</div>
              <div className="text-[20px] font-bold" style={{ color: "var(--accent)" }}>
                {canShowValuation ? fmtDollar(estimatedValue) : "—"}
              </div>
            </div>
            <div className="h-[220px]">
              {valuationTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={valuationTrend}>
                  <defs>
                    <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatAxisValue}
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Valuation"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#valGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[13px] text-center px-4" style={{ color: "var(--text-muted)" }}>
                  {missingMarketRent ? (
                    <MissingMarketRentPrompt variant="inline" />
                  ) : hasFinancialData ? (
                    INSUFFICIENT_HISTORY_MESSAGE
                  ) : (
                    "Add monthly financials to see valuation trend."
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Revenue vs EBITDA */}
          <RevenueEbitdaBarChart data={revenueEbitdaData} hasFinancialData={hasFinancialData} />

          <HowYouCompareCard benchmarks={benchmarks} hasFinancialData={hasFinancialData} />
        </div>

        <IntelligenceFeedMobileShell items={feedItems} />
        <IntelligenceFeedPanel items={feedItems} />
      </div>

      {/* Section 4: Bottom Summary Row */}
      <div className="grid-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Lease & Occupancy */}
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

        {/* Equipment */}
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

        {/* Cash Position */}
        <CashCard
          store={storeData}
          hasFinancialData={hasFinancialData}
          hasPlaidConnection={hasPlaidConnections}
          plaidSnapshot={plaidBalanceSnapshot}
          onUpdate={(data) => {
            setStoreData(data);
            setStore(data);
          }}
        />
      </div>

      {/* Valuation Summary */}
      <div className="card">
        <div className="section-title mb-4">Valuation Summary</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { label: "Est. Value", value: canShowValuation ? fmtDollar(estimatedValue) : "—" },
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
  );
}
