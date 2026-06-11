"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { calcValuationMultiple } from "@/lib/valuation";
import {
  calcBuildingEquity,
  calcOccupancyCostRatioFromRent,
  calcRealEstateLTV,
} from "@/lib/real-estate-calculations";
import { calcEquipmentScore, fmtDollar, fmtMultiple } from "@/lib/calculations";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import clsx from "clsx";
import { generateStoreFeed } from "@/lib/intelligence";
import { IntelligenceFeed } from "@/components/ui/IntelligenceFeed";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { MetricTooltip } from "@/components/ui/MetricTooltip";
import {
  financials as demoFinancials,
  store as demoStore,
  scores as demoScores,
  valueTrend as demoValueTrend,
  DEMO_MONTHLY_REVENUE,
  DEMO_MONTHLY_EXPENSES,
  DEMO_ANNUAL_DEBT_SERVICE,
} from "@/lib/data";

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

function benchmarkBarPercent(value: number, median: number, invert = false): number {
  const ratio = value / median;
  const pct = invert ? Math.max(5, Math.min(95, (2 - ratio) * 50)) : Math.max(5, Math.min(95, ratio * 50));
  return pct;
}

type ActionItem = {
  id: string;
  severity: "urgent" | "warning" | "info";
  icon: string;
  title: string;
  description: string;
  href: string;
};

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

const HeroTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg p-2 text-xs text-white">
      <div className="text-white/60 mb-0.5">{label}</div>
      <div className="font-semibold">{fmtDollar(payload[0].value)}</div>
    </div>
  );
};

