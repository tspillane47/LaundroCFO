"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import { AreaChart, Area, Tooltip, ResponsiveContainer } from "recharts";
import clsx from "clsx";
import { generateStoreFeed } from "@/lib/intelligence";
import { IntelligenceFeed } from "@/components/ui/IntelligenceFeed";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const VALUATION_MULTIPLE = 3.47;

type Store = {
  id: string;
  name: string | null;
  address: string | null;
  monthly_revenue: number | null;
  monthly_expenses: number | null;
  annual_debt_service: number | null;
  loan_balance: number | null;
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

function healthBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function conditionLabel(condition: string | null): string {
  if (!condition) return "Average";
  return condition.charAt(0).toUpperCase() + condition.slice(1);
}

const HeroTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg p-2 text-xs text-white">
      <div className="text-white/60 mb-0.5">{label}</div>
      <div className="font-semibold">{fmtDollar(payload[0].value)}</div>
    </div>
  );
};

export default function PortfolioPage() {
  const supabase = createClient();
  const router = useRouter();
  const { stores, loading: storesLoading, setSelectedStore, setIsAllStores } = useStores();
  const [loading, setLoading] = useState(true);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [realEstateTotal, setRealEstateTotal] = useState(0);
  const [equipmentByStore, setEquipmentByStore] = useState<Record<string, any[]>>({});
  const [insuranceByStore, setInsuranceByStore] = useState<Record<string, any[]>>({});

  useEffect(() => {
    async function load() {
      if (storesLoading) return;
      if (stores.length === 0) {
        setLoading(false);
        return;
      }

      const storeIds = stores.map((s) => s.id);
      const [{ data: leasesData }, { data: reData }, { data: equipmentData }, { data: insuranceData }] = await Promise.all([
        supabase.from("leases").select("id, store_id, lease_end_date, monthly_rent").in("store_id", storeIds),
        supabase.from("real_estate").select("store_id, estimated_value").in("store_id", storeIds),
        supabase.from("equipment_inventory").select("*").in("store_id", storeIds),
        supabase.from("insurance_policies").select("*").in("store_id", storeIds).eq("is_active", true),
      ]);

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
      setLoading(false);
    }
    load();
  }, [stores, storesLoading, supabase]);

  const storeMetrics = useMemo(() => {
    return (stores as Store[]).map((store) => {
      const monthlyRevenue = store.monthly_revenue ?? 0;
      const monthlyExpenses = store.monthly_expenses ?? 0;
      const monthlyEbitda = monthlyRevenue - monthlyExpenses;
      const annualEbitda = monthlyEbitda * 12;
      const debtService = store.annual_debt_service ?? 0;
      const dscr = debtService > 0 ? annualEbitda / debtService : 0;
      const estimatedValue = annualEbitda * VALUATION_MULTIPLE;
      const loanBalance = store.loan_balance ?? 0;
      const avgMachineAge = store.avg_machine_age ?? 0;

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
        estimatedValue,
        monthlyRevenue,
        monthlyEbitda,
        annualEbitda,
        dscr,
        healthScore,
        leaseYearsRemaining,
        avgMachineAge,
        hasDscrWarning: debtService > 0 && dscr < 1.25,
      };
    });
  }, [stores, leases]);

  const aggregates = useMemo(() => {
    const totalPortfolioValue = storeMetrics.reduce((s, m) => s + m.estimatedValue, 0);
    const totalAnnualRevenue = storeMetrics.reduce((s, m) => s + m.monthlyRevenue * 12, 0);
    const totalAnnualEbitda = storeMetrics.reduce((s, m) => s + m.annualEbitda, 0);
    const totalMonthlyEbitda = totalAnnualEbitda / 12;
    const totalDebt = (stores as Store[]).reduce((s, st) => s + (st.loan_balance ?? 0), 0);
    const totalAnnualDebtService = (stores as Store[]).reduce((s, st) => s + (st.annual_debt_service ?? 0), 0);
    const globalDSCR = totalAnnualDebtService > 0 ? totalAnnualEbitda / totalAnnualDebtService : 0;
    const portfolioNetWorth = totalPortfolioValue - totalDebt;
    const ebitdaMargin = totalAnnualRevenue > 0 ? (totalAnnualEbitda / totalAnnualRevenue) * 100 : 0;
    const availableMonthlyCashFlow = Math.max(0, totalMonthlyEbitda - totalAnnualDebtService / 12);
    const acquisitionCapacity = availableMonthlyCashFlow / 0.1 / 12;

    return {
      totalPortfolioValue,
      totalAnnualRevenue,
      totalAnnualEbitda,
      totalMonthlyEbitda,
      totalDebt,
      totalAnnualDebtService,
      globalDSCR,
      portfolioNetWorth,
      ebitdaMargin,
      availableMonthlyCashFlow,
      acquisitionCapacity,
    };
  }, [storeMetrics, stores]);

  const valuationTrend = useMemo(
    () => generateValuationTrend(aggregates.totalPortfolioValue),
    [aggregates.totalPortfolioValue]
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

  if (storesLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[14px]" style={{ color: "var(--text-muted)" }}>Loading portfolio…</div>
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] text-center px-6"
        style={{ background: "var(--bg-primary)" }}
      >
        <div className="text-[48px] font-bold text-blue-300 tracking-tight mb-2">🏦 LaundroCFO</div>
        <h1 className="text-[32px] font-bold tracking-tight mb-3" style={{ color: "var(--text-primary)" }}>
          Your Laundromat Portfolio Command Center
        </h1>
        <p className="text-[15px] max-w-lg mb-8" style={{ color: "var(--text-muted)" }}>
          Add your first store to start tracking valuation, equipment, lease risk, and portfolio performance.
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {["💎 Valuation", "📋 Lease Risk", "⚙️ Equipment", "🛡️ Insurance"].map((pill) => (
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
      {/* Hero Banner */}
      <div
        className="rounded-xl p-6 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f1e3d 0%, #1e3a5f 100%)" }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-white/50 mb-1">Total Portfolio Value</div>
            <div className="text-white font-extrabold tracking-tight" style={{ fontSize: "52px", lineHeight: 1.1 }}>
              {fmtDollar(aggregates.totalPortfolioValue)}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold bg-green-500/20 text-green-300">
                {monthlyChange >= 0 ? "+" : ""}{fmtDollar(monthlyChange)} this month
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold bg-green-500/20 text-green-300">
                {yearChangePct >= 0 ? "+" : ""}{yearChangePct.toFixed(1)}% annual
              </span>
            </div>
            <div className="text-[12px] text-white/40 mt-3">
              {stores.length} store{stores.length !== 1 ? "s" : ""} · Est. EBITDA {fmtDollar(aggregates.totalMonthlyEbitda)}/mo · Global DSCR {fmtMultiple(aggregates.globalDSCR)}
            </div>
          </div>
          <div className="w-full lg:w-[280px] h-[80px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={valuationTrend}>
                <defs>
                  <linearGradient id="portfolioHeroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#93c5fd" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#bfdbfe" strokeWidth={2} fill="url(#portfolioHeroGrad)" dot={false} />
                <Tooltip content={<HeroTooltip />} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* KPI Row - 5 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
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
          <div className="metric-label">Global DSCR</div>
          <div className={clsx("text-[28px] font-bold tracking-tight", dscrColorClass(aggregates.globalDSCR))}>
            {fmtMultiple(aggregates.globalDSCR)}
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
        </div>
      </div>

      {/* Store Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>Your Stores</h2>
          <Link href="/onboarding" className="btn-outline text-[12px] px-3 py-1.5">+ Add Store</Link>
        </div>

        <div className={clsx("grid gap-4", stores.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
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

              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label: "Est Value", value: fmtDollar(m.estimatedValue) },
                  { label: "Revenue", value: fmtDollar(m.monthlyRevenue) },
                  { label: "EBITDA", value: fmtDollar(m.monthlyEbitda) },
                  {
                    label: "DSCR",
                    value: m.store.annual_debt_service ? fmtMultiple(m.dscr) : "—",
                    color: m.store.annual_debt_service ? dscrColorClass(m.dscr) : undefined,
                  },
                ].map((metric) => (
                  <div key={metric.label} className="text-center">
                    <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>
                      {metric.label}
                    </div>
                    <div className={clsx("text-[13px] font-semibold", metric.color)} style={metric.color ? undefined : { color: "var(--text-primary)" }}>
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-[11px] mb-1">
                  <span style={{ color: "var(--text-muted)" }}>Health Score</span>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{m.healthScore}/100</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-card2)" }}>
                  <div
                    className={clsx("h-full rounded-full transition-all", healthBarColor(m.healthScore))}
                    style={{ width: `${m.healthScore}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <span className="badge badge-blue">Equipment B</span>
                {m.leaseYearsRemaining != null ? (
                  <span className="badge badge-blue">{m.leaseYearsRemaining.toFixed(1)} yrs</span>
                ) : (
                  <span className="badge badge-green">Owner Occupied</span>
                )}
                <span className="badge badge-amber">{conditionLabel(m.store.store_condition)}</span>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => openStore(m.store)} className="btn-primary flex-1 text-[12px]">
                  Open Store →
                </button>
                <Link href="/settings/edit-store" className="btn-outline flex-1 text-[12px] text-center">
                  Edit →
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
            <span style={{ color: "var(--text-secondary)" }}>Est. Acquisition Capacity</span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {fmtDollar(aggregates.acquisitionCapacity)}
            </span>
          </div>
        </div>
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
            <span style={{ color: "var(--text-secondary)" }}>− Total Debt:</span>
            <span className="font-medium text-red-400">−{fmtDollar(aggregates.totalDebt)}</span>
          </div>
          <div className="border-t pt-3 mt-3 flex justify-between" style={{ borderColor: "var(--border)" }}>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>= Portfolio Net Worth:</span>
            <span className="text-[24px] font-bold text-green-400">
              {fmtDollar(aggregates.totalPortfolioValue + realEstateTotal - aggregates.totalDebt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
