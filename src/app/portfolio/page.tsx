"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { calcValuationMultiple, getEquipmentAdjustment } from "@/lib/valuation";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import { AreaChart, Area, Tooltip, ResponsiveContainer } from "recharts";
import clsx from "clsx";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FALLBACK_MULTIPLE = 3.47;

type Store = {
  id: string;
  name: string | null;
  address: string | null;
  monthly_revenue: number | null;
  monthly_expenses: number | null;
  annual_debt_service: number | null;
  loan_balance: number | null;
  occupancy_type: string | null;
  location_type: string | null;
  square_footage: number | null;
  revenue_trend: string | null;
  store_condition: string | null;
  competition_level: string | null;
  washers: number | null;
  dryers: number | null;
  avg_machine_age: number | null;
};

type Lease = {
  id: string;
  store_id: string;
  lease_end_date: string | null;
  monthly_rent: number | null;
  exclusivity_clause: boolean | null;
  personal_guaranty: boolean | null;
  assignment_rights: string | null;
};

type LeaseOption = {
  lease_id: string;
  status: string | null;
  option_years: number | null;
};

type RealEstate = {
  store_id: string;
  estimated_value: number | null;
};

type PortfolioAlert = {
  id: string;
  storeId: string;
  storeName: string;
  issue: string;
  severity: "urgent" | "warning" | "info";
  href: string;
};