export default function DashboardPage() {
  const router = useRouter();
  const { stores, selectedStore, isAllStores, setSelectedStore, setIsAllStores, loading: storesLoading } = useStores();
  const [store, setStore] = useState<any>(null);
  const [lease, setLease] = useState<any>(null);
  const [leaseOptions, setLeaseOptions] = useState<any[]>([]);
  const [realEstate, setRealEstate] = useState<any>(null);
  const [insuranceCount, setInsuranceCount] = useState(0);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [insurancePolicies, setInsurancePolicies] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      if (!selectedStore) {
        setStore(null);
        return;
      }

      const storeData = selectedStore;
      setStore(storeData);

      const [{ data: policiesData }, { data: equipmentData }] = await Promise.all([
        supabase
          .from("insurance_policies")
          .select("*")
          .eq("store_id", storeData.id)
          .eq("is_active", true),
        supabase
          .from("equipment_inventory")
          .select("*")
          .eq("store_id", storeData.id),
      ]);
      setInsurancePolicies(policiesData ?? []);
      setInsuranceCount(policiesData?.length ?? 0);
      setEquipment(equipmentData ?? []);

      if (storeData.occupancy_type === "owner_occupied") {
        const { data: reData } = await supabase
          .from("real_estate")
          .select("*")
          .eq("store_id", storeData.id)
          .limit(1)
          .maybeSingle();
        setRealEstate(reData);
        setLease(null);
        setLeaseOptions([]);
      } else {
        setRealEstate(null);
        const { data: leaseData } = await supabase
          .from("leases")
          .select("*")
          .eq("store_id", storeData.id)
          .limit(1)
          .maybeSingle();

        if (leaseData) {
          setLease(leaseData);
          const { data: optionsData } = await supabase
            .from("lease_options")
            .select("*")
            .eq("lease_id", leaseData.id)
            .order("option_number", { ascending: true });
          setLeaseOptions(optionsData ?? []);
        } else {
          setLease(null);
          setLeaseOptions([]);
        }
      }
    }
    load();
  }, [selectedStore, supabase]);

  function openStore(s: (typeof stores)[0]) {
    setSelectedStore(s);
    setIsAllStores(false);
    router.push("/dashboard");
  }

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
      monthlyRevenue: store?.monthly_revenue ?? null,
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
  }, [lease, leaseOptions, store]);

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
      store?.monthly_revenue ?? null
    );

    return {
      estimatedValue: realEstate.estimated_value,
      equity,
      ltv,
      occupancyCostRatio,
    };
  }, [realEstate, store]);

  const revenue = store?.monthly_revenue ?? DEMO_MONTHLY_REVENUE;
  const expenses = store?.monthly_expenses ?? DEMO_MONTHLY_EXPENSES;
  const ebitda = revenue - expenses;
  const annualEbitda = ebitda * 12;
  const debtService = store?.annual_debt_service ?? DEMO_ANNUAL_DEBT_SERVICE;
  const annualCashFlow = store?.monthly_revenue != null
    ? annualEbitda - debtService
    : demoFinancials.cashFlow;
  const monthlyCashFlow = annualCashFlow / 12;
  const dscrNum = debtService > 0 ? annualCashFlow / debtService : 0;
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const isOwnerOccupied = store?.occupancy_type === "owner_occupied";
  const utilities = store?.monthly_utilities ?? 12340;
  const utilityRatio = revenue > 0 ? (utilities / revenue) * 100 : 0;
  const sqft = store?.square_footage ?? 4450;
  const revenuePerSF = sqft > 0 ? (revenue * 12) / sqft : 0;
  const avgEquipmentAge = store?.avg_machine_age ?? 6.1;
  const equipmentScore = calcEquipmentScore(avgEquipmentAge);
  const machines = (store?.washers ?? 28) + (store?.dryers ?? 32);

  const valuation = useMemo(() => {
    const totalControl = leaseMetrics?.totalControl ?? (isOwnerOccupied ? 15 : 0);
    return calcValuationMultiple({
      ebitda: annualEbitda,
      locationCategory: store?.location_type ?? "suburban",
      totalLeaseControl: totalControl,
      occupancyType: isOwnerOccupied ? "owned" : "leased",
      avgEquipmentAge,
      squareFootage: sqft,
      revenueTrend: store?.revenue_trend ?? "stable",
      storeCondition: store?.store_condition ?? "average",
      competitionLevel: store?.competition_level ?? "normal",
      realEstateValue: realEstateMetrics?.estimatedValue ?? undefined,
    });
  }, [annualEbitda, store, leaseMetrics, isOwnerOccupied, realEstateMetrics, avgEquipmentAge, sqft]);

  const estimatedValue = store?.monthly_revenue != null
    ? Math.round(valuation.businessValue)
    : demoFinancials.estimatedValue;
  const finalMultiple = store?.monthly_revenue != null
    ? valuation.finalMultiple
    : demoFinancials.valuationMultiple;

  const valuationTrend = useMemo(
    () =>
      store?.monthly_revenue != null
        ? generateValuationTrend(estimatedValue)
        : demoValueTrend,
    [estimatedValue, store?.monthly_revenue]
  );
  const revenueEbitdaData = useMemo(() => generateRevenueEbitdaData(revenue, ebitda), [revenue, ebitda]);

  const monthlyChange = valuationTrend[11].value - valuationTrend[10].value;
  const yearChangePct =
    valuationTrend[0].value > 0
      ? ((estimatedValue - valuationTrend[0].value) / valuationTrend[0].value) * 100
      : 0;

  const leaseScore = leaseMetrics?.score ?? demoScores.lease;
  const insuranceScore = insuranceCount > 0 ? demoScores.insurance : demoScores.insurance;
  const financialScore = demoScores.financial;
  const laundrocfoScore = Math.round(
    (leaseScore + equipmentScore + financialScore + insuranceScore) / 4
  );
  const leaseYearsDisplay = leaseMetrics?.yearsRemaining ?? 7.3;
  const totalLeaseControl = leaseMetrics?.totalControl ?? 17.3;

  const dscrColor =
    dscrNum >= 1.5 ? "text-green-500" : dscrNum >= 1.25 ? "text-amber-500" : "text-red-500";

  const healthRingColor =
    laundrocfoScore >= 80 ? "#22c55e" : laundrocfoScore >= 60 ? "#3b82f6" : laundrocfoScore >= 40 ? "#f59e0b" : "#ef4444";

  const actions = useMemo(() => {
    const items: ActionItem[] = [];

    if (!isOwnerOccupied && leaseMetrics && leaseMetrics.yearsRemaining < 3) {
      items.push({
        id: "lease",
        severity: "urgent",
        icon: "📋",
        title: "Lease Expiring",
        description: `Only ${leaseMetrics.yearsRemaining.toFixed(1)} years remaining on your lease.`,
        href: "/lease",
      });
    }

    if (dscrNum < 1.25) {
      items.push({
        id: "dscr",
        severity: "urgent",
        icon: "⚠️",
        title: "DSCR Below Threshold",
        description: `Current DSCR of ${dscrNum.toFixed(2)}x is below the 1.25x minimum.`,
        href: "/financials",
      });
    }

    if (utilityRatio > 20) {
      items.push({
        id: "utility",
        severity: "warning",
        icon: "💡",
        title: "High Utility Costs",
        description: `Utilities are ${utilityRatio.toFixed(1)}% of revenue — above the 20% threshold.`,
        href: "/financials",
      });
    }

    if (avgEquipmentAge > 12) {
      items.push({
        id: "equipment",
        severity: "warning",
        icon: "⚙️",
        title: "Equipment Aging",
        description: `Average machine age is ${avgEquipmentAge.toFixed(1)} years — consider replacement planning.`,
        href: "/equipment",
      });
    }

    if (insuranceCount === 0) {
      items.push({
        id: "insurance",
        severity: "warning",
        icon: "🛡️",
        title: "Add Insurance Policies",
        description: "No active insurance policies on file for this store.",
        href: "/insurance",
      });
    }

    if (monthlyChange > 0) {
      items.push({
        id: "valuation",
        severity: "info",
        icon: "📈",
        title: "Valuation Increased",
        description: `Store value rose ${fmtDollar(monthlyChange)} this month.`,
        href: "/valuation",
      });
    }

    return items;
  }, [
    isOwnerOccupied,
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
    () => (store ? generateStoreFeed(store, lease, equipment, insurancePolicies) : []),
    [store, lease, equipment, insurancePolicies]
  );

  if (storesLoading) {
    return (
      <div className="space-y-5">
        <CardSkeleton />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <CardSkeleton />
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
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>No stores yet. Add your first store to get started.</p>
        <Link href="/onboarding" className="btn-primary inline-flex mt-4 text-[13px]">Add Store →</Link>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="space-y-5">
        <CardSkeleton />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const benchmarks = [
    {
      label: "EBITDA Margin",
      value: `${ebitdaMargin.toFixed(1)}%`,
      median: 22,
      storeValue: ebitdaMargin,
      displayMedian: "22%",
      invert: false,
    },
    {
      label: "Revenue/SF",
      value: `$${revenuePerSF.toFixed(0)}`,
      median: 140,
      storeValue: revenuePerSF,
      displayMedian: "$140",
      invert: false,
    },
    {
      label: "DSCR",
      value: `${dscrNum.toFixed(2)}x`,
      median: 1.5,
      storeValue: dscrNum,
      displayMedian: "1.5x",
      invert: false,
    },
    {
      label: "Utility Ratio",
      value: `${utilityRatio.toFixed(1)}%`,
      median: 17,
      storeValue: utilityRatio,
      displayMedian: "17%",
      invert: true,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {store.name ?? "Store Dashboard"}
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {store.address ?? "No address set"}
          </p>
        </div>
        <Link href="/settings" className="btn-outline text-[12px]">
          Edit Store
        </Link>
      </div>

      {/* Section 1: Hero Valuation Banner */}
      <div
        className="rounded-xl p-6 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f1e3d 0%, #1e3a5f 100%)" }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 hero-banner">
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-white/50 mb-1">
              Estimated Store Value
            </div>
            <div className="text-white font-extrabold tracking-tight" style={{ fontSize: "52px", lineHeight: 1.1 }}>
              {fmtDollar(estimatedValue)}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold bg-green-500/20 text-green-300">
                {monthlyChange >= 0 ? "+" : ""}{fmtDollar(monthlyChange)} this month
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold bg-green-500/20 text-green-300">
                {yearChangePct >= 0 ? "+" : ""}{yearChangePct.toFixed(1)}% vs last year
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginTop: "8px", lineHeight: 1.6 }}>
              Based on {fmtMultiple(finalMultiple)} EBITDA multiple · Equipment grade B · {leaseYearsDisplay.toFixed(1)}yr lease · {sqft.toLocaleString()} SF
            </div>
          </div>
          <div className="hero-chart w-full lg:w-[280px] h-[80px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={valuationTrend}>
                <defs>
                  <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#93c5fd" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#bfdbfe"
                  strokeWidth={2}
                  fill="url(#heroGrad)"
                  dot={false}
                />
                <Tooltip content={<HeroTooltip />} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Section 2: KPI Cards */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}
      >
        {/* DSCR */}
        <div className="card">
          <div className="metric-label">
            <MetricTooltip
              label="DSCR"
              explanation="Debt Service Coverage Ratio. Measures ability to cover loan payments. Lenders require minimum 1.25x."
            />
          </div>
          <div className={clsx("text-[28px] font-bold tracking-tight", dscrColor)}>
            {dscrNum.toFixed(2)}x
          </div>
          <div className="text-[12px] mt-2 font-medium" style={{ color: "var(--text-secondary)" }}>
            {dscrNum >= 1.5 ? "▲ Strong coverage" : dscrNum >= 1.25 ? "● Adequate" : "▼ Below threshold"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
            Cash flow / annual debt service · Min threshold 1.25x
          </div>
        </div>

        {/* EBITDA Margin */}
        <div className="card">
          <div className="metric-label">
            <MetricTooltip
              label="EBITDA Margin"
              explanation="Earnings Before Interest, Taxes, Depreciation & Amortization. The primary profit metric for laundromat valuation."
            />
          </div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {ebitdaMargin.toFixed(1)}%
          </div>
          <div className="text-[12px] mt-2 font-medium" style={{ color: "var(--text-secondary)" }}>
            {fmtDollar(ebitda)}/mo EBITDA
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
            Industry median 22% · Top quartile 28%+
          </div>
        </div>

        {/* LaundroCFO Score */}
        <div className="card">
          <div className="metric-label">LaundroCFO Score</div>
          <div className="flex items-center gap-4 mt-1">
            <div className="relative" style={{ width: 64, height: 64 }}>
              <svg width={64} height={64} viewBox="0 0 64 64">
                <circle cx={32} cy={32} r={26} fill="none" stroke="var(--border2)" strokeWidth={8} />
                <circle
                  cx={32} cy={32} r={26}
                  fill="none"
                  stroke={healthRingColor}
                  strokeWidth={8}
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 * (1 - laundrocfoScore / 100)}
                  strokeLinecap="round"
                  transform="rotate(-90 32 32)"
                />
              </svg>
              <div
                className="absolute inset-0 flex items-center justify-center text-[14px] font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {laundrocfoScore}
              </div>
            </div>
            <div>
              <div className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
                {laundrocfoScore}/100
              </div>
              <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Composite health index
              </div>
            </div>
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px", lineHeight: 1.6 }}>
            Lease {leaseScore} · Equipment {equipmentScore} · Financial {financialScore} · Insurance {insuranceScore}
          </div>
        </div>

        {/* Monthly Cash Flow */}
        <div className="card">
          <div className="metric-label">Monthly Cash Flow</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(monthlyCashFlow)}
          </div>
          <div className="text-[12px] mt-2 font-medium" style={{ color: "var(--text-secondary)" }}>
            {fmtDollar(annualCashFlow)}/yr after debt service
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
            After all expenses and debt service
          </div>
        </div>
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
                {fmtDollar(estimatedValue)}
              </div>
            </div>
            <div className="h-[220px]">
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
            </div>
          </div>

          {/* Revenue vs EBITDA */}
          <div className="card">
            <div className="section-title">Revenue vs EBITDA</div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueEbitdaData} barGap={4}>
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
                  <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ebitda" name="EBITDA" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> EBITDA
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
                <div className="text-3xl mb-2">✅</div>
                <div className="text-[14px] font-semibold text-green-500">All Clear</div>
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
                      <span className="text-base flex-shrink-0">{action.icon}</span>
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
            <div className="space-y-4">
              {benchmarks.map((b) => {
                const aboveMedian = b.invert ? b.storeValue < b.median : b.storeValue >= b.median;
                const barPct = benchmarkBarPercent(b.storeValue, b.median, b.invert);
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between text-[12px] mb-1.5">
                      <span style={{ color: "var(--text-secondary)" }}>{b.label}</span>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {b.value}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-card2)" }}>
                      <div
                        className={clsx("h-full rounded-full transition-all", aboveMedian ? "bg-green-500" : "bg-amber-500")}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      Industry median: {b.displayMedian}
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
            <div className="space-y-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
              <div className="flex justify-between">
                <span>Lease Score</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {demoScores.lease}/100
                </span>
              </div>
              <div className="flex justify-between">
                <span>Years Remaining</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  7.3 yrs
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
                7.3yr base + 10yr options = 17.3yr total control
              </div>
            </div>
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

        {/* Quick Links */}
        <div className="card">
          <div className="section-title mb-3">Quick Links</div>
          <div className="grid-2 grid grid-cols-2 gap-2">
            {[
              { href: "/valuation", label: "Valuation", emoji: "💎" },
              { href: "/reports", label: "Reports", emoji: "📄" },
              { href: "/scenarios", label: "Scenarios", emoji: "🔀" },
              { href: "/insurance", label: "Insurance", emoji: "🛡️" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-medium transition-colors duration-300 hover:opacity-80"
                style={{ background: "var(--bg-card2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                <span>{link.emoji}</span>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Valuation Summary */}
      <div className="card">
        <div className="section-title mb-4">Valuation Summary</div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { label: "Est. Value", value: fmtDollar(estimatedValue) },
            {
              label: "Multiple",
              value: fmtMultiple(finalMultiple),
              tooltip: "Applied to annual EBITDA to estimate store value. Higher multiples reflect better lease, equipment, and market factors.",
            },
            { label: "Annual EBITDA", value: fmtDollar(store?.monthly_revenue != null ? annualEbitda : demoFinancials.ebitda) },
            { label: "Annual Revenue", value: fmtDollar(store?.monthly_revenue != null ? revenue * 12 : demoFinancials.annualRevenue) },
            { label: "NOI", value: fmtDollar(store?.monthly_revenue != null ? annualEbitda - (store?.monthly_rent ?? demoFinancials.monthlyRent) * 12 : demoFinancials.noi) },
            { label: "DSCR", value: `${dscrNum.toFixed(2)}x` },
            { label: "Cash Flow", value: fmtDollar(annualCashFlow) },
          ].map((item) => (
            <div key={item.label}>
              <div className="metric-label">
                {"tooltip" in item && item.tooltip ? (
                  <MetricTooltip label={item.label} explanation={item.tooltip} />
                ) : (
                  item.label
                )}
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
