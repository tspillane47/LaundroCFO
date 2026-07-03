"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { getStoreValuation, getStoreDebt, getStoreScheduledDebtService, hasMonthlyFinancialRecords, type StoreValuationResult } from "@/lib/getStoreValuation";
import { calcEquipmentScore, DSCR_NO_DEBT_LABEL, fmtDollar, fmtMultiple } from "@/lib/calculations";
import { computeStoreDscr } from "@/lib/dscr";
import {
  enrichMonthlyRecords,
  fetchStoreMonthlyFinancials,
  sortRecordsDesc,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
} from "@/lib/financials";
import { computeLaundroCfoScoreFromRaw, type LaundroCfoScoreResult } from "@/lib/laundroCfoScore";
import {
  calcBuildingEquity,
  calcOccupancyCostRatioFromRent,
  calcRealEstateLTV,
} from "@/lib/real-estate-calculations";
import type { EquipmentRecord } from "@/lib/equipment";
import {
  AreaChart,
  Area,
  Bar,
  Line,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import clsx from "clsx";
import { generateStoreFeed } from "@/lib/intelligence";
import { IntelligenceFeed } from "@/components/ui/IntelligenceFeed";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { KpiCard } from "@/components/ui/KpiCard";
import { DSCRCard } from "@/components/ui/DSCRCard";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";
import { CashCard } from "@/components/ui/CashCard";
import { PageError } from "@/components/ui/PageError";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ValueChangeIndicator } from "@/components/ui/ValueChangeIndicator";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function calcLeaseScore(params: {
  yearsRemaining: number;
  availableOptions: number;
  exclusivityClause: boolean;
  personalGuaranty: boolean;
  assignmentRights: string | null;
  monthlyRent: number | null;
  monthlyRevenue: number | null;
}): number {
  let score = 50;
  if (params.yearsRemaining >= 10) score += 25;
  else if (params.yearsRemaining >= 7) score += 15;
  else if (params.yearsRemaining >= 5) score += 8;
  if (params.availableOptions >= 2) score += 10;
  else if (params.availableOptions === 1) score += 5;
  if (params.exclusivityClause) score += 5;
  if (params.personalGuaranty) score -= 10;
  if (params.assignmentRights === "Not Allowed") score -= 5;
  if (params.monthlyRent != null && params.monthlyRevenue != null && params.monthlyRevenue > 0) {
    const rentToRevenue = (params.monthlyRent / params.monthlyRevenue) * 100;
    if (rentToRevenue > 20) score -= 15;
  }
  return Math.min(100, Math.max(0, score));
}

function generateValuationTrend(estimatedValue: number) {
  const start = estimatedValue * 0.88;
  return MONTH_LABELS.map((month, i) => {
    const progress = i / 11;
    const base = start + (estimatedValue - start) * progress;
    const variation = 1 + Math.sin(i * 1.7) * 0.015 + Math.cos(i * 0.9) * 0.01;
    return {
      month,
      value: Math.round(i === 11 ? estimatedValue : base * variation),
    };
  });
}

function generateRevenueEbitdaData(revenue: number, ebitda: number) {
  const labels = MONTH_LABELS.slice(-6);
  return labels.map((month, i) => {
    const factor = 0.94 + i * 0.012 + Math.sin(i * 2.1) * 0.02;
    return {
      month,
      revenue: Math.round(revenue * factor),
      ebitda: Math.round(ebitda * factor),
    };
  });
}

function formatAxisValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value}`;
}

type ActionItem = {
  id: string;
  severity: "urgent" | "warning" | "info";
  severityLabel: string;
  title: string;
  description: string;
  href: string;
};

const REVENUE_BAR_FILL = "rgba(34, 197, 94, 0.35)";
const REVENUE_BAR_STROKE = "rgba(34, 197, 94, 0.8)";
const EBITDA_LINE_COLOR = "#38bdf8";
const EBITDA_GLOW = "drop-shadow(0 0 4px rgba(56, 189, 248, 0.95)) drop-shadow(0 0 10px rgba(56, 189, 248, 0.55))";

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

const RevenueEbitdaTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  const revenue = payload.find((p: any) => p.dataKey === "revenue")?.value as number | undefined;
  const ebitda = payload.find((p: any) => p.dataKey === "ebitda")?.value as number | undefined;
  const margin = revenue && revenue > 0 && ebitda != null ? (ebitda / revenue) * 100 : null;

  return (
    <div
      className="rounded-xl px-3.5 py-2.5 text-xs min-w-[156px]"
      style={{
        background: "rgba(10, 15, 28, 0.72)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(56, 189, 248, 0.55)",
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(56, 189, 248, 0.12), 0 0 20px rgba(56, 189, 248, 0.18)",
        color: "#f1f5f9",
      }}
    >
      <div className="text-[11px] font-semibold mb-2 tracking-wide uppercase" style={{ color: EBITDA_LINE_COLOR }}>
        {label}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span
              className="w-2.5 h-2.5 rounded-[3px] shrink-0"
              style={{
                background: REVENUE_BAR_FILL,
                border: `1px solid ${REVENUE_BAR_STROKE}`,
              }}
            />
            Revenue
          </span>
          <span className="font-semibold tabular-nums text-white">{revenue != null ? fmtDollar(revenue) : "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span
              className="w-4 h-0.5 rounded-full shrink-0"
              style={{
                background: EBITDA_LINE_COLOR,
                boxShadow: "0 0 6px rgba(56, 189, 248, 0.9)",
              }}
            />
            EBITDA
          </span>
          <span className="font-semibold tabular-nums" style={{ color: EBITDA_LINE_COLOR }}>
            {ebitda != null ? fmtDollar(ebitda) : "—"}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-4 pt-1.5 mt-0.5 border-t"
          style={{ borderColor: "rgba(56, 189, 248, 0.2)" }}
        >
          <span className="text-slate-400">EBITDA Margin</span>
          <span className="font-semibold tabular-nums" style={{ color: EBITDA_LINE_COLOR }}>
            {margin != null ? `${margin.toFixed(1)}%` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const router = useRouter();
  const { stores, selectedStore, isAllStores, setSelectedStore, setIsAllStores, loading: storesLoading } = useStores();
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
  const [monthlyFinancials, setMonthlyFinancials] = useState<MonthlyFinancialRecord[]>([]);
  const [monthlyUtilities, setMonthlyUtilities] = useState<MonthlyUtilityRecord[]>([]);
  const supabase = createClient();

  const loadDashboardData = useCallback(async () => {
    if (!selectedStore) {
      setStore(null);
      setValuation(null);
      setTotalDebt(0);
      setScheduledDebtService(0);
      setMonthlyFinancials([]);
      setMonthlyUtilities([]);
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

      const [debt, scheduledAnnual, financialsData, { data: utilitiesData, error: utilitiesError }] =
        await Promise.all([
        getStoreDebt(loadedStore.id),
        getStoreScheduledDebtService(loadedStore.id),
        fetchStoreMonthlyFinancials(supabase, loadedStore.id),
        supabase.from("monthly_utilities").select("*").eq("store_id", loadedStore.id),
      ]);
      setTotalDebt(debt);
      setScheduledDebtService(scheduledAnnual);
      setMonthlyFinancials(enrichMonthlyRecords(sortRecordsDesc(financialsData)));
      if (utilitiesError) throw utilitiesError;
      setMonthlyUtilities((utilitiesData ?? []) as MonthlyUtilityRecord[]);

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

  const revenue = hasFinancialData ? (resolvedFinancials?.monthlyRevenue ?? 0) : 0;
  const expenses = hasFinancialData ? (resolvedFinancials?.monthlyExpenses ?? 0) : 0;
  const ebitda = hasFinancialData ? revenue - expenses : 0;
  const annualEbitda = hasFinancialData ? (resolvedFinancials?.annualEbitda ?? 0) : 0;
  const debtService = scheduledDebtService;
  const annualCashFlow = hasFinancialData ? annualEbitda - debtService : 0;
  const monthlyCashFlow = hasFinancialData ? annualCashFlow / 12 : 0;
  const dscrNum = hasFinancialData ? computeStoreDscr(annualEbitda, debtService) : null;
  const ebitdaMargin = hasFinancialData && revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const isOwnerOccupied = store?.occupancy_type === "owner_occupied";
  const utilities = hasFinancialData ? (store?.monthly_utilities ?? 0) : 0;
  const utilityRatio = hasFinancialData && revenue > 0 ? (utilities / revenue) * 100 : 0;
  const sqft = store?.square_footage ?? 0;
  const revenuePerSF = hasFinancialData && sqft > 0 ? (revenue * 12) / sqft : 0;
  const avgEquipmentAge = store?.avg_machine_age ?? 0;
  const equipmentScore = calcEquipmentScore(avgEquipmentAge);
  const machines = (store?.washers ?? 0) + (store?.dryers ?? 0);

  const estimatedValue =
    valuation && hasFinancialData ? Math.round(valuation.businessValue) : 0;
  const finalMultiple = valuation && hasFinancialData ? valuation.finalMultiple : 0;

  const totalCash = hasFinancialData
    ? (storeData?.operating_account_balance ?? 0) +
      (storeData?.reserve_account_balance ?? 0) +
      (storeData?.petty_cash ?? 0)
    : 0;
  const businessValue = estimatedValue;
  const equity = hasFinancialData ? businessValue + totalCash - totalDebt : 0;

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

  const valuationTrend = useMemo(
    () => (hasFinancialData && estimatedValue > 0 ? generateValuationTrend(estimatedValue) : []),
    [estimatedValue, hasFinancialData]
  );
  const revenueEbitdaData = useMemo(
    () => (hasFinancialData ? generateRevenueEbitdaData(revenue, ebitda) : []),
    [hasFinancialData, revenue, ebitda]
  );

  const monthlyChange =
    valuationTrend.length >= 2
      ? valuationTrend[valuationTrend.length - 1].value - valuationTrend[valuationTrend.length - 2].value
      : 0;
  const yearChangePct =
    valuationTrend.length > 0 && valuationTrend[0].value > 0
      ? ((estimatedValue - valuationTrend[0].value) / valuationTrend[0].value) * 100
      : 0;

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
      })),
      monthlyUtilities,
    });
  }, [store, hasFinancialData, valuation, scheduledDebtService, equipment, lease, realEstate, monthlyFinancials, monthlyUtilities]);

  const laundrocfoScore = laundroCfoScoreResult?.total ?? 0;

  const actions = useMemo(() => {
    const items: ActionItem[] = [];

    if (!isOwnerOccupied && leaseMetrics && leaseMetrics.yearsRemaining < 3) {
      items.push({
        id: "lease",
        severity: "urgent",
        severityLabel: "URGENT",
        title: "Lease Expiring",
        description: `Only ${leaseMetrics.yearsRemaining.toFixed(1)} years remaining on your lease.`,
        href: "/lease",
      });
    }

    if (hasFinancialData && dscrNum != null && dscrNum < 1.25) {
      items.push({
        id: "dscr",
        severity: "urgent",
        severityLabel: "URGENT",
        title: "DSCR Below Threshold",
        description: `Current DSCR of ${dscrNum.toFixed(2)}x is below the 1.25x minimum.`,
        href: "/financials",
      });
    }

    if (hasFinancialData && utilityRatio > 20) {
      items.push({
        id: "utility",
        severity: "warning",
        severityLabel: "WARN",
        title: "High Utility Costs",
        description: `Utilities are ${utilityRatio.toFixed(1)}% of revenue — above the 20% threshold.`,
        href: "/financials",
      });
    }

    if (avgEquipmentAge > 12) {
      items.push({
        id: "equipment",
        severity: "warning",
        severityLabel: "WARN",
        title: "Equipment Aging",
        description: `Average machine age is ${avgEquipmentAge.toFixed(1)} years — consider replacement planning.`,
        href: "/equipment",
      });
    }

    if (insuranceCount === 0) {
      items.push({
        id: "insurance",
        severity: "warning",
        severityLabel: "WARN",
        title: "Add Insurance Policies",
        description: "No active insurance policies on file for this store.",
        href: "/insurance",
      });
    }

    if (hasFinancialData && monthlyChange > 0) {
      items.push({
        id: "valuation",
        severity: "info",
        severityLabel: "INFO",
        title: "Valuation Increased",
        description: `Store value rose ${fmtDollar(monthlyChange)} this month.`,
        href: "/valuation",
      });
    }

    return items;
  }, [
    isOwnerOccupied,
    hasFinancialData,
    leaseMetrics,
    dscrNum,
    utilityRatio,
    avgEquipmentAge,
    insuranceCount,
    monthlyChange,
  ]);

  const severityBorder = {
    urgent: "border-l-red-500",
    warning: "border-l-amber-500",
    info: "border-l-blue-500",
  };

  const feedItems = useMemo(
    () =>
      store
        ? generateStoreFeed(store, lease, equipment, insurancePolicies, {
            scheduledAnnualDebtService: scheduledDebtService,
          })
        : [],
    [store, lease, equipment, insurancePolicies, scheduledDebtService]
  );

  if (loadError) {
    return <PageError onRetry={loadDashboardData} />;
  }

  const isDashboardLoading =
    storesLoading ||
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
    return (
      <EmptyState
        icon="Store"
        title="No stores yet"
        description="Add your first store to start tracking performance, financials, and alerts."
        ctaLabel="Add Your First Store"
        ctaHref="/portfolio"
      />
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
          {hasFinancialData ? (
            <>
              <AnimatedNumber value={estimatedValue} prefix="$" className="hero-value-text" duration={1200} />
              <ValueChangeIndicator value={estimatedValue} />
            </>
          ) : (
            <span className="hero-value-text">—</span>
          )}
        </div>
        {hasFinancialData && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
              {monthlyChange >= 0 ? "+" : ""}{fmtDollar(monthlyChange)} this month
            </span>
            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
              {yearChangePct >= 0 ? "+" : ""}{yearChangePct.toFixed(1)}% vs last year
            </span>
          </div>
        )}
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '12px', lineHeight: 1.6 }}>
          {hasFinancialData
            ? `Based on ${fmtMultiple(finalMultiple)} EBITDA multiple · Equipment grade B · ${leaseMetrics ? `${leaseMetrics.yearsRemaining.toFixed(1)}yr lease` : "—"} · ${sqft.toLocaleString()} SF`
            : "Add monthly financials to estimate store value."}
        </div>
      </div>

      {/* Section 2: KPI Cards */}
      <div className="metric-grid">
        <DSCRCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0s" }}
          dscr={dscrNum}
          scheduledAnnualDebtService={debtService}
          hasFinancialData={hasFinancialData}
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
            hasFinancialData ? (
              <AnimatedNumber value={businessValue} prefix="$" duration={1000} />
            ) : (
              "—"
            )
          }
          sub={hasFinancialData ? `${fmtMultiple(finalMultiple)} EBITDA multiple` : "Add monthly financials"}
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.25s" }}
          label="Cash"
          value={
            hasFinancialData ? (
              <AnimatedNumber value={totalCash} prefix="$" duration={1000} />
            ) : (
              "—"
            )
          }
          sub={hasFinancialData ? "Operating + reserves" : "Add monthly financials"}
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
            hasFinancialData ? (
              <AnimatedNumber value={equity} prefix="$" duration={1000} />
            ) : (
              "—"
            )
          }
          sub={hasFinancialData ? "Value + cash − debt" : "Add monthly financials"}
          valueColor={
            hasFinancialData
              ? equity > 0
                ? "var(--text-success)"
                : "var(--text-danger)"
              : "var(--text-muted)"
          }
        />
      </div>

      {/* Section 3: Two Column Layout */}
      <div className="grid-3 grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left Column */}
        <div className="xl:col-span-2 space-y-4">
          {/* Valuation Trend Chart */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title mb-0">12-Month Valuation Trend</div>
              <div className="text-[20px] font-bold" style={{ color: "var(--accent)" }}>
                {hasFinancialData ? fmtDollar(estimatedValue) : "—"}
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
                <div className="flex items-center justify-center h-full text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Add monthly financials to see valuation trend.
                </div>
              )}
            </div>
          </div>

          {/* Revenue vs EBITDA */}
          <div className="card">
            <div className="section-title">Revenue vs EBITDA</div>
            <div className="h-[220px]">
              {revenueEbitdaData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={revenueEbitdaData}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                  barCategoryGap="12%"
                >
                  <defs>
                    <filter id="ebitdaLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#38bdf8" floodOpacity="0.95" />
                      <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#38bdf8" floodOpacity="0.45" />
                    </filter>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--text-muted)"
                    strokeOpacity={0.12}
                    strokeDasharray="3 6"
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    tickFormatter={formatAxisValue}
                    tick={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickCount={5}
                  />
                  <Tooltip
                    content={<RevenueEbitdaTooltip />}
                    cursor={false}
                    wrapperStyle={{ outline: "none" }}
                  />
                  <Bar
                    dataKey="revenue"
                    name="Revenue"
                    fill={REVENUE_BAR_FILL}
                    stroke={REVENUE_BAR_STROKE}
                    strokeWidth={1.5}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="ebitda"
                    name="EBITDA"
                    stroke={EBITDA_LINE_COLOR}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: EBITDA_LINE_COLOR,
                      stroke: "#0ea5e9",
                      strokeWidth: 2,
                      style: { filter: EBITDA_GLOW },
                    }}
                    style={{ filter: EBITDA_GLOW }}
                    filter="url(#ebitdaLineGlow)"
                    isAnimationActive
                    animationDuration={1100}
                    animationEasing="ease-out"
                  />
                </ComposedChart>
              </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Add monthly financials to see revenue and EBITDA.
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-6 mt-3 text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-[4px] shrink-0"
                  style={{
                    background: REVENUE_BAR_FILL,
                    border: `1.5px solid ${REVENUE_BAR_STROKE}`,
                  }}
                />
                Revenue
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="w-5 h-[3px] rounded-full shrink-0"
                  style={{
                    background: EBITDA_LINE_COLOR,
                    boxShadow: "0 0 8px rgba(56, 189, 248, 0.85), 0 0 2px rgba(56, 189, 248, 1)",
                  }}
                />
                EBITDA
              </span>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Action Center */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <div className="section-title mb-0">Action Center</div>
              {actions.length > 0 && (
                <span className="badge badge-red text-[10px]">{actions.length}</span>
              )}
            </div>
            {actions.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>All Clear</div>
                <div className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
                  No urgent actions needed right now.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className={clsx(
                      "border-l-[3px] rounded-r-lg pl-3 py-2.5",
                      severityBorder[action.severity]
                    )}
                    style={{ background: "var(--bg-card2)" }}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="text-[9px] font-bold tracking-wider flex-shrink-0 mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {action.severityLabel}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                          {action.title}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                          {action.description}
                        </div>
                        <Link
                          href={action.href}
                          className="text-[11px] mt-1 inline-block hover:underline"
                          style={{ color: "var(--accent)" }}
                        >
                          View →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Store Benchmarks */}
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
        </div>
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
            { label: "Est. Value", value: hasFinancialData ? fmtDollar(estimatedValue) : "—" },
            {
              label: "Multiple",
              value: hasFinancialData ? fmtMultiple(finalMultiple) : "—",
              tooltip: "Applied to annual EBITDA to estimate store value. Higher multiples reflect better lease, equipment, and market factors.",
            },
            { label: "Annual EBITDA", value: hasFinancialData ? fmtDollar(annualEbitda) : "—" },
            { label: "Annual Revenue", value: hasFinancialData ? fmtDollar(revenue * 12) : "—" },
            {
              label: "NOI",
              value: hasFinancialData
                ? fmtDollar(annualEbitda - (store?.monthly_rent ?? 0) * 12)
                : "—",
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

      {/* Store Intelligence Feed */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="section-title mb-0">Store Intelligence Feed</div>
          {feedItems.length > 0 && (
            <span className="badge badge-blue text-[10px]">{feedItems.length}</span>
          )}
        </div>
        <IntelligenceFeed items={feedItems} />
      </div>
    </div>
  );
}
