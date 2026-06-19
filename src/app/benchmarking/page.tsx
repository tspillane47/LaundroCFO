"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { benchmarks as industryBenchmarks } from "@/lib/data";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { fmtMultiple, fmtPct } from "@/lib/calculations";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
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

      <div className="card">
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
      const [{ data: storeData, error: storeError }, { data: equipmentData, error: equipError }, { data: financialsData, error: finError }] =
        await Promise.all([
          supabase.from("stores").select("*").eq("id", selectedStore.id).single(),
          supabase.from("equipment_inventory").select("*").eq("store_id", selectedStore.id),
          supabase
            .from("monthly_financials")
            .select("revenue, utilities")
            .eq("store_id", selectedStore.id)
            .order("year", { ascending: false })
            .order("month", { ascending: false })
            .limit(12),
        ]);

      if (storeError) throw storeError;
      if (equipError) throw equipError;
      if (finError) throw finError;

      setStore(storeData);
      setEquipment((equipmentData ?? []) as EquipmentRecord[]);

      const records = financialsData ?? [];
      const ttmRevenue = records.reduce((s, r) => s + (r.revenue ?? 0), 0);
      const ttmUtilities = records.reduce((s, r) => s + (r.utilities ?? 0), 0);
      if (ttmRevenue > 0 && records.length > 0) {
        setUtilityRatio((ttmUtilities / ttmRevenue) * 100);
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

    const monthlyRevenue = Number(store.monthly_revenue) || 0;
    const monthlyExpenses = Number(store.monthly_expenses) || 0;
    const annualRevenue = monthlyRevenue * 12;
    const annualEbitda = (monthlyRevenue - monthlyExpenses) * 12;
    const sqft = Number(store.square_footage) || 0;
    const washers = Number(store.washers) || 0;
    const dryers = Number(store.dryers) || 0;
    const machines = washers + dryers;
    const debtService = Number(store.annual_debt_service) || 0;
    const monthlyRent = Number(store.monthly_rent) || 0;

    const equipMetrics = computeEquipmentMetrics(equipment);
    const avgAge =
      equipMetrics.totalMachines > 0
        ? equipMetrics.weightedAvgAge
        : Number(store.avg_machine_age) || null;

    const ebitdaMargin =
      monthlyRevenue > 0 ? ((monthlyRevenue - monthlyExpenses) / monthlyRevenue) * 100 : null;
    const revenuePerSF = sqft > 0 && monthlyRevenue > 0 ? annualRevenue / sqft : null;
    const dscr = debtService > 0 && annualEbitda > 0 ? annualEbitda / debtService : null;
    const revenuePerMachine = machines > 0 && monthlyRevenue > 0 ? annualRevenue / machines : null;
    const rentToRevenue = annualRevenue > 0 && monthlyRent > 0 ? ((monthlyRent * 12) / annualRevenue) * 100 : null;

    const utilityValue = utilityRatio ?? (monthlyRevenue > 0 ? 17.8 : null);

    return {
      ebitdaMargin,
      revenuePerSF,
      utilityRatio: utilityValue,
      rentToRevenue,
      dscr,
      revenuePerMachine,
      avgEquipmentAge: avgAge,
      storeName: String(store.name ?? "Your Store"),
      hasFinancials: monthlyRevenue > 0,
    };
  }, [store, equipment, utilityRatio]);

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
      <div className="card text-center py-10">
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card">
              <div className="metric-label">Performance Rating</div>
              <div className="metric-value text-green-400">{summary.performanceRating}</div>
              <div className="text-[12px] text-slate-500 mt-1">vs. laundromats nationally</div>
            </div>
            <div className="card">
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
            <div className="card">
              <div className="metric-label">Financeability Rating</div>
              <div className="metric-value text-green-400">{summary.financeRating}</div>
              <div className="text-[12px] text-slate-500 mt-1">Based on live DSCR</div>
            </div>
          </div>

          <div className="card">
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
        <div className="card text-center py-10">
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            Add store financials to see benchmarks
          </p>
        </div>
      )}

      <NetworkBenchmarksSection optedIn={optedIn} />

      {hasFinancials && metrics ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card border-green-500/20">
            <div className="text-[12px] text-green-400 font-semibold mb-2">💪 Strengths</div>
            <div className="space-y-1.5 text-[12px] text-slate-400">
              {callouts.strengths.length > 0 ? (
                callouts.strengths.map((s) => <div key={s}>✅ {s}</div>)
              ) : (
                <div>No standout strengths yet — keep building data.</div>
              )}
            </div>
          </div>
          <div className="card border-amber-500/20">
            <div className="text-[12px] text-amber-400 font-semibold mb-2">⚠️ Watch</div>
            <div className="space-y-1.5 text-[12px] text-slate-400">
              {callouts.watch.length > 0 ? (
                callouts.watch.map((s) => <div key={s}>⚠ {s}</div>)
              ) : (
                <div>No metrics in watch range.</div>
              )}
            </div>
          </div>
          <div className="card border-blue-500/20">
            <div className="text-[12px] text-blue-400 font-semibold mb-2">🎯 Opportunities</div>
            <div className="space-y-1.5 text-[12px] text-slate-400">
              {callouts.opportunities.map((s) => (
                <div key={s}>{s}</div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
