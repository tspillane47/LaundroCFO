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
import { MetricTooltip } from "@/components/ui/MetricTooltip";
import {
  financials as demoFinancials,
  valueTrend as demoValueTrend,
  DEMO_MONTHLY_REVENUE,
  DEMO_MONTHLY_EXPENSES,
  DEMO_ANNUAL_DEBT_SERVICE,
} from "@/lib/data";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

function generateValuationTrend(totalValue: number) {
  const start = totalValue * 0.88;
  return MONTH_LABELS.map((month, i) => {
    const progress = i / 11;
    const base = start + (totalValue - start) * progress;
    const variation = 1 + Math.sin(i * 1.7) * 0.015 + Math.cos(i * 0.9) * 0.01;
    return {
      month,
      value: Math.round(i === 11 ? totalValue : base * variation),
    };
  });
}

function dscrColorClass(dscr: number): string {
  if (dscr >= 1.5) return "text-green-500";
  if (dscr >= 1.25) return "text-amber-500";
  return "text-red-500";
}

export default function PortfolioPage() {
  const supabase = createClient();
  const router = useRouter();
  const { stores, loading: storesLoading, setSelectedStore, setIsAllStores } = useStores();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [realEstateTotal, setRealEstateTotal] = useState(0);
  const [equipmentByStore, setEquipmentByStore] = useState<Record<string, any[]>>({});
  const [insuranceByStore, setInsuranceByStore] = useState<Record<string, any[]>>({});
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("laundrocfo_show_welcome") === "true") {
      setShowWelcome(true);
    }
  }, []);

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

    return {
      totalPortfolioValue:
        usingDemoData && totalPortfolioValue === 0 ? demoFinancials.estimatedValue : totalPortfolioValue,
      totalAnnualRevenue:
        usingDemoData && totalAnnualRevenue === 0 ? demoFinancials.annualRevenue : totalAnnualRevenue,
      totalAnnualEbitda:
        usingDemoData && totalAnnualEbitda === 0 ? demoFinancials.ebitda : totalAnnualEbitda,
      totalMonthlyEbitda:
        usingDemoData && totalAnnualEbitda === 0 ? demoFinancials.ebitda / 12 : totalMonthlyEbitda,
      totalDebt,
      totalCash,
      totalAnnualDebtService:
        usingDemoData && totalAnnualDebtService === 0
          ? demoFinancials.annualDebtService
          : totalAnnualDebtService,
      globalDSCR,
      portfolioNetWorth,
      ebitdaMargin,
      availableMonthlyCashFlow,
      acquisitionCapacity,
    };
  }, [storeMetrics, stores, usingDemoData]);

  const valuationTrend = useMemo(
    () =>
      usingDemoData
        ? demoValueTrend
        : generateValuationTrend(aggregates.totalPortfolioValue),
    [aggregates.totalPortfolioValue, usingDemoData]
  );

  const monthlyChange = valuationTrend[11].value - valuationTrend[10].value;
  const yearChangePct =
    valuationTrend[0].value > 0
      ? ((aggregates.totalPortfolioValue - valuationTrend[0].value) / valuationTrend[0].value) * 100
      : 0;

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
      <div className="card">
        <div className="flex flex-col gap-2 hero-banner">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="metric-label mb-0">Total Portfolio Value</div>
              {usingDemoData && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-200 border border-amber-400/30">
                  Demo data — add your store to see real numbers
                </span>
              )}
            </div>
            <div className="metric-value" style={{ fontSize: "36px" }}>
              {fmtDollar(aggregates.totalPortfolioValue)}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
              <span>{monthlyChange >= 0 ? "+" : ""}{fmtDollar(monthlyChange)} this month</span>
              <span>·</span>
              <span>{yearChangePct >= 0 ? "+" : ""}{yearChangePct.toFixed(1)}% annual</span>
            </div>
            <div className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>
              {stores.length} store{stores.length !== 1 ? "s" : ""} · Est. EBITDA {fmtDollar(aggregates.totalMonthlyEbitda)}/mo · Global DSCR {fmtMultiple(aggregates.globalDSCR)}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Row - 6 cards */}
      <div
        className="grid-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4"
        style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "16px" }}
      >
        <div className="card">
          <div className="metric-label">Annual Revenue</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(aggregates.totalAnnualRevenue)}
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Annual EBITDA</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(aggregates.totalAnnualEbitda)}
          </div>
          <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            {aggregates.ebitdaMargin.toFixed(1)}% margin
          </div>
        </div>

        <div className="card">
          <div className="metric-label">
            <MetricTooltip
              label="Global DSCR"
              explanation="Combined debt coverage across all stores and personal obligations. Banks use this for total borrower risk assessment."
            />
          </div>
          <div className={clsx("text-[28px] font-bold tracking-tight", dscrColorClass(aggregates.globalDSCR))}>
            {fmtMultiple(aggregates.globalDSCR)}
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Cash</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(aggregates.totalCash)}
          </div>
          <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            across all stores
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Total Debt</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(aggregates.totalDebt)}
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Net Worth</div>
          <div className="text-[28px] font-bold tracking-tight text-green-400">
            {fmtDollar(aggregates.portfolioNetWorth)}
          </div>
          <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            Value + cash − debt
          </div>
        </div>
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

              <div className="text-[18px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                {m.store.name ?? "Unnamed Store"}
              </div>
              <div className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
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

              <div className="flex gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <button type="button" onClick={() => openStore(m.store)} className="btn-primary flex-1 text-[12px]">
                  Open Store
                </button>
                <Link href="/settings" className="btn-outline flex-1 text-[12px] text-center">
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

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
