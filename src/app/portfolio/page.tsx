"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import clsx from "clsx";
import { generateStoreFeed } from "@/lib/intelligence";
import { IntelligenceFeed } from "@/components/ui/IntelligenceFeed";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { PageError } from "@/components/ui/PageError";
import { KpiCard } from "@/components/ui/KpiCard";
import { MetricTooltip } from "@/components/ui/MetricTooltip";
import { FormBanner } from "@/components/ui/FormBanner";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ValueChangeIndicator } from "@/components/ui/ValueChangeIndicator";
import {
  financials as demoFinancials,
  DEMO_MONTHLY_REVENUE,
  DEMO_MONTHLY_EXPENSES,
  DEMO_ANNUAL_DEBT_SERVICE,
} from "@/lib/data";

const VALUATION_MULTIPLE = demoFinancials.valuationMultiple;

type Store = {
  id: string;
  name: string | null;
  address: string | null;
  monthly_revenue: number | null;
  monthly_expenses: number | null;
  annual_debt_service: number | null;
  loan_balance: number | null;
  operating_account_balance: number | null;
  reserve_account_balance: number | null;
  petty_cash: number | null;
  avg_machine_age: number | null;
  store_condition: string | null;
  occupancy_type: string | null;
};

type Lease = {
  id: string;
  store_id: string;
  lease_end_date: string | null;
  monthly_rent: number | null;
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearsRemaining(endDate: string | null): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  const now = new Date();
  return Math.max(0, (end.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function calcHealthScore(
  dscr: number,
  monthlyRevenue: number,
  avgMachineAge: number,
  leaseYearsRemaining: number | null,
  loanBalance: number
): number {
  let score = 50;
  if (dscr > 1.5) score += 10;
  if (monthlyRevenue > 50000) score += 10;
  if (avgMachineAge < 10) score += 10;
  if (leaseYearsRemaining != null && leaseYearsRemaining > 5) score += 10;
  if (loanBalance < monthlyRevenue * 36) score += 10;
  return Math.min(100, score);
}

function dscrColorClass(dscr: number): string {
  if (dscr >= 1.5) return "text-green-500";
  if (dscr >= 1.25) return "text-amber-500";
  return "text-red-500";
}

export default function PortfolioPage() {
  const supabase = createClient();
  const router = useRouter();
  const {
    stores,
    loading: storesLoading,
    selectedStore,
    setSelectedStore,
    setIsAllStores,
    refreshStores,
  } = useStores();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [realEstateTotal, setRealEstateTotal] = useState(0);
  const [equipmentByStore, setEquipmentByStore] = useState<Record<string, any[]>>({});
  const [insuranceByStore, setInsuranceByStore] = useState<Record<string, any[]>>({});
  const [showWelcome, setShowWelcome] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem("laundrocfo_show_welcome") === "true") {
      setShowWelcome(true);
    }
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!deleteTarget) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [deleteTarget]);

  function dismissWelcome() {
    localStorage.removeItem("laundrocfo_show_welcome");
    setShowWelcome(false);
  }

  const loadPortfolioData = useCallback(async () => {
    if (storesLoading) return;
    if (stores.length === 0) {
      setLoading(false);
      setLoadError(false);
      return;
    }

    setLoading(true);
    setLoadError(false);

    try {
      const storeIds = stores.map((s) => s.id);
      const [
        { data: leasesData, error: leasesError },
        { data: reData, error: reError },
        { data: equipmentData, error: equipmentError },
        { data: insuranceData, error: insuranceError },
      ] = await Promise.all([
        supabase.from("leases").select("id, store_id, lease_end_date, monthly_rent").in("store_id", storeIds),
        supabase.from("real_estate").select("store_id, estimated_value").in("store_id", storeIds),
        supabase.from("equipment_inventory").select("*").in("store_id", storeIds),
        supabase.from("insurance_policies").select("*").in("store_id", storeIds).eq("is_active", true),
      ]);

      const errors = [leasesError, reError, equipmentError, insuranceError].filter(Boolean);
      if (errors.length > 0) throw errors[0];

      setLeases((leasesData ?? []) as Lease[]);
      setRealEstateTotal((reData ?? []).reduce((s, r) => s + (r.estimated_value ?? 0), 0));

      const equipMap: Record<string, any[]> = {};
      for (const e of equipmentData ?? []) {
        if (!equipMap[e.store_id]) equipMap[e.store_id] = [];
        equipMap[e.store_id].push(e);
      }
      setEquipmentByStore(equipMap);

      const insMap: Record<string, any[]> = {};
      for (const p of insuranceData ?? []) {
        if (!insMap[p.store_id]) insMap[p.store_id] = [];
        insMap[p.store_id].push(p);
      }
      setInsuranceByStore(insMap);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [stores, storesLoading, supabase]);

  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  const storeMetrics = useMemo(() => {
    return (stores as Store[]).map((store) => {
      const hasRealData = (store.monthly_revenue ?? 0) > 0;
      const monthlyRevenue = hasRealData ? (store.monthly_revenue ?? 0) : DEMO_MONTHLY_REVENUE;
      const monthlyExpenses = hasRealData
        ? (store.monthly_expenses ?? 0)
        : DEMO_MONTHLY_EXPENSES;
      const monthlyEbitda = monthlyRevenue - monthlyExpenses;
      const annualEbitda = monthlyEbitda * 12;
      const debtService = hasRealData
        ? (store.annual_debt_service ?? 0)
        : DEMO_ANNUAL_DEBT_SERVICE;
      const annualCashFlow = hasRealData ? annualEbitda - debtService : demoFinancials.cashFlow;
      const dscr = debtService > 0 ? annualCashFlow / debtService : 0;
      const estimatedValue = hasRealData
        ? annualEbitda * VALUATION_MULTIPLE
        : demoFinancials.estimatedValue;
      const loanBalance = store.loan_balance ?? 0;
      const storeCash =
        (store.operating_account_balance ?? 0) +
        (store.reserve_account_balance ?? 0) +
        (store.petty_cash ?? 0);
      const avgMachineAge = store.avg_machine_age ?? 6.1;

      const isOwnerOccupied = store.occupancy_type === "owner_occupied";
      const storeLease = leases.find((l) => l.store_id === store.id);
      const leaseYearsRemaining = isOwnerOccupied
        ? null
        : storeLease
          ? calcYearsRemaining(storeLease.lease_end_date)
          : null;

      const healthScore = calcHealthScore(dscr, monthlyRevenue, avgMachineAge, leaseYearsRemaining, loanBalance);

      return {
        store,
        hasRealData,
        estimatedValue,
        monthlyRevenue,
        monthlyEbitda,
        annualEbitda,
        dscr,
        healthScore,
        leaseYearsRemaining,
        avgMachineAge,
        storeCash,
        hasDscrWarning: debtService > 0 && dscr < 1.25,
      };
    });
  }, [stores, leases]);

  const usingDemoData = storeMetrics.some((m) => !m.hasRealData);

  const aggregates = useMemo(() => {
    const totalPortfolioValue = storeMetrics.reduce((s, m) => s + m.estimatedValue, 0);
    const totalAnnualRevenue = storeMetrics.reduce((s, m) => s + m.monthlyRevenue * 12, 0);
    const totalAnnualEbitda = storeMetrics.reduce((s, m) => s + m.annualEbitda, 0);
    const totalMonthlyEbitda = totalAnnualEbitda / 12;
    const totalDebt = (stores as Store[]).reduce((s, st) => s + (st.loan_balance ?? 0), 0);
    const totalCash = (stores as Store[]).reduce(
      (s, store) =>
        s +
        (store.operating_account_balance ?? 0) +
        (store.reserve_account_balance ?? 0) +
        (store.petty_cash ?? 0),
      0
    );
    const totalAnnualDebtService = storeMetrics.reduce((s, m) => {
      const hasRealData = (m.store.monthly_revenue ?? 0) > 0;
      return s + (hasRealData ? (m.store.annual_debt_service ?? 0) : DEMO_ANNUAL_DEBT_SERVICE);
    }, 0);
    const totalAnnualCashFlow = storeMetrics.reduce((s, m) => {
      const ds = (m.store.monthly_revenue ?? 0) > 0 ? (m.store.annual_debt_service ?? 0) : DEMO_ANNUAL_DEBT_SERVICE;
      return s + m.annualEbitda - ds;
    }, 0);
    const globalDSCR =
      totalAnnualDebtService > 0
        ? totalAnnualCashFlow / totalAnnualDebtService
        : demoFinancials.cashFlow / demoFinancials.annualDebtService;
    const portfolioNetWorth = totalPortfolioValue - totalDebt + totalCash;
    const ebitdaMargin = totalAnnualRevenue > 0 ? (totalAnnualEbitda / totalAnnualRevenue) * 100 : 0;
    const availableMonthlyCashFlow = Math.max(0, (totalAnnualEbitda - totalAnnualDebtService) / 12);
    const acquisitionCapacity = (availableMonthlyCashFlow * 12) / 0.12;

    const hasDebtData = (stores as Store[]).some((st) => (st.annual_debt_service ?? 0) > 0);
    const resolvedPortfolioValue =
      usingDemoData && totalPortfolioValue === 0 ? demoFinancials.estimatedValue : totalPortfolioValue;
    const resolvedAnnualRevenue =
      usingDemoData && totalAnnualRevenue === 0 ? demoFinancials.annualRevenue : totalAnnualRevenue;
    const resolvedAnnualEbitda =
      usingDemoData && totalAnnualEbitda === 0 ? demoFinancials.ebitda : totalAnnualEbitda;
    const resolvedMonthlyEbitda =
      usingDemoData && totalAnnualEbitda === 0 ? demoFinancials.ebitda / 12 : totalMonthlyEbitda;
    const resolvedAnnualDebtService =
      usingDemoData && totalAnnualDebtService === 0
        ? demoFinancials.annualDebtService
        : totalAnnualDebtService;
    const portfolioEquity = resolvedPortfolioValue + totalCash - totalDebt;

    return {
      totalPortfolioValue: resolvedPortfolioValue,
      totalAnnualRevenue: resolvedAnnualRevenue,
      totalAnnualEbitda: resolvedAnnualEbitda,
      totalMonthlyEbitda: resolvedMonthlyEbitda,
      totalDebt,
      totalCash,
      totalAnnualDebtService: resolvedAnnualDebtService,
      globalDSCR,
      portfolioNetWorth,
      ebitdaMargin,
      availableMonthlyCashFlow,
      acquisitionCapacity,
      hasDebtData,
      portfolioEquity,
    };
  }, [storeMetrics, stores, usingDemoData]);

  const allFeedItems = useMemo(() => {
    const items = (stores as Store[]).flatMap((store) => {
      const storeLease = leases.find((l) => l.store_id === store.id);
      const equipment = equipmentByStore[store.id] ?? [];
      const insurance = insuranceByStore[store.id] ?? [];
      return generateStoreFeed(store, storeLease, equipment, insurance);
    });
    const order = { danger: 0, warning: 1, success: 2, info: 3 };
    return items.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [stores, leases, equipmentByStore, insuranceByStore]);

  const acquisitionMessage =
    aggregates.globalDSCR > 2.0
      ? "Strong position. Well-qualified for additional acquisition financing."
      : aggregates.globalDSCR > 1.5
        ? "Good position. Consider building reserves before expanding."
        : "Focus on improving store performance before acquiring.";

  function openStore(store: Store) {
    setSelectedStore(store);
    setIsAllStores(false);
    router.push("/dashboard");
  }

  async function handleArchive(store: Store) {
    if (archivingId) return;
    setArchivingId(store.id);
    setMessage(null);

    const { error } = await supabase
      .from("stores")
      .update({ archived: true })
      .eq("id", store.id);

    if (error) {
      setMessage({ type: "error", text: "We couldn't archive this store. Please try again." });
    } else {
      if (selectedStore?.id === store.id) {
        setSelectedStore(null);
        setIsAllStores(true);
      }
      await refreshStores();
      setMessage({ type: "success", text: "Store archived" });
    }
    setArchivingId(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setMessage(null);

    const { error } = await supabase.from("stores").delete().eq("id", deleteTarget.id);

    if (error) {
      setMessage({ type: "error", text: "We couldn't delete this store. Please try again." });
      setDeleting(false);
      return;
    }

    if (selectedStore?.id === deleteTarget.id) {
      setSelectedStore(null);
      setIsAllStores(true);
    }

    setDeleteTarget(null);
    setMessage({ type: "success", text: "Store deleted" });
    await refreshStores();
    setDeleting(false);
  }

  if (loadError) {
    return <PageError onRetry={loadPortfolioData} />;
  }

  if (storesLoading || loading) {
    return (
      <div className="space-y-5">
        <CardSkeleton />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] text-center px-6"
        style={{ background: "var(--bg-page)" }}
      >
        <div className="text-[15px] font-bold tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>
          LaundroCFO
        </div>
        <h1 className="text-[32px] font-bold tracking-tight mb-3" style={{ color: "var(--text-primary)" }}>
          Your Laundromat Portfolio Command Center
        </h1>
        <p className="text-[15px] max-w-lg mb-8" style={{ color: "var(--text-muted)" }}>
          Add your first store to start tracking valuation, equipment, lease risk, and portfolio performance.
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {["Valuation", "Lease Risk", "Equipment", "Insurance"].map((pill) => (
            <span
              key={pill}
              className="px-4 py-2 rounded-full text-[13px] font-medium"
              style={{ background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              {pill}
            </span>
          ))}
        </div>

        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 px-10 py-4 rounded-xl text-[17px] font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)" }}
        >
          Add Your First Store →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FormBanner message={message} />

      {showWelcome && (
        <div className="card relative">
          <button
            type="button"
            onClick={dismissWelcome}
            className="absolute top-4 right-4 text-[14px] hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
            aria-label="Dismiss"
          >
            ×
          </button>
          <div className="text-[15px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Welcome to LaundroCFO. Your store has been set up. Here&apos;s what to do next:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {[
              { href: "/equipment", label: "Add your equipment" },
              { href: "/lease", label: "Set up your lease" },
              { href: "/insurance", label: "Add insurance policies" },
            ].map((step) => (
              <Link
                key={step.href}
                href={step.href}
                className="flex items-center rounded-lg p-4 transition-colors hover:opacity-90"
                style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
              >
                <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {step.label} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Hero Banner */}
      <div className="hero-value-card">
        <div style={{ fontSize: '12px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          Portfolio Value
          {usingDemoData && (
            <span className="inline-flex items-center ml-3 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-200 border border-amber-400/30 normal-case tracking-normal">
              Demo data
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <AnimatedNumber value={aggregates.totalPortfolioValue} prefix="$" className="hero-value-text" duration={1200} />
          <ValueChangeIndicator value={aggregates.totalPortfolioValue} />
        </div>

        <div style={{ display: 'flex', gap: '24px', marginTop: '28px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Stores</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
              <AnimatedNumber value={stores.length} duration={800} />
            </div>
          </div>
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Cash</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#4ade80' }}>
              $<AnimatedNumber value={aggregates.totalCash} duration={1000} />
            </div>
          </div>
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>EBITDA</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
              $<AnimatedNumber value={aggregates.totalAnnualEbitda} duration={1000} />
            </div>
          </div>
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Global DSCR</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
              <AnimatedNumber value={aggregates.globalDSCR} decimals={2} suffix="x" duration={1000} />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Row - 8 cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "20px",
        }}
      >
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0s" }}
          label="Total Portfolio Value"
          value={<AnimatedNumber value={aggregates.totalPortfolioValue} prefix="$" duration={1000} />}
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.05s" }}
          label="Annual Revenue"
          value={<AnimatedNumber value={aggregates.totalAnnualRevenue} prefix="$" duration={1000} />}
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.1s" }}
          label="Annual EBITDA"
          value={<AnimatedNumber value={aggregates.totalAnnualEbitda} prefix="$" duration={1000} />}
          sub={`${aggregates.ebitdaMargin.toFixed(1)}% margin`}
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.15s" }}
          label="Portfolio Cash"
          value={<AnimatedNumber value={aggregates.totalCash} prefix="$" duration={1000} />}
          sub="across all stores"
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.2s" }}
          label="Total Debt"
          value={<AnimatedNumber value={aggregates.totalDebt} prefix="$" duration={1000} />}
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.25s" }}
          label="Portfolio Equity"
          value={<AnimatedNumber value={aggregates.portfolioEquity} prefix="$" duration={1000} />}
          sub="Value + cash − debt"
          valueColor={aggregates.portfolioEquity > 0 ? "var(--text-success)" : "var(--text-danger)"}
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.3s" }}
          label="Store Count"
          value={<AnimatedNumber value={stores.length} duration={800} />}
          sub={`${stores.length} store${stores.length !== 1 ? "s" : ""}`}
        />

        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.35s" }}
          label={
            <MetricTooltip
              label="Global DSCR"
              explanation="Combined debt coverage across all stores and personal obligations. Banks use this for total borrower risk assessment."
            />
          }
          value={
            aggregates.hasDebtData ? (
              <AnimatedNumber value={aggregates.globalDSCR} decimals={2} suffix="x" duration={1000} />
            ) : (
              "—"
            )
          }
          sub={aggregates.hasDebtData ? undefined : "Add debt data"}
          valueColor={aggregates.hasDebtData ? undefined : "var(--text-muted)"}
        />
      </div>

      {/* Store Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>Your Stores</h2>
          <Link href="/onboarding" className="btn-outline text-[12px] px-3 py-1.5">+ Add Store</Link>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}
        >
          {storeMetrics.map((m) => (
            <div key={m.store.id} className="card relative">
              {m.hasDscrWarning && (
                <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-red-500" />
              )}

              <div
                className="text-[18px] font-bold mb-1 truncate"
                style={{ color: "var(--text-primary)", maxWidth: "100%" }}
              >
                {m.store.name ?? "Unnamed Store"}
              </div>
              <div
                className="text-[12px] mb-4 truncate"
                style={{ color: "var(--text-muted)", maxWidth: "100%" }}
              >
                {m.store.address ?? "No address"}
              </div>

              <div className="grid grid-cols-4 gap-3 mb-4 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                {[
                  { label: "Value", value: fmtDollar(m.estimatedValue) },
                  { label: "Revenue", value: fmtDollar(m.monthlyRevenue) },
                  { label: "EBITDA", value: fmtDollar(m.monthlyEbitda) },
                  {
                    label: "DSCR",
                    value: m.store.annual_debt_service || !m.hasRealData ? fmtMultiple(m.dscr) : "—",
                    color: m.store.annual_debt_service || !m.hasRealData ? dscrColorClass(m.dscr) : undefined,
                  },
                ].map((metric) => (
                  <div key={metric.label}>
                    <div className="metric-label mb-1">{metric.label}</div>
                    <div
                      className={clsx("text-[14px] font-semibold tabular-nums", metric.color)}
                      style={metric.color ? undefined : { color: "var(--text-primary)" }}
                    >
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-[11px] mb-4" style={{ color: "var(--text-muted)" }}>
                Cash: {fmtDollar(m.storeCash)}
              </div>

              <div
                className="pt-2 border-t"
                style={{ borderColor: "var(--border)", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}
              >
                <button type="button" onClick={() => openStore(m.store)} className="btn-primary text-[12px] px-3 py-1.5">
                  View
                </button>
                <Link
                  href={`/settings/edit-store?store=${m.store.id}`}
                  className="btn-outline text-[12px] px-3 py-1.5 text-center"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(m.store)}
                  className="btn-outline text-[12px] px-3 py-1.5 text-red-400 border-red-500/20"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => handleArchive(m.store)}
                  disabled={archivingId === m.store.id}
                  className="text-[12px] px-1 py-1 disabled:opacity-40"
                  style={{ color: "var(--text-muted)", background: "none", border: "none" }}
                >
                  {archivingId === m.store.id ? "Archiving..." : "Archive"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", padding: "20px" }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="card w-full"
            style={{ maxWidth: "min(400px, 90vw)", padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[16px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Delete Store?
            </h2>
            <p className="text-[13px] mb-3" style={{ color: "var(--text-secondary)" }}>
              This action cannot be undone.
            </p>
            <p className="text-[13px] mb-6 font-medium" style={{ color: "var(--text-primary)" }}>
              Store Name: {deleteTarget.name ?? "Unnamed Store"}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="btn-outline flex-1 min-w-[120px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 min-w-[120px] rounded-lg px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
                style={{ background: "var(--text-danger)" }}
              >
                {deleting ? "Deleting..." : "Delete Store"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Intelligence Feed */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[14px] font-semibold mb-0" style={{ color: "var(--text-primary)" }}>
            Portfolio Intelligence Feed
          </h3>
          {allFeedItems.length > 0 && (
            <span className="badge badge-blue text-[10px]">{allFeedItems.length}</span>
          )}
        </div>
        <IntelligenceFeed items={allFeedItems} showStoreName={true} maxItems={30} />
      </div>

      {/* Acquisition Readiness */}
      <div className="card">
        <h3 className="text-[14px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Acquisition Readiness
        </h3>
        <div className="space-y-3 mb-4">
          <div className="flex justify-between text-[13px]">
            <span style={{ color: "var(--text-secondary)" }}>Global DSCR</span>
            <span className={clsx("font-semibold", dscrColorClass(aggregates.globalDSCR))}>
              {fmtMultiple(aggregates.globalDSCR)}
            </span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span style={{ color: "var(--text-secondary)" }}>Available Monthly Cash Flow</span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {fmtDollar(aggregates.availableMonthlyCashFlow)}
            </span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span style={{ color: "var(--text-secondary)" }}>
              <MetricTooltip
                label="Est. Acquisition Capacity"
                explanation="Capitalization rate. NOI divided by property value. Used in real estate valuation."
              />
            </span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {fmtDollar(aggregates.acquisitionCapacity)}
            </span>
          </div>
        </div>
        <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
          Based on 12% cap rate assumption. Actual capacity depends on lender terms.
        </p>
        <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>{acquisitionMessage}</p>
        <Link href="/scenarios" className="btn-primary inline-flex text-[13px]">
          Run Scenarios →
        </Link>
      </div>

      {/* Portfolio Net Worth */}
      <div className="card">
        <div className="text-[14px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Portfolio Net Worth
        </div>
        <div className="space-y-2 text-[14px]">
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>Business Value:</span>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmtDollar(aggregates.totalPortfolioValue)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>+ Real Estate:</span>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmtDollar(realEstateTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>+ Cash:</span>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmtDollar(aggregates.totalCash)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>− Total Debt:</span>
            <span className="font-medium text-red-400">−{fmtDollar(aggregates.totalDebt)}</span>
          </div>
          <div className="border-t pt-3 mt-3 flex justify-between" style={{ borderColor: "var(--border)" }}>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>= Portfolio Net Worth:</span>
            <span className="text-[24px] font-bold text-green-400">
              {fmtDollar(aggregates.totalPortfolioValue + realEstateTotal - aggregates.totalDebt + aggregates.totalCash)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
