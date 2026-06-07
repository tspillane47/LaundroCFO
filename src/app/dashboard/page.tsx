"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { scores, valueTrend } from "@/lib/data";
import { MetricCard, SmallMetric } from "@/components/ui/MetricCard";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { AreaChart, Area, Tooltip, ResponsiveContainer } from "recharts";
import { fmtDollar, fmt, fmtMultiple } from "@/lib/calculations";
import { calcValuationMultiple } from "@/lib/valuation";
import {
  calcBuildingEquity,
  calcOccupancyCostRatioFromRent,
  calcRealEstateLTV,
} from "@/lib/real-estate-calculations";
import clsx from "clsx";

const CustomTooltip = ({ active, payload, label, prefix = "$" }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1e2a3a] border border-white/10 rounded-lg p-3 text-xs">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className="text-slate-100 font-semibold">{prefix}{fmt(payload[0].value)}</div>
    </div>
  );
};

const valueDrivers = [
  { label: "Revenue", amount: "+$8,400", pct: 88, color: "bg-green-500", positive: true },
  { label: "Lease Term", amount: "+$12,000", pct: 73, color: "bg-blue-500", positive: true },
  { label: "Equipment Age", amount: "+$6,600", pct: 82, color: "bg-green-400", positive: true },
  { label: "Utility Ratio", amount: "−$3,200", pct: 55, color: "bg-amber-500", positive: false },
  { label: "Debt Balance", amount: "−$1,800", pct: 40, color: "bg-red-500", positive: false },
];

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

function leaseScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 50) return "Moderate";
  return "High Risk";
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function DashboardPage() {
  const [store, setStore] = useState<any>(null);
  const [lease, setLease] = useState<any>(null);
  const [leaseOptions, setLeaseOptions] = useState<any[]>([]);
  const [realEstate, setRealEstate] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: storeData } = await supabase
        .from("stores")
        .select("*")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!storeData) return;
      setStore(storeData);

      if (storeData.occupancy_type === "owner_occupied") {
        const { data: reData } = await supabase
          .from("real_estate")
          .select("*")
          .eq("store_id", storeData.id)
          .limit(1)
          .maybeSingle();
        setRealEstate(reData);
      } else {
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
        }
      }
    }
    load();
  }, []);

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
      label: leaseScoreLabel(score),
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
      propertyEntity: realEstate.property_owner_entity ?? "—",
      estimatedValue: realEstate.estimated_value,
      mortgageBalance: realEstate.current_loan_balance,
      equity,
      ltv,
      monthlyRentCharged: realEstate.monthly_rent_charged,
      occupancyCostRatio,
    };
  }, [realEstate, store]);

  const revenue = store?.monthly_revenue ?? 69250;
  const expenses = store?.monthly_expenses ?? 49470;
  const rent = store?.monthly_rent ?? 6200;
  const ebitda = revenue - expenses;
  const annualRevenue = revenue * 12;
  const annualEbitda = ebitda * 12;
  const debtService = store?.annual_debt_service ?? 100000;
  const cashFlow = annualEbitda - debtService;
  const dscr = debtService > 0 ? (cashFlow / debtService + 1).toFixed(2) : "0";
  const ebitdaMargin = revenue > 0 ? ((ebitda / revenue) * 100).toFixed(1) : "0";
  const isOwnerOccupied = store?.occupancy_type === "owner_occupied";

  const valuation = useMemo(() => {
    const totalControl = leaseMetrics?.totalControl ?? (isOwnerOccupied ? 15 : 0);
    return calcValuationMultiple({
      ebitda: annualEbitda,
      locationCategory: store?.location_type ?? "suburban",
      totalLeaseControl: totalControl,
      occupancyType: isOwnerOccupied ? "owned" : "leased",
      avgEquipmentAge: store?.avg_machine_age ?? 6.1,
      squareFootage: store?.square_footage ?? 4450,
      revenueTrend: store?.revenue_trend ?? "stable",
      storeCondition: store?.store_condition ?? "average",
      competitionLevel: store?.competition_level ?? "normal",
      realEstateValue: realEstateMetrics?.estimatedValue ?? undefined,
    });
  }, [annualEbitda, store, leaseMetrics, isOwnerOccupied, realEstateMetrics]);

  const estimatedValue = Math.round(valuation.businessValue);
  const finalMultiple = valuation.finalMultiple;
  const machines = (store?.washers ?? 28) + (store?.dryers ?? 32);
  const monthlyCashFlow = revenue - expenses - (debtService / 12);

  const underwritingMetrics = [
    { label: "DSCR", value: dscr + "x", badge: "badge-green" },
    { label: "Global DSCR", value: "1.78x", badge: "badge-green" },
    { label: "EBITDA Margin", value: ebitdaMargin + "%", badge: "badge-green" },
    { label: "Rent to Revenue", value: "12.3%", badge: "badge-green" },
    { label: "Utility to Revenue", value: "17.8%", badge: "badge-amber" },
    { label: "Revenue per SF", value: "$185.40", badge: null },
    { label: "EBITDA per SF", value: "$53.41", badge: null },
    { label: "Revenue per Machine", value: "$13,850", badge: null },
    { label: "Turns per Day", value: "6.4", badge: null },
    { label: "Debt Yield", value: "18.2%", badge: null },
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link href="/settings/edit-store" className="btn-outline text-[12px] px-3 py-1.5">
          Edit Store
        </Link>
      </div>

      {/* Row 1: Hero KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card col-span-1">
          <div className="metric-label">Estimated Store Value</div>
          <div className="metric-value text-[28px]">{fmtDollar(estimatedValue)}</div>
          <div className="text-[12px] text-green-400 mt-1">{fmtMultiple(finalMultiple)} EBITDA multiple</div>
          <div className="mt-3 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={valueTrend.slice(-8)}>
                <defs>
                  <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#vg)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card col-span-1">
          <div className="metric-label">LaundroCFO Score</div>
          <div className="flex items-center gap-4 mt-1">
            <ScoreRing score={scores.laundrocfo} size={78} />
            <div>
              <div className="text-[16px] font-bold text-slate-100">Strong</div>
              <div className="text-[11px] text-slate-500 mt-1">
                Financeability: <span className="text-green-400">Strong</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Risk Level: <span className="text-green-400">Low</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Confidence: <span className="text-blue-400">High</span>
              </div>
            </div>
          </div>
        </div>

        <MetricCard
          label="DSCR"
          value={dscr + "x"}
          sub="▲ Above 1.25x threshold"
          subColor="positive"
          progress={85}
          progressColor="bg-green-500"
        />

        <MetricCard
          label="EBITDA Margin"
          value={ebitdaMargin + "%"}
          sub="▲ Strong — top quartile"
          subColor="positive"
          progress={72}
          progressColor="bg-blue-500"
        />
      </div>

      {/* Row 2: Value Drivers + Underwriting Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="section-title">
            Value Drivers
            <span className="text-[12px] text-slate-500 font-normal">Monthly movement</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {valueDrivers.map((d) => (
              <div key={d.label} className="flex items-center gap-3 py-2.5">
                <div className="text-[12px] text-slate-400 w-28 flex-shrink-0">{d.label}</div>
                <div className="flex-1 h-1.5 bg-[#243347] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
                </div>
                <div className={`text-[12px] font-semibold w-20 text-right ${d.positive ? "text-green-400" : "text-red-400"}`}>
                  {d.amount}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-title">Underwriting Metrics</div>
          <div className="divide-y divide-white/[0.04]">
            {underwritingMetrics.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-slate-400">{m.label}</span>
                {m.badge ? (
                  <span className={`badge ${m.badge}`}>{m.value}</span>
                ) : (
                  <span className="font-semibold text-slate-100">{m.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Occupancy, Equipment, Cash Flow */}
      <div className={clsx("grid gap-4", isOwnerOccupied ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-3")}>
        {isOwnerOccupied ? (
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title mb-0">Real Estate</div>
              <Link href="/lease" className="text-[11px] text-blue-400 hover:text-blue-300">
                View details →
              </Link>
            </div>
            {realEstateMetrics ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SmallMetric
                  label="Property Entity"
                  value={realEstateMetrics.propertyEntity}
                  color="text-slate-100"
                />
                <SmallMetric
                  label="Estimated Property Value"
                  value={formatCurrency(realEstateMetrics.estimatedValue)}
                  color="text-blue-300"
                />
                <SmallMetric
                  label="Mortgage Balance"
                  value={formatCurrency(realEstateMetrics.mortgageBalance)}
                  color="text-slate-100"
                />
                <SmallMetric
                  label="Building Equity"
                  value={formatCurrency(realEstateMetrics.equity)}
                  color="text-green-400"
                />
                <SmallMetric
                  label="Property LTV"
                  value={
                    realEstateMetrics.ltv != null
                      ? realEstateMetrics.ltv.toFixed(1) + "%"
                      : "—"
                  }
                  color={
                    realEstateMetrics.ltv != null && realEstateMetrics.ltv > 70
                      ? "text-amber-400"
                      : "text-slate-100"
                  }
                />
                <SmallMetric
                  label="Monthly Rent Charged"
                  value={formatCurrency(realEstateMetrics.monthlyRentCharged)}
                  color="text-slate-100"
                />
                <SmallMetric
                  label="Occupancy Cost Ratio"
                  value={
                    realEstateMetrics.occupancyCostRatio != null
                      ? realEstateMetrics.occupancyCostRatio.toFixed(1) + "%"
                      : "—"
                  }
                  color={
                    realEstateMetrics.occupancyCostRatio != null &&
                    realEstateMetrics.occupancyCostRatio > 20
                      ? "text-amber-400"
                      : "text-green-400"
                  }
                />
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-slate-500 text-[13px] mb-3">No real estate profile on file.</p>
                <Link href="/lease" className="btn-primary">
                  Add Real Estate Profile
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <div className="metric-label">Lease Score</div>
              <Link href="/lease" className="text-[10px] text-blue-400 hover:text-blue-300">
                Details →
              </Link>
            </div>
            {leaseMetrics ? (
              <>
                <div className="flex items-center gap-3 mt-1 mb-3">
                  <span className="metric-value">{leaseMetrics.score}</span>
                  <span
                    className={clsx(
                      "badge",
                      leaseMetrics.score >= 75
                        ? "badge-green"
                        : leaseMetrics.score >= 50
                          ? "badge-amber"
                          : "badge-red"
                    )}
                  >
                    {leaseMetrics.label}
                  </span>
                </div>
                <div className="text-[12px] text-slate-400 space-y-1.5">
                  <div>
                    Years Remaining:{" "}
                    <span className="text-slate-100 font-semibold">
                      {leaseMetrics.yearsRemaining.toFixed(1)} yrs
                    </span>
                  </div>
                  <div>
                    Options:{" "}
                    <span className="text-slate-100 font-semibold">
                      {leaseMetrics.availableCount > 0
                        ? `${leaseMetrics.availableCount} available (${leaseMetrics.optionYears} yrs)`
                        : "None on file"}
                    </span>
                  </div>
                  <div>
                    Total Control:{" "}
                    <span className="text-slate-100 font-semibold">
                      {leaseMetrics.totalControl.toFixed(1)} yrs
                    </span>
                  </div>
                  <div>
                    Expires:{" "}
                    <span className="text-slate-100 font-semibold">{leaseMetrics.expires}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-4">
                <p className="text-slate-500 text-[13px] mb-3">No lease on file.</p>
                <Link href="/lease" className="btn-primary text-[11px]">
                  Add Lease
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="metric-label">Equipment Score</div>
          <div className="flex items-center gap-3 mt-1 mb-3">
            <span className="metric-value">88</span>
            <span className="badge badge-green">Good</span>
          </div>
          <div className="text-[12px] text-slate-400 space-y-1.5">
            <div>Avg Age: <span className="text-slate-100 font-semibold">6.1 years</span></div>
            <div>Total Machines: <span className="text-slate-100 font-semibold">{machines}</span></div>
            <div>Replacement Est: <span className="text-slate-100 font-semibold">$612,500</span></div>
            <div>Status: <span className="text-green-400 font-semibold">Good — Under 10yr</span></div>
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Monthly Cash Flow</div>
          <div className="metric-value mt-1 mb-3">{fmtDollar(monthlyCashFlow)}</div>
          <div className="text-[12px] text-slate-400 space-y-1.5">
            <div>Revenue: <span className="text-slate-100 font-semibold">{fmtDollar(revenue)}</span></div>
            <div>EBITDA: <span className="text-green-400 font-semibold">{fmtDollar(ebitda)}</span></div>
            <div>Utilities: <span className="text-amber-400 font-semibold">{fmtDollar(store?.monthly_utilities ?? 12340)}</span></div>
            <div>Payroll: <span className="text-slate-100 font-semibold">$8,650</span></div>
          </div>
        </div>
      </div>

      {/* Row 4: Valuation Summary */}
      <div className="card">
        <div className="section-title">Valuation Summary</div>
        <div className="grid grid-cols-5 gap-3">
          <SmallMetric label="Annual Revenue" value={fmtDollar(annualRevenue)} />
          <SmallMetric label="EBITDA" value={fmtDollar(annualEbitda)} color="text-green-400" />
          <SmallMetric label="EBITDA Multiple" value={fmtMultiple(finalMultiple)} color="text-blue-300" />
          <SmallMetric label="NOI" value="$226,800" />
          <SmallMetric label="Est. Store Value" value={fmtDollar(estimatedValue)} color="text-blue-300" />
        </div>
      </div>
    </div>
  );
}
