"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { benchmarks as industryBenchmarks } from "@/lib/data";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { computeLaundroCfoScoreFromRaw } from "@/lib/laundroCfoScore";
import {
  calcTtmMetrics,
  enrichMonthlyRecords,
  sortRecordsDesc,
  type MonthlyFinancialRecord,
} from "@/lib/financials";
import { resolveDebtFromLoans, resolveEquipmentFromInventory, resolveSquareFootage } from "@/lib/storeCanonical";
import { fmtMultiple, fmtPct } from "@/lib/calculations";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { LaundroCfoScoreCard } from "@/components/ui/LaundroCfoScoreGauge";
import { PageError } from "@/components/ui/PageError";

const NETWORK_BENCHMARK_THRESHOLD = 15;

const networkBenchmarkMetrics = industryBenchmarks.filter((b) => b.metric !== "Avg Equipment Age");

type BenchmarkRowData = {
  metric: string;
  store: number | null;
  unit: string;
  median: number;
  top25: number;
  bottom25: number;
  lowerIsBetter: boolean;
};

function BenchmarkRow({
  metric,
  store,
  unit,
  median,
  top25,
  bottom25,
  lowerIsBetter,
  storeLabel,
}: BenchmarkRowData & { storeLabel: string }) {
  if (store == null) {
    return (
      <div className="flex items-center gap-4 py-3 border-b border-white/[0.05]">
        <div className="text-[13px] text-slate-400 w-44 flex-shrink-0">{metric}</div>
        <div className="flex-1 text-[12px] text-slate-600 italic">Add data to see this metric</div>
      </div>
    );
  }

  const min = lowerIsBetter ? top25 : bottom25;
  const max = lowerIsBetter ? bottom25 : top25;
  const pct = max === min ? 50 : Math.min(100, Math.max(0, ((store - min) / (max - min)) * 100));

  const isGood = lowerIsBetter ? store <= top25 : store >= top25;
  const isWarn = lowerIsBetter ? store >= bottom25 * 0.85 : store <= bottom25 * 1.15;
  const valColor = isGood ? "text-green-400" : isWarn ? "text-red-400" : "text-amber-400";

  const fmtVal = (v: number) =>
    unit === "$" ? `$${Math.round(v).toLocaleString()}` : unit === "x" ? `${v.toFixed(2)}x` : `${v.toFixed(1)}${unit}`;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/[0.05]">
      <div className="text-[13px] text-slate-400 w-44 flex-shrink-0">{metric}</div>
      <div className="flex-1 relative">
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{
            background: lowerIsBetter
              ? "linear-gradient(90deg, rgba(34,197,94,0.35) 0%, rgba(245,158,11,0.35) 50%, rgba(239,68,68,0.35) 100%)"
              : "linear-gradient(90deg, rgba(239,68,68,0.35) 0%, rgba(245,158,11,0.35) 50%, rgba(34,197,94,0.35) 100%)",
          }}
        />
        <div
          className="absolute top-[-3px] w-[3px] h-[14px] bg-white rounded-sm"
          style={{ left: `calc(${pct}% - 1.5px)` }}
        />
        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>
            {lowerIsBetter ? "Best" : "Worst"} 25% — {fmtVal(lowerIsBetter ? top25 : bottom25)}
          </span>
          <span>Median — {fmtVal(median)}</span>
          <span>
            {lowerIsBetter ? "Worst" : "Best"} 25% — {fmtVal(lowerIsBetter ? bottom25 : top25)}
          </span>
        </div>
      </div>
      <div className={`text-[13px] font-bold w-24 text-right ${valColor}`}>{fmtVal(store)}</div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-slate-400 shrink-0"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function NetworkLockedRow({ metric }: { metric: string }) {
  return (
    <div className="relative py-3 border-b border-white/[0.05] last:border-b-0">
      <div className="blur-[6px] pointer-events-none select-none opacity-70" aria-hidden>
        <div className="flex items-center gap-4">
          <div className="text-[13px] text-slate-400 w-44 flex-shrink-0">{metric}</div>
          <div className="flex-1 relative">
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{
                background:
                  "linear-gradient(90deg, rgba(239,68,68,0.35) 0%, rgba(245,158,11,0.35) 50%, rgba(34,197,94,0.35) 100%)",
              }}
            />
            <div className="absolute top-[-3px] w-[3px] h-[14px] bg-white rounded-sm" style={{ left: "58%" }} />
            <div className="flex justify-between text-[10px] text-slate-600 mt-1">
              <span>Worst 25%</span>
              <span>Median</span>
              <span>Best 25%</span>
            </div>
          </div>
          <div className="text-[13px] font-bold w-24 text-right text-slate-500">—</div>
        </div>
      </div>
      <div
        className="absolute inset-0 flex items-center justify-center gap-2 px-3"
        style={{ background: "rgba(15, 23, 42, 0.45)" }}
      >
        <LockIcon />
        <span className="text-[12px] text-slate-400">Unlocks when network reaches 15 stores.</span>
      </div>
    </div>
  );
}

function ScoresCalculationGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card overflow-hidden min-w-0 !py-3 !px-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left text-[12px] text-slate-500 hover:text-slate-300 transition-colors"
        aria-expanded={open}
      >
        How are these scores calculated? {open ? "↑" : "↓"}
      </button>

      {open ? (
        <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-5">
          <div>
            <h3 className="text-[13px] font-semibold text-slate-100 mb-2">LaundroCFO Score</h3>
            <p className="text-[12px] text-slate-400 mb-2">
              A 0–100 composite score with letter grades (A+ through F), shown on the Dashboard and
              Benchmarking pages. Four categories, 100 points total:
            </p>
            <ul className="space-y-1.5 text-[12px] text-slate-400 list-disc pl-4">
              <li>
                <span className="text-slate-300">Financial Performance (40 pts):</span> EBITDA margin,
                utility ratio, and revenue per machine — each compared to industry quartiles.
              </li>
              <li>
                <span className="text-slate-300">Debt &amp; Coverage (20 pts):</span> DSCR tiers (debt-free
                stores receive 13 pts) and rent-to-revenue.
              </li>
              <li>
                <span className="text-slate-300">Asset Quality (20 pts):</span> equipment age, lease years
                remaining, and equipment quality grade.
              </li>
              <li>
                <span className="text-slate-300">Profile Completeness (20 pts):</span> awards points for
                entering financials (6+ months TTM), equipment, lease, square footage, debt data, and
                utility breakdown.
              </li>
            </ul>
            <p className="mt-2 text-[12px] text-slate-500">
              An A grade requires real financial data — stores without TTM financials cannot score above
              the completeness cap. Improvement tips target your lowest-scoring categories.
            </p>
          </div>

          <div>
            <h3 className="text-[13px] font-semibold text-slate-100 mb-2">Performance Rating</h3>
            <ul className="space-y-1.5 text-[12px] text-slate-400 list-disc pl-4">
              <li>
                Looks at up to 7 metrics: EBITDA Margin, Revenue per SF, Utility Ratio, Rent to Revenue,
                DSCR, Revenue per Machine, and Avg Equipment Age.
              </li>
              <li>
                Each metric is compared to industry benchmarks sourced from the Coin Laundry Association
                and the LaundroCFO peer database.
              </li>
              <li>Rating is based on how many metrics beat the industry median:</li>
            </ul>
            <ul className="mt-2 space-y-1 text-[12px] text-slate-400 list-disc pl-8">
              <li>
                <span className="text-slate-300">Top 25%:</span> 4 or more metrics in the top quartile
              </li>
              <li>
                <span className="text-slate-300">Above Median:</span> 4 or more metrics above median
              </li>
              <li>
                <span className="text-slate-300">Average:</span> 2–3 metrics above median
              </li>
              <li>
                <span className="text-slate-300">Below Median:</span> fewer than 2 metrics above median
              </li>
            </ul>
            <p className="mt-2 text-[12px] text-slate-500">
              Metrics with missing data are excluded. If your store is missing square footage, equipment
              inventory, or debt service, fewer metrics are scored — which can cap your rating even if all
              available metrics are excellent. Complete your store profile to unlock all 7 metrics.
            </p>
          </div>

          <div>
            <h3 className="text-[13px] font-semibold text-slate-100 mb-2">Financeability Rating</h3>
            <ul className="space-y-1.5 text-[12px] text-slate-400 list-disc pl-4">
              <li>Based entirely on DSCR (Debt Service Coverage Ratio).</li>
              <li>DSCR = Annual EBITDA ÷ Annual Debt Service</li>
              <li>
                <span className="text-slate-300">Strong:</span> DSCR ≥ 1.50× — lenders typically view
                this as low risk
              </li>
              <li>
                <span className="text-slate-300">Acceptable:</span> DSCR ≥ 1.25× — meets minimum
                thresholds for most SBA and commercial loans
              </li>
              <li>
                <span className="text-slate-300">Marginal:</span> DSCR &lt; 1.25× — may face difficulty
                securing financing
              </li>
              <li>Shows &ldquo;—&rdquo; if no debt service is entered or EBITDA is zero/negative.</li>
            </ul>
            <p className="mt-2 text-[12px] text-slate-500">
              Requires active loans in the{" "}
              <Link href="/debt" className="text-blue-400 hover:underline">
                Debt
              </Link>{" "}
              module and P&L data in{" "}
              <Link href="/financials" className="text-blue-400 hover:underline">
                Financials
              </Link>{" "}
              to calculate.
            </p>
          </div>

          <div>
            <h3 className="text-[13px] font-semibold text-slate-100 mb-2">Industry Benchmarks</h3>
            <ul className="space-y-1.5 text-[12px] text-slate-400 list-disc pl-4">
              <li>
                The green/amber/red colors on each metric row show where your store falls relative to
                industry quartiles.
              </li>
            </ul>
            <ul className="mt-2 space-y-1.5 text-[12px] text-slate-400 pl-4">
              <li className="flex items-center gap-2">
                <span className="badge badge-green text-[10px]">Green</span>
                <span>Top 25% of laundromats nationally</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="badge badge-amber text-[10px]">Amber</span>
                <span>Between bottom and top quartile</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="badge badge-red text-[10px]">Red</span>
                <span>Bottom 25% — needs attention</span>
              </li>
            </ul>
            <p className="mt-2 text-[12px] text-slate-500">
              Benchmark values are sourced from the Coin Laundry Association and the LaundroCFO peer
              database (2024).
            </p>
            <p className="mt-1 text-[12px] text-slate-600 italic">
              Network benchmarks comparing your store against other LaundroCFO operators are coming soon.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NetworkBenchmarksSection({ optedIn }: { optedIn: boolean }) {
  const supabase = createClient();
  const [contributorCount, setContributorCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadContributorCount() {
      const { data, error } = await supabase.rpc("get_network_benchmark_contributor_count");
      if (!cancelled && !error && typeof data === "number") {
        setContributorCount(data);
      }
    }

    loadContributorCount();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const count = contributorCount ?? 0;
  const progress = Math.min(100, (count / NETWORK_BENCHMARK_THRESHOLD) * 100);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-100">LaundroCFO Network Benchmarks</h2>
        <p className="text-[12px] text-slate-500 mt-1">
          See how your store compares against real LaundroCFO operators — anonymously.
        </p>
      </div>

      <div className="card overflow-hidden min-w-0">
        {networkBenchmarkMetrics.map((b) => (
          <NetworkLockedRow key={b.metric} metric={b.metric} />
        ))}

        <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-3">
          <p className="text-[12px] text-slate-500">
            {contributorCount == null
              ? "Loading network size…"
              : `${count} store${count === 1 ? "" : "s"} currently contributing`}
          </p>

          <div>
            <div className="flex justify-between text-[11px] text-slate-600 mb-1.5">
              <span>Network progress</span>
              <span>
                {count} / {NETWORK_BENCHMARK_THRESHOLD} stores
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {optedIn ? (
            <span className="badge badge-green">You&apos;re contributing — thank you</span>
          ) : (
            <Link href="/settings#network-benchmarks" className="btn-primary inline-block text-[13px]">
              Join the Network
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BenchmarkingPage() {
  const supabase = createClient();
  const { selectedStore, isAllStores, stores, loading: storesLoading } = useStores();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [store, setStore] = useState<Record<string, unknown> | null>(null);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [lease, setLease] = useState<Record<string, unknown> | null>(null);
  const [realEstate, setRealEstate] = useState<Record<string, unknown> | null>(null);
  const [monthlyFinancials, setMonthlyFinancials] = useState<MonthlyFinancialRecord[]>([]);
  const [activeLoans, setActiveLoans] = useState<
    { monthly_payment?: number | null; current_balance?: number | null }[]
  >([]);
  const [utilityRatio, setUtilityRatio] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedStore?.id) {
      setStore(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(false);

    try {
      const [
        { data: storeData, error: storeError },
        { data: equipmentData, error: equipError },
        { data: financialsData, error: finError },
        { data: leaseData, error: leaseError },
        { data: realEstateData, error: realEstateError },
        { data: loansData, error: loansError },
      ] = await Promise.all([
        supabase.from("stores").select("*").eq("id", selectedStore.id).single(),
        supabase.from("equipment_inventory").select("*").eq("store_id", selectedStore.id),
        supabase
          .from("monthly_financials")
          .select("*")
          .eq("store_id", selectedStore.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .limit(12),
        supabase
          .from("leases")
          .select("lease_end_date, monthly_rent, square_footage")
          .eq("store_id", selectedStore.id)
          .maybeSingle(),
        supabase
          .from("real_estate")
          .select("monthly_rent_charged, laundromat_square_footage, total_square_footage")
          .eq("store_id", selectedStore.id)
          .maybeSingle(),
        supabase
          .from("store_loans")
          .select("monthly_payment, current_balance, is_active")
          .eq("store_id", selectedStore.id)
          .eq("is_active", true),
      ]);

      if (storeError) throw storeError;
      if (equipError) throw equipError;
      if (finError) throw finError;
      if (leaseError) throw leaseError;
      if (realEstateError) throw realEstateError;
      if (loansError) throw loansError;

      setStore(storeData);
      setEquipment((equipmentData ?? []) as EquipmentRecord[]);
      setLease(leaseData ?? null);
      setRealEstate(realEstateData ?? null);
      setMonthlyFinancials((financialsData ?? []) as MonthlyFinancialRecord[]);
      setActiveLoans(loansData ?? []);

      const records = enrichMonthlyRecords(sortRecordsDesc((financialsData ?? []) as MonthlyFinancialRecord[]));
      const ttm = calcTtmMetrics(records);
      if (ttm.ttmRevenue > 0 && ttm.monthsUsed > 0) {
        const ttmUtilities = records.slice(0, 12).reduce((s, r) => s + (r.utilities ?? 0), 0);
        setUtilityRatio((ttmUtilities / ttm.ttmRevenue) * 100);
      } else {
        setUtilityRatio(null);
      }
    } catch {
      setLoadError(true);
      setStore(null);
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id, supabase]);

  useEffect(() => {
    if (storesLoading) return;
    loadData();
  }, [storesLoading, loadData]);

  const metrics = useMemo(() => {
    if (!store) return null;

    const records = enrichMonthlyRecords(sortRecordsDesc(monthlyFinancials));
    const ttm = calcTtmMetrics(records);
    const hasFinancials = ttm.monthsUsed > 0 && ttm.ttmRevenue > 0;

    if (!hasFinancials) {
      return {
        ebitdaMargin: null,
        revenuePerSF: null,
        utilityRatio: null,
        rentToRevenue: null,
        dscr: null,
        revenuePerMachine: null,
        avgEquipmentAge: null,
        storeName: String(store.name ?? "Your Store"),
        hasFinancials: false,
      };
    }

    const monthsUsed = ttm.monthsUsed;
    const monthlyRevenue = ttm.ttmRevenue / monthsUsed;
    const monthlyEbitda = ttm.ttmEbitda / monthsUsed;
    const annualRevenue = ttm.ttmRevenue;
    const annualEbitda = ttm.ttmEbitda;

    const sqft = resolveSquareFootage(store, lease, realEstate);
    const equipResolved = resolveEquipmentFromInventory(equipment);
    const machines = equipResolved.totalMachines;
    const avgAge = equipResolved.weightedAvgAge;

    const debt = resolveDebtFromLoans(activeLoans);
    const ttmRent = records.slice(0, 12).reduce((s, r) => s + (r.rent ?? 0), 0);
    const annualRent = ttmRent > 0 ? ttmRent : 0;

    const ebitdaMargin = monthlyRevenue > 0 ? (monthlyEbitda / monthlyRevenue) * 100 : null;
    const revenuePerSF = sqft != null && sqft > 0 ? annualRevenue / sqft : null;
    const dscr =
      debt.annualDebtService > 0 && annualEbitda > 0 ? annualEbitda / debt.annualDebtService : null;
    const revenuePerMachine = machines > 0 ? annualRevenue / machines : null;
    const rentToRevenue = annualRevenue > 0 && annualRent > 0 ? (annualRent / annualRevenue) * 100 : null;

    return {
      ebitdaMargin,
      revenuePerSF,
      utilityRatio: utilityRatio,
      rentToRevenue,
      dscr,
      revenuePerMachine,
      avgEquipmentAge: avgAge,
      storeName: String(store.name ?? "Your Store"),
      hasFinancials: true,
    };
  }, [store, equipment, lease, realEstate, monthlyFinancials, activeLoans, utilityRatio]);

  const rows: BenchmarkRowData[] = useMemo(() => {
    if (!metrics) return [];
    const map: Record<string, number | null> = {
      "EBITDA Margin": metrics.ebitdaMargin,
      "Revenue per SF": metrics.revenuePerSF,
      "Utility Ratio": metrics.utilityRatio,
      "Rent to Revenue": metrics.rentToRevenue,
      DSCR: metrics.dscr,
      "Revenue per Machine": metrics.revenuePerMachine,
      "Avg Equipment Age": metrics.avgEquipmentAge,
    };

    return industryBenchmarks.map((b) => ({
      metric: b.metric,
      store: map[b.metric] ?? null,
      unit: b.unit,
      median: b.median,
      top25: b.top25,
      bottom25: b.bottom25,
      lowerIsBetter: b.lowerIsBetter,
    }));
  }, [metrics]);

  const summary = useMemo(() => {
    const withData = rows.filter((r) => r.store != null);
    const aboveMedian = withData.filter((r) =>
      r.lowerIsBetter ? (r.store as number) <= r.median : (r.store as number) >= r.median
    ).length;
    const topQuartile = withData.filter((r) =>
      r.lowerIsBetter ? (r.store as number) <= r.top25 : (r.store as number) >= r.top25
    ).length;
    const dscr = metrics?.dscr;
    const financeRating =
      dscr != null && dscr >= 1.5 ? "Strong" : dscr != null && dscr >= 1.25 ? "Acceptable" : dscr != null ? "Marginal" : "—";
    const performanceRating =
      withData.length === 0
        ? "—"
        : topQuartile >= 4
          ? "Top 25%"
          : aboveMedian >= 4
            ? "Above Median"
            : aboveMedian >= 2
              ? "Average"
              : "Below Median";

    return { aboveMedian, total: withData.length, financeRating, performanceRating };
  }, [rows, metrics]);

  const callouts = useMemo(() => {
    if (!metrics) return { strengths: [], watch: [], opportunities: [] };
    const strengths: string[] = [];
    const watch: string[] = [];
    const opportunities: string[] = [];

    if (metrics.dscr != null && metrics.dscr >= 2) strengths.push(`DSCR ${fmtMultiple(metrics.dscr)} — top quartile`);
    if (metrics.revenuePerSF != null && metrics.revenuePerSF >= 180)
      strengths.push(`Revenue/SF $${Math.round(metrics.revenuePerSF)} — top 30%`);
    if (metrics.ebitdaMargin != null && metrics.ebitdaMargin >= 28)
      strengths.push(`EBITDA margin ${fmtPct(metrics.ebitdaMargin)}`);
    if (metrics.avgEquipmentAge != null && metrics.avgEquipmentAge < 8)
      strengths.push(`Equipment age ${metrics.avgEquipmentAge.toFixed(1)}yr`);

    if (metrics.utilityRatio != null && metrics.utilityRatio >= 17)
      watch.push(`Utility ratio ${fmtPct(metrics.utilityRatio)} — near median`);
    if (metrics.revenuePerMachine != null && metrics.revenuePerMachine < 12000)
      watch.push("Revenue per machine could be higher");

    if (metrics.utilityRatio != null && metrics.utilityRatio >= 15)
      opportunities.push("→ Reduce utility ratio to sub-15%");
    opportunities.push("→ Add WDF to boost Rev/machine");
    opportunities.push("→ Launch P&D to reach top 10%");

    return { strengths, watch, opportunities };
  }, [metrics]);

  const laundroCfoScoreResult = useMemo(() => {
    if (!store) return null;
    return computeLaundroCfoScoreFromRaw({
      store,
      equipment,
      lease,
      realEstate,
      monthlyFinancials,
      monthlyUtilities: [],
    });
  }, [store, equipment, lease, realEstate, monthlyFinancials]);

  if (storesLoading || loading) {
    return (
      <div className="space-y-5">
        <CardSkeleton />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <CardSkeleton />
      </div>
    );
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (stores.length === 0 || isAllStores || !selectedStore) {
    return (
      <div className="card overflow-hidden min-w-0 text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Add store financials to see benchmarks
        </p>
      </div>
    );
  }

  const hasFinancials = metrics?.hasFinancials === true;
  const storeName = metrics?.storeName ?? String(selectedStore.name ?? "Your Store");
  const optedIn = selectedStore.network_benchmark_opt_in === true;

  return (
    <div className="space-y-5">
      {hasFinancials && metrics ? (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-[15px] font-semibold text-slate-100">
              Industry Benchmarking{" "}
              <span className="text-[12px] text-slate-500 font-normal ml-2">
                {storeName} — vs. U.S. 2024 Data
              </span>
            </h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">
            {laundroCfoScoreResult ? (
              <LaundroCfoScoreCard result={laundroCfoScoreResult} compact className="h-full" />
            ) : null}
            <div
              className={`grid grid-cols-1 sm:grid-cols-3 sm:grid-rows-2 gap-4 h-full min-h-0 ${laundroCfoScoreResult ? "lg:col-span-3" : "lg:col-span-4"}`}
            >
              <div className="card overflow-hidden min-w-0 border-green-500/20 h-full">
                <div className="text-[12px] text-green-400 font-semibold mb-2">💪 Strengths</div>
                <div className="space-y-1.5 text-[12px] text-slate-400">
                  {callouts.strengths.length > 0 ? (
                    callouts.strengths.map((s) => <div key={s}>✅ {s}</div>)
                  ) : (
                    <div>No standout strengths yet — keep building data.</div>
                  )}
                </div>
              </div>
              <div className="card overflow-hidden min-w-0 border-amber-500/20 h-full">
                <div className="text-[12px] text-amber-400 font-semibold mb-2">⚠️ Watch</div>
                <div className="space-y-1.5 text-[12px] text-slate-400">
                  {callouts.watch.length > 0 ? (
                    callouts.watch.map((s) => <div key={s}>⚠ {s}</div>)
                  ) : (
                    <div>No metrics in watch range.</div>
                  )}
                </div>
              </div>
              <div className="card overflow-hidden min-w-0 border-blue-500/20 h-full">
                <div className="text-[12px] text-blue-400 font-semibold mb-2">🎯 Opportunities</div>
                <div className="space-y-1.5 text-[12px] text-slate-400">
                  {callouts.opportunities.map((s) => (
                    <div key={s}>{s}</div>
                  ))}
                </div>
              </div>
              <div className="card overflow-hidden min-w-0 h-full">
                <div className="metric-label">Performance Rating</div>
                <div className="metric-value text-green-400">{summary.performanceRating}</div>
                <div className="text-[12px] text-slate-500 mt-1">vs. laundromats nationally</div>
              </div>
              <div className="card overflow-hidden min-w-0 h-full">
                <div className="metric-label">Metrics Above Median</div>
                <div className="metric-value">
                  {summary.aboveMedian} / {summary.total}
                </div>
                <div className="text-[12px] text-slate-500 mt-1">
                  {summary.total > 0
                    ? `${Math.round((summary.aboveMedian / summary.total) * 100)}% of tracked metrics`
                    : "—"}
                </div>
              </div>
              <div className="card overflow-hidden min-w-0 h-full">
                <div className="metric-label">Financeability Rating</div>
                <div className="metric-value text-green-400">{summary.financeRating}</div>
                <div className="text-[12px] text-slate-500 mt-1">Based on live DSCR</div>
              </div>
            </div>
          </div>

          <ScoresCalculationGuide />

          <div className="card overflow-hidden min-w-0">
            <div className="section-title">
              Store vs. Industry Benchmarks
              <span className="text-[11px] text-slate-600 font-normal ml-auto">
                White bar = {storeName} position
              </span>
            </div>
            {rows.map((b) => (
              <BenchmarkRow key={b.metric} {...b} storeLabel={storeName} />
            ))}
            <div className="text-[11px] text-slate-600 mt-4 pt-3 border-t border-white/[0.05]">
              Industry benchmark data sourced from Coin Laundry Association, LaundroCFO peer database (2024).
              Utility ratio uses trailing 12-month P&amp;L when available.
            </div>
          </div>
        </>
      ) : (
        <div className="card overflow-hidden min-w-0 text-center py-10">
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            Insufficient data — enter at least one month of P&amp;L in{" "}
            <Link href="/financials" className="text-blue-400 hover:underline">
              Financials
            </Link>{" "}
            to see benchmarks.
          </p>
        </div>
      )}

      <NetworkBenchmarksSection optedIn={optedIn} />
    </div>
  );
}