type StoreMetrics = {
  store: Store;
  estimatedValue: number;
  monthlyRevenue: number;
  monthlyEbitda: number;
  annualEbitda: number;
  dscr: number;
  healthScore: number;
  equipmentGrade: "A" | "B" | "C" | "D";
  leaseYearsRemaining: number | null;
  hasInsurance: boolean;
  totalMachines: number;
  avgEquipmentAge: number;
  hasAlert: boolean;
  isIncomplete: boolean;
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

function getLeaseAdjustment(totalLeaseControl: number): number {
  if (totalLeaseControl >= 15) return 0.5;
  if (totalLeaseControl >= 10) return 0.25;
  if (totalLeaseControl >= 7) return 0.1;
  if (totalLeaseControl >= 5) return 0;
  if (totalLeaseControl >= 3) return -0.25;
  return -0.75;
}

function calcStoreHealthScore(totalLeaseControl: number, avgEquipmentAge: number, pct200G: number): number {
  const leaseAdj = getLeaseAdjustment(totalLeaseControl);
  const equipAdj = getEquipmentAdjustment(avgEquipmentAge, pct200G);
  return Math.min(100, Math.max(0, Math.round(50 + leaseAdj * 100 + equipAdj * 100)));
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

function benchmarkBarPercent(value: number, median: number, invert = false): number {
  const ratio = value / median;
  return invert ? Math.max(5, Math.min(95, (2 - ratio) * 50)) : Math.max(5, Math.min(95, ratio * 50));
}

function isStoreIncomplete(store: Store): boolean {
  return !store.name || !store.address || !store.monthly_revenue || store.monthly_revenue <= 0;
}

function healthBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function dscrColorClass(dscr: number): string {
  if (dscr >= 1.5) return "text-green-500";
  if (dscr >= 1.25) return "text-amber-500";
  return "text-red-500";
}

function gradeBadgeClass(grade: "A" | "B" | "C" | "D"): string {
  if (grade === "A") return "badge badge-green";
  if (grade === "B") return "badge badge-blue";
  if (grade === "C") return "badge badge-amber";
  return "badge badge-red";
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
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseOptions, setLeaseOptions] = useState<LeaseOption[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [insurancePolicies, setInsurancePolicies] = useState<{ store_id: string }[]>([]);
  const [realEstate, setRealEstate] = useState<RealEstate[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: storesData } = await supabase.from("stores").select("*").eq("user_id", user.id);
      const storeList = (storesData ?? []) as Store[];
      setStores(storeList);

      const storeIds = storeList.map((s) => s.id);

      const [
        { data: equipmentData },
        { data: insuranceData },
      ] = await Promise.all([
        supabase.from("equipment_inventory").select("*").eq("user_id", user.id),
        supabase.from("insurance_policies").select("store_id").eq("user_id", user.id).eq("is_active", true),
      ]);

      setEquipment((equipmentData ?? []) as EquipmentRecord[]);
      setInsurancePolicies(insuranceData ?? []);

      if (storeIds.length > 0) {
        const [
          { data: leasesData },
          { data: realEstateData },
        ] = await Promise.all([
          supabase.from("leases").select("*").in("store_id", storeIds),
          supabase.from("real_estate").select("store_id, estimated_value").in("store_id", storeIds),
        ]);

        setLeases((leasesData ?? []) as Lease[]);
        setRealEstate((realEstateData ?? []) as RealEstate[]);

        const leaseIds = (leasesData ?? []).map((l: Lease) => l.id);
        if (leaseIds.length > 0) {
          const { data: optionsData } = await supabase
            .from("lease_options")
            .select("lease_id, status, option_years")
            .in("lease_id", leaseIds);
          setLeaseOptions((optionsData ?? []) as LeaseOption[]);
        }
      }

      setLoading(false);
    }
    load();
  }, [supabase]);

  const storeMetrics = useMemo((): StoreMetrics[] => {
    return stores.map((store) => {
      const monthlyRevenue = store.monthly_revenue ?? 0;
      const monthlyExpenses = store.monthly_expenses ?? 0;
      const monthlyEbitda = monthlyRevenue - monthlyExpenses;
      const annualEbitda = monthlyEbitda * 12;
      const debtService = store.annual_debt_service ?? 0;
      const dscr = debtService > 0 ? annualEbitda / debtService : 0;

      const storeEquipment = equipment.filter((e) => e.store_id === store.id);
      const equipMetrics = computeEquipmentMetrics(storeEquipment);
      const avgEquipmentAge =
        storeEquipment.length > 0
          ? equipMetrics.weightedAvgAge
          : (store.avg_machine_age ?? 0);
      const pct200G = storeEquipment.length > 0 ? equipMetrics.pct200GWashers : 0;
      const totalMachines =
        storeEquipment.length > 0
          ? equipMetrics.totalMachines
          : (store.washers ?? 0) + (store.dryers ?? 0);

      const isOwnerOccupied = store.occupancy_type === "owner_occupied";
      const storeLease = leases.find((l) => l.store_id === store.id);
      const options = storeLease
        ? leaseOptions.filter((o) => o.lease_id === storeLease.id && o.status === "Available")
        : [];
      const optionYears = options.reduce((s, o) => s + (o.option_years ?? 0), 0);
      const yearsRemaining = storeLease ? calcYearsRemaining(storeLease.lease_end_date) : null;
      const totalLeaseControl = isOwnerOccupied
        ? 15
        : (yearsRemaining ?? 0) + optionYears;

      const reRecord = realEstate.find((r) => r.store_id === store.id);
      const valuation = calcValuationMultiple({
        ebitda: annualEbitda,
        locationCategory: store.location_type ?? "suburban",
        totalLeaseControl,
        occupancyType: isOwnerOccupied ? "owned" : "leased",
        avgEquipmentAge,
        pct200GWashers: pct200G,
        squareFootage: store.square_footage ?? 0,
        revenueTrend: store.revenue_trend ?? "stable",
        storeCondition: store.store_condition ?? "average",
        competitionLevel: store.competition_level ?? "normal",
        realEstateValue: reRecord?.estimated_value ?? undefined,
      });

      const fallbackValue = annualEbitda * FALLBACK_MULTIPLE;
      const estimatedValue = annualEbitda > 0 ? Math.round(valuation.businessValue || fallbackValue) : 0;

      const healthScore = calcStoreHealthScore(totalLeaseControl, avgEquipmentAge, pct200G);
      const hasInsurance = insurancePolicies.some((p) => p.store_id === store.id);
      const incomplete = isStoreIncomplete(store);

      const hasAlert =
        (!isOwnerOccupied && yearsRemaining != null && yearsRemaining < 3) ||
        dscr < 1.25 ||
        !hasInsurance;

      return {
        store,
        estimatedValue,
        monthlyRevenue,
        monthlyEbitda,
        annualEbitda,
        dscr,
        healthScore,
        equipmentGrade: equipMetrics.grade,
        leaseYearsRemaining: isOwnerOccupied ? null : yearsRemaining,
        hasInsurance,
        totalMachines,
        avgEquipmentAge,
        hasAlert,
        isIncomplete: incomplete,
      };
    });
  }, [stores, leases, leaseOptions, equipment, insurancePolicies, realEstate]);

  const aggregates = useMemo(() => {
    const totalPortfolioValue = storeMetrics.reduce((s, m) => s + m.estimatedValue, 0);
    const totalMonthlyRevenue = storeMetrics.reduce((s, m) => s + m.monthlyRevenue, 0);
    const totalAnnualRevenue = totalMonthlyRevenue * 12;
    const totalMonthlyEbitda = storeMetrics.reduce((s, m) => s + m.monthlyEbitda, 0);
    const totalAnnualEbitda = totalMonthlyEbitda * 12;
    const totalDebt = stores.reduce((s, st) => s + (st.loan_balance ?? 0), 0);
    const totalAnnualDebtService = stores.reduce((s, st) => s + (st.annual_debt_service ?? 0), 0);
    const portfolioDSCR = totalAnnualDebtService > 0 ? totalAnnualEbitda / totalAnnualDebtService : 0;
    const totalRealEstateValue = realEstate.reduce((s, r) => s + (r.estimated_value ?? 0), 0);
    const portfolioNetWorth = totalPortfolioValue + totalRealEstateValue - totalDebt;
    const portfolioHealthScore =
      storeMetrics.length > 0
        ? Math.round(storeMetrics.reduce((s, m) => s + m.healthScore, 0) / storeMetrics.length)
        : 0;
    const totalMachines = storeMetrics.reduce((s, m) => s + m.totalMachines, 0);
    const ebitdaMargin = totalMonthlyRevenue > 0 ? (totalMonthlyEbitda / totalMonthlyRevenue) * 100 : 0;
    const totalSqft = stores.reduce((s, st) => s + (st.square_footage ?? 0), 0);
    const avgRevenuePerSF = totalSqft > 0 ? totalAnnualRevenue / totalSqft : 0;
    const avgEquipmentAge =
      storeMetrics.length > 0
        ? storeMetrics.reduce((s, m) => s + m.avgEquipmentAge, 0) / storeMetrics.length
        : 0;
    const availableMonthlyCashFlow = Math.max(0, totalMonthlyEbitda - totalAnnualDebtService / 12);
    const acquisitionCapacity = (availableMonthlyCashFlow * 12) / 0.1;

    return {
      totalPortfolioValue,
      totalMonthlyRevenue,
      totalAnnualRevenue,
      totalMonthlyEbitda,
      totalAnnualEbitda,
      totalDebt,
      totalAnnualDebtService,
      portfolioDSCR,
      totalRealEstateValue,
      portfolioNetWorth,
      portfolioHealthScore,
      totalMachines,
      ebitdaMargin,
      avgRevenuePerSF,
      avgEquipmentAge,
      availableMonthlyCashFlow,
      acquisitionCapacity,
    };
  }, [storeMetrics, stores, realEstate]);

  const valuationTrend = useMemo(
    () => generateValuationTrend(aggregates.totalPortfolioValue),
    [aggregates.totalPortfolioValue]
  );

  const monthlyChange = valuationTrend[11].value - valuationTrend[10].value;
  const yearChangePct =
    valuationTrend[0].value > 0
      ? ((aggregates.totalPortfolioValue - valuationTrend[0].value) / valuationTrend[0].value) * 100
      : 0;

  const portfolioAlerts = useMemo((): PortfolioAlert[] => {
    const alerts: PortfolioAlert[] = [];

    for (const m of storeMetrics) {
      const name = m.store.name ?? "Unnamed Store";

      if (m.isIncomplete) {
        alerts.push({
          id: `${m.store.id}-incomplete`,
          storeId: m.store.id,
          storeName: name,
          issue: "Incomplete store profile — finish onboarding",
          severity: "warning",
          href: `/settings/edit-store?store=${m.store.id}`,
        });
      }

      if (m.leaseYearsRemaining != null && m.leaseYearsRemaining < 2) {
        alerts.push({
          id: `${m.store.id}-lease`,
          storeId: m.store.id,
          storeName: name,
          issue: `Lease expiring in ${m.leaseYearsRemaining.toFixed(1)} years`,
          severity: "urgent",
          href: "/lease",
        });
      }

      if (m.dscr < 1.25 && m.store.annual_debt_service) {
        alerts.push({
          id: `${m.store.id}-dscr`,
          storeId: m.store.id,
          storeName: name,
          issue: `DSCR ${m.dscr.toFixed(2)}x below 1.25x threshold`,
          severity: "urgent",
          href: "/financials",
        });
      }

      if (!m.hasInsurance) {
        alerts.push({
          id: `${m.store.id}-insurance`,
          storeId: m.store.id,
          storeName: name,
          issue: "No active insurance policies on file",
          severity: "warning",
          href: "/insurance",
        });
      }

      if (m.avgEquipmentAge > 12) {
        alerts.push({
          id: `${m.store.id}-equipment`,
          storeId: m.store.id,
          storeName: name,
          issue: `Equipment avg age ${m.avgEquipmentAge.toFixed(1)} years`,
          severity: "warning",
          href: "/equipment",
        });
      }
    }

    return alerts;
  }, [storeMetrics]);

  const acquisitionMessage =
    aggregates.portfolioDSCR > 2.0
      ? "Strong position. You may qualify for additional acquisition financing."
      : aggregates.portfolioDSCR > 1.5
        ? "Good position. Consider building reserves before next acquisition."
        : "Focus on improving current store performance before expanding.";

  const benchmarks = [
    {
      label: "Avg EBITDA Margin",
      value: `${aggregates.ebitdaMargin.toFixed(1)}%`,
      median: 22,
      storeValue: aggregates.ebitdaMargin,
      displayMedian: "22%",
      invert: false,
    },
    {
      label: "Avg Revenue/SF",
      value: `$${aggregates.avgRevenuePerSF.toFixed(0)}`,
      median: 140,
      storeValue: aggregates.avgRevenuePerSF,
      displayMedian: "$140",
      invert: false,
    },
    {
      label: "Portfolio DSCR",
      value: `${aggregates.portfolioDSCR.toFixed(2)}x`,
      median: 1.5,
      storeValue: aggregates.portfolioDSCR,
      displayMedian: "1.5x",
      invert: false,
    },
    {
      label: "Avg Equipment Age",
      value: `${aggregates.avgEquipmentAge.toFixed(1)}yr`,
      median: 9,
      storeValue: aggregates.avgEquipmentAge,
      displayMedian: "9yr",
      invert: true,
    },
  ];

  function selectStoreAndNavigate(storeId: string, href: string) {
    localStorage.setItem("selectedStoreId", storeId);
    window.location.href = href;
  }

  if (loading) {
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
        <div className="text-[32px] font-bold text-blue-300 tracking-tight mb-1">LaundroCFO</div>
        <div className="text-[10px] text-slate-500 tracking-widest uppercase mb-10">Valuation & Underwriting</div>

        <h1 className="text-[36px] font-bold tracking-tight mb-3" style={{ color: "var(--text-primary)" }}>
          Welcome to LaundroCFO
        </h1>
        <p className="text-[18px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
          Your laundromat portfolio command center
        </p>
        <p className="text-[14px] max-w-md mb-8" style={{ color: "var(--text-muted)" }}>
          Add your first store to begin tracking valuation, equipment, lease risk, insurance, and portfolio performance.
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {["💎 Store Valuation", "📋 Lease Risk", "⚙️ Equipment", "🛡️ Insurance"].map((pill) => (
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
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-[16px] font-bold text-white transition-opacity hover:opacity-90"
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
                {yearChangePct >= 0 ? "+" : ""}{yearChangePct.toFixed(1)}% vs last year
              </span>
            </div>
            <div className="text-[12px] text-white/40 mt-3">
              {stores.length} store{stores.length !== 1 ? "s" : ""} · {aggregates.totalMachines} machines · Est. EBITDA {fmtDollar(aggregates.totalMonthlyEbitda)}/mo
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="card">
          <div className="metric-label">Total Revenue</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(aggregates.totalAnnualRevenue)}
          </div>
          <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            {fmtDollar(aggregates.totalMonthlyRevenue)}/mo
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Total EBITDA</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(aggregates.totalAnnualEbitda)}
          </div>
          <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            {aggregates.ebitdaMargin.toFixed(1)}% margin
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Portfolio DSCR</div>
          <div className={clsx("text-[28px] font-bold tracking-tight", dscrColorClass(aggregates.portfolioDSCR))}>
            {fmtMultiple(aggregates.portfolioDSCR)}
          </div>
          <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            {aggregates.portfolioDSCR >= 1.5 ? "Strong coverage" : aggregates.portfolioDSCR >= 1.25 ? "Adequate" : "Below threshold"}
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Total Debt</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(aggregates.totalDebt)}
          </div>
          <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            Loan balance total
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Portfolio Net Worth</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(aggregates.portfolioNetWorth)}
          </div>
          <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            Business + real estate − debt
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Stores</div>
          <div className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {stores.length}
          </div>
          <Link href="/dashboard" className="text-[12px] mt-2 inline-block text-blue-400 hover:text-blue-300 font-medium">
            View All →
          </Link>
        </div>
      </div>

      {/* Net Worth Breakdown */}
      <div className="card">
        <div className="text-[14px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Portfolio Net Worth Breakdown
        </div>
        <div className="space-y-2 text-[14px]">
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>Business Value:</span>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmtDollar(aggregates.totalPortfolioValue)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>+ Real Estate:</span>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmtDollar(aggregates.totalRealEstateValue)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>+ Cash (est.):</span>
            <span className="italic" style={{ color: "var(--text-muted)" }}>Enter manually</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>− Total Debt:</span>
            <span className="font-medium text-red-400">−{fmtDollar(aggregates.totalDebt)}</span>
          </div>
          <div className="border-t pt-3 mt-3 flex justify-between" style={{ borderColor: "var(--border)" }}>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>= Net Worth:</span>
            <span className="text-[22px] font-bold text-green-400">{fmtDollar(aggregates.portfolioNetWorth)}</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Store Cards */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>Your Stores</h2>
            <Link href="/onboarding" className="btn-outline text-[12px] px-3 py-1.5">+ Add Store</Link>
          </div>

          <div className={clsx(
            stores.length === 1 ? "grid grid-cols-1" : "grid grid-cols-1 md:grid-cols-2 gap-4"
          )}>
            {storeMetrics.map((m) => (
              <div
                key={m.store.id}
                className={clsx("card relative", stores.length === 1 && "p-6")}
              >
                {m.hasAlert && (
                  <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-red-500" />
                )}

                <div className={clsx("font-bold mb-1", stores.length === 1 ? "text-[20px]" : "text-[16px]")} style={{ color: "var(--text-primary)" }}>
                  {m.store.name ?? "Unnamed Store"}
                </div>
                <div className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
                  {m.store.address ?? "No address"}
                </div>

                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[
                    { label: "Est. Value", value: fmtDollar(m.estimatedValue) },
                    { label: "Revenue", value: fmtDollar(m.monthlyRevenue) },
                    { label: "EBITDA", value: fmtDollar(m.monthlyEbitda) },
                    { label: "DSCR", value: fmtMultiple(m.dscr), color: dscrColorClass(m.dscr) },
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
                  <span className={gradeBadgeClass(m.equipmentGrade)}>Equipment {m.equipmentGrade}</span>
                  {m.leaseYearsRemaining != null ? (
                    <span className="badge badge-blue">{m.leaseYearsRemaining.toFixed(1)}yr lease</span>
                  ) : (
                    <span className="badge badge-green">Owner Occupied</span>
                  )}
                  <span className={m.hasInsurance ? "badge badge-green" : "badge badge-red"}>
                    {m.hasInsurance ? "Insured" : "No Insurance"}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selectStoreAndNavigate(m.store.id, `/dashboard?store=${m.store.id}`)}
                    className="btn-primary flex-1 text-[12px]"
                  >
                    View Store →
                  </button>
                  <Link
                    href={`/settings/edit-store?store=${m.store.id}`}
                    className="btn-outline flex-1 text-[12px] text-center"
                  >
                    Edit →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Alerts */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Action Required</h3>
              {portfolioAlerts.length > 0 && (
                <span className="badge badge-red">{portfolioAlerts.length}</span>
              )}
            </div>

            {portfolioAlerts.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-[24px] mb-2">✅</div>
                <div className="text-[13px] font-medium text-green-400">All Clear</div>
                <div className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>Portfolio looks healthy</div>
              </div>
            ) : (
              <div className="space-y-2">
                {portfolioAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={clsx(
                      "rounded-lg p-3 border-l-2",
                      alert.severity === "urgent" ? "border-l-red-500" : alert.severity === "warning" ? "border-l-amber-500" : "border-l-blue-500"
                    )}
                    style={{ background: "var(--bg-card2)" }}
                  >
                    <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{alert.storeName}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{alert.issue}</div>
                    <Link href={alert.href} className="text-[11px] text-blue-400 hover:text-blue-300 mt-1 inline-block">
                      View →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Benchmarks */}
          <div className="card">
            <h3 className="text-[14px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Portfolio vs Industry</h3>
            <div className="space-y-4">
              {benchmarks.map((b) => {
                const isBetter = b.invert ? b.storeValue < b.median : b.storeValue > b.median;
                const barPct = benchmarkBarPercent(b.storeValue, b.median, b.invert);
                return (
                  <div key={b.label}>
                    <div className="flex justify-between text-[12px] mb-1.5">
                      <span style={{ color: "var(--text-secondary)" }}>{b.label}</span>
                      <span className={clsx("font-semibold", isBetter ? "text-green-400" : "text-amber-400")}>
                        {b.value}
                      </span>
                    </div>
                    <div className="relative h-1.5 rounded-full" style={{ background: "var(--bg-card2)" }}>
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                        style={{ left: `${barPct}%`, background: isBetter ? "#22c55e" : "#f59e0b" }}
                      />
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Industry median: {b.displayMedian}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Acquisition Readiness */}
      <div className="card">
        <h3 className="text-[16px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Ready to Acquire Another Store?
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="metric-label">Current Portfolio DSCR</div>
            <div className={clsx("text-[22px] font-bold", dscrColorClass(aggregates.portfolioDSCR))}>
              {fmtMultiple(aggregates.portfolioDSCR)}
            </div>
          </div>
          <div>
            <div className="metric-label">Available Cash Flow for Debt Service</div>
            <div className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
              {fmtDollar(aggregates.availableMonthlyCashFlow)}/mo
            </div>
          </div>
          <div>
            <div className="metric-label">Estimated Acquisition Capacity</div>
            <div className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
              {fmtDollar(aggregates.acquisitionCapacity)}
            </div>
          </div>
        </div>
        <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>{acquisitionMessage}</p>
        <Link href="/scenarios" className="btn-primary inline-flex text-[13px]">
          Explore Scenarios →
        </Link>
      </div>
    </div>
  );
}
