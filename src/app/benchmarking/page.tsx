"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { benchmarks as industryBenchmarks } from "@/lib/data";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import {
  applyLoanDebtServiceToTtm,
  calcRatios,
  calcTtmMetrics,
  enrichMonthlyRecords,
  fetchAnnualDebtServiceByStore,
  fetchMonthlyFinancialsForStores,
  fetchStoreMonthlyFinancials,
  sortRecordsDesc,
  type CalculatedMonthly,
  type MonthlyFinancialRecord,
  type StoreFinancialProfile,
} from "@/lib/financials";
import { fmtMultiple, fmtPct } from "@/lib/calculations";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { PageError } from "@/components/ui/PageError";

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
        <div className="text-[13px] text-gray-700 dark:text-slate-400 w-44 flex-shrink-0">{metric}</div>
        <div className="flex-1 text-[12px] text-gray-700 dark:text-slate-600 italic">Add data to see this metric</div>
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
      <div className="text-[13px] text-gray-700 dark:text-slate-400 w-44 flex-shrink-0">{metric}</div>
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
        <div className="flex justify-between text-[10px] text-gray-700 dark:text-slate-600 mt-1">
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

export default function BenchmarkingPage() {
  const supabase = createClient();
  const { selectedStore, isAllStores, stores, loading: storesLoading } = useStores();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [store, setStore] = useState<StoreFinancialProfile | null>(null);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [records, setRecords] = useState<CalculatedMonthly[]>([]);
  const [annualDebtService, setAnnualDebtService] = useState(0);

  const loadData = useCallback(async () => {
    if (!selectedStore?.id) {
      setStore(null);
      setRecords([]);
      setAnnualDebtService(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [
        { data: storeData, error: storeError },
        financialsData,
        { data: equipmentData, error: equipError },
        debtByStore,
      ] = await Promise.all([
        supabase.from("stores").select("*").eq("id", selectedStore.id).single(),
        fetchStoreMonthlyFinancials(supabase, selectedStore.id),
        supabase.from("equipment_inventory").select("*").eq("store_id", selectedStore.id),
        fetchAnnualDebtServiceByStore(supabase, [selectedStore.id]),
      ]);

      const errors = [storeError, equipError].filter(Boolean).map((e) => e!.message);
      if (errors.length > 0) {
        console.warn("[benchmarking] load warnings:", errors.join(" · "));
      }

      setStore(storeData as StoreFinancialProfile);
      setEquipment((equipmentData ?? []) as EquipmentRecord[]);
      setAnnualDebtService(debtByStore[selectedStore.id] ?? 0);

      const sorted = enrichMonthlyRecords(
        sortRecordsDesc(financialsData as MonthlyFinancialRecord[])
      );
      setRecords(sorted);
    } catch {
      setLoadError(true);
      setStore(null);
      setRecords([]);
      setAnnualDebtService(0);
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id, supabase]);

  useEffect(() => {
    if (storesLoading) return;
    loadData();
  }, [storesLoading, loadData]);

  const ttm = useMemo(
    () => applyLoanDebtServiceToTtm(calcTtmMetrics(records), annualDebtService),
    [records, annualDebtService]
  );

  const metrics = useMemo(() => {
    if (!store || records.length === 0) return null;

    const ratios = calcRatios(store, records, ttm);
    const equipMetrics = computeEquipmentMetrics(equipment);
    const avgAge =
      equipMetrics.totalMachines > 0
        ? equipMetrics.weightedAvgAge
        : Number((store as Record<string, unknown>).avg_machine_age) || null;

    const dscr = ttm.ttmDebtService > 0 ? ttm.dscr : null;

    return {
      ebitdaMargin: ttm.ttmEbitdaMargin,
      revenuePerSF: ratios.revenuePerSF > 0 ? ratios.revenuePerSF : null,
      utilityRatio: ratios.utilityPct > 0 ? ratios.utilityPct : null,
      rentToRevenue: ratios.rentPct > 0 ? ratios.rentPct : null,
      dscr,
      revenuePerMachine: ratios.revenuePerMachine > 0 ? ratios.revenuePerMachine : null,
      avgEquipmentAge: avgAge,
      storeName: String(store.name ?? "Your Store"),
      hasFinancials: true,
    };
  }, [store, equipment, records, ttm]);

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

  if (records.length === 0 || !metrics) {
    return (
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Add store financials to see benchmarks
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-slate-100">
          Industry Benchmarking{" "}
          <span className="text-[12px] text-gray-700 dark:text-slate-500 font-normal ml-2">
            {metrics.storeName} — vs. U.S. 2024 Data
          </span>
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="metric-label">Performance Rating</div>
          <div className="metric-value text-green-400">{summary.performanceRating}</div>
          <div className="text-[12px] text-gray-700 dark:text-slate-500 mt-1">vs. laundromats nationally</div>
        </div>
        <div className="card">
          <div className="metric-label">Metrics Above Median</div>
          <div className="metric-value">
            {summary.aboveMedian} / {summary.total}
          </div>
          <div className="text-[12px] text-gray-700 dark:text-slate-500 mt-1">
            {summary.total > 0 ? `${Math.round((summary.aboveMedian / summary.total) * 100)}% of tracked metrics` : "—"}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Financeability Rating</div>
          <div className="metric-value text-green-400">{summary.financeRating}</div>
          <div className="text-[12px] text-gray-700 dark:text-slate-500 mt-1">Based on live DSCR</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          Store vs. Industry Benchmarks
          <span className="text-[11px] text-gray-700 dark:text-slate-600 font-normal ml-auto">
            White bar = {metrics.storeName} position
          </span>
        </div>
        {rows.map((b) => (
          <BenchmarkRow key={b.metric} {...b} storeLabel={metrics.storeName} />
        ))}
        <div className="text-[11px] text-gray-700 dark:text-slate-600 mt-4 pt-3 border-t border-white/[0.05]">
          Industry benchmark data sourced from Coin Laundry Association, LaundroCFO peer database (2024).
          Utility ratio uses trailing 12-month P&amp;L when available.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card border-green-500/20">
          <div className="text-[12px] text-green-400 font-semibold mb-2">Strengths</div>
          <div className="space-y-1.5 text-[12px] text-gray-700 dark:text-slate-400">
            {callouts.strengths.length > 0 ? (
              callouts.strengths.map((s) => <div key={s}>{s}</div>)
            ) : (
              <div>No standout strengths yet — keep building data.</div>
            )}
          </div>
        </div>
        <div className="card border-amber-500/20">
          <div className="text-[12px] text-amber-400 font-semibold mb-2">Watch</div>
          <div className="space-y-1.5 text-[12px] text-gray-700 dark:text-slate-400">
            {callouts.watch.length > 0 ? (
              callouts.watch.map((s) => <div key={s}>{s}</div>)
            ) : (
              <div>No metrics in watch range.</div>
            )}
          </div>
        </div>
        <div className="card border-blue-500/20">
          <div className="text-[12px] text-blue-400 font-semibold mb-2">Opportunities</div>
          <div className="space-y-1.5 text-[12px] text-gray-700 dark:text-slate-400">
            {callouts.opportunities.map((s) => (
              <div key={s}>{s}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
