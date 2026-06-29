"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
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
  fetchStoreMonthlyFinancials,
  sortRecordsDesc,
  type CalculatedMonthly,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
  type StoreFinancialProfile,
} from "@/lib/financials";
import {
  computeLaundroCfoScoreFromRaw,
  scoreToLetterGrade,
  type LaundroCfoScoreResult,
} from "@/lib/laundroCfoScore";
import { fmtPct } from "@/lib/calculations";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { PageError } from "@/components/ui/PageError";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";
import {
  DashboardDial,
  zoneLetterGrade,
  type ColorZone,
  type LetterGrade,
} from "@/components/ui/DashboardDial";

/* ─── Types & helpers ─── */

type BenchmarkRowData = {
  metric: string;
  store: number | null;
  unit: string;
  median: number;
  top25: number;
  bottom25: number;
  lowerIsBetter: boolean;
};

const GRADE_COLORS: Record<LetterGrade, { bg: string; text: string; darkBg: string }> = {
  A: { bg: "bg-emerald-500", text: "text-white", darkBg: "dark:bg-emerald-400" },
  B: { bg: "bg-blue-500", text: "text-white", darkBg: "dark:bg-blue-400" },
  C: { bg: "bg-amber-500", text: "text-white", darkBg: "dark:bg-amber-400" },
  D: { bg: "bg-red-500", text: "text-white", darkBg: "dark:bg-red-400" },
};

const GRADE_NUMERIC: Record<LetterGrade, number> = { A: 4, B: 3, C: 2, D: 1 };

function benchmarkLetterGrade(
  store: number,
  median: number,
  top25: number,
  bottom25: number,
  lowerIsBetter: boolean
): LetterGrade {
  if (lowerIsBetter) {
    if (store <= top25) return "A";
    if (store <= median) return "B";
    if (store <= bottom25) return "C";
    return "D";
  }
  if (store >= top25) return "A";
  if (store >= median) return "B";
  if (store >= bottom25) return "C";
  return "D";
}

function averageGrades(grades: LetterGrade[]): string {
  if (grades.length === 0) return "—";
  const avg = grades.reduce((s, g) => s + GRADE_NUMERIC[g], 0) / grades.length;
  return scoreToLetterGrade((avg / 4) * 100);
}

function fmtBenchmarkVal(v: number, unit: string): string {
  if (unit === "$") return `$${Math.round(v).toLocaleString()}`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "yr") return `${v.toFixed(1)}yr`;
  return `${v.toFixed(1)}${unit}`;
}

/* ─── Sliding Scale Track ─── */

type SlidingScaleProps = BenchmarkRowData & {
  animated?: boolean;
};

function SlidingScale({
  metric,
  store,
  unit,
  median,
  top25,
  bottom25,
  lowerIsBetter,
}: SlidingScaleProps) {
  const hasData = store != null;
  const min = lowerIsBetter ? top25 : bottom25;
  const max = lowerIsBetter ? bottom25 : top25;
  const pct = !hasData ? 0 : max === min ? 50 : Math.min(100, Math.max(0, ((store - min) / (max - min)) * 100));

  const [dotPct, setDotPct] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(false);
    setDotPct(0);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMounted(true);
        setDotPct(pct);
      });
    });
    return () => cancelAnimationFrame(t);
  }, [pct]);

  const grade = hasData ? benchmarkLetterGrade(store, median, top25, bottom25, lowerIsBetter) : null;
  const zoneColor = hasData
    ? grade === "A"
      ? { color: "#22c55e", glow: "rgba(34,197,94,0.55)" }
      : grade === "B"
        ? { color: "#3b82f6", glow: "rgba(59,130,246,0.55)" }
        : grade === "C"
          ? { color: "#f59e0b", glow: "rgba(245,158,11,0.55)" }
          : { color: "#ef4444", glow: "rgba(239,68,68,0.55)" }
    : { color: "#94a3b8", glow: "rgba(148,163,184,0.3)" };

  const gradient = lowerIsBetter
    ? "linear-gradient(90deg, #22c55e 0%, #f59e0b 50%, #ef4444 100%)"
    : "linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)";

  const fmtVal = (v: number) => fmtBenchmarkVal(v, unit);
  const worstVal = lowerIsBetter ? top25 : bottom25;
  const bestVal = lowerIsBetter ? bottom25 : top25;

  return (
    <div
      className={clsx(
        "rounded-xl border p-4",
        "bg-white border-slate-200",
        "dark:bg-[#111827] dark:border-slate-700/60",
        !hasData && "opacity-60"
      )}
    >
      <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-3">{metric}</div>

      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="relative pt-7 pb-6">
            {/* Floating value label */}
            {hasData && (
              <div
                className="absolute top-0 -translate-x-1/2 transition-all duration-[1200ms] ease-[cubic-bezier(0.34,1.2,0.64,1)]"
                style={{ left: `${mounted ? dotPct : 0}%` }}
              >
                <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-800 text-white dark:bg-white dark:text-slate-900 whitespace-nowrap">
                  {fmtVal(store)}
                </span>
              </div>
            )}

            {/* Track */}
            <div
              className="h-3 rounded-full relative overflow-visible"
              style={{
                background: hasData ? gradient : "#e2e8f0",
                opacity: hasData ? 1 : 0.4,
              }}
            >
              {/* Median tick */}
              <div
                className="absolute top-[-2px] w-0.5 h-[calc(100%+4px)] bg-slate-400/60 dark:bg-slate-500/60"
                style={{
                  left: `${max === min ? 50 : ((median - min) / (max - min)) * 100}%`,
                  transform: "translateX(-50%)",
                }}
              />
            </div>

            {/* Dot marker */}
            {hasData ? (
              <div
                className="absolute top-[26px] w-4 h-4 rounded-full -translate-x-1/2 bg-slate-800 dark:bg-white transition-all duration-[1200ms] ease-[cubic-bezier(0.34,1.2,0.64,1)] animate-pulse"
                style={{
                  left: `${mounted ? dotPct : 0}%`,
                  boxShadow: `0 0 8px 2px ${zoneColor.glow}, 0 0 16px 4px ${zoneColor.glow}`,
                }}
              />
            ) : (
              <div className="absolute top-[26px] left-0 text-[12px] text-slate-400 dark:text-slate-500 italic">
                Add data
              </div>
            )}

            {/* Tick labels */}
            <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-3">
              <span>Worst 25% — {fmtVal(worstVal)}</span>
              <span>Median — {fmtVal(median)}</span>
              <span>Best 25% — {fmtVal(bestVal)}</span>
            </div>
          </div>
        </div>

        {/* Grade + value column */}
        <div className="flex flex-col items-end gap-2 shrink-0 w-[88px]">
          {grade && (
            <div
              className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold",
                GRADE_COLORS[grade].bg,
                GRADE_COLORS[grade].darkBg,
                GRADE_COLORS[grade].text
              )}
            >
              {grade}
            </div>
          )}
          <div
            className={clsx(
              "text-[18px] font-bold tabular-nums text-right leading-tight",
              hasData ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-600"
            )}
          >
            {hasData ? fmtVal(store) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */

export default function BenchmarkingPage() {
  return (
    <DesktopOnlyGate featureName="Benchmarking">
      <BenchmarkingPageContent />
    </DesktopOnlyGate>
  );
}

function BenchmarkingPageContent() {
  const supabase = createClient();
  const { selectedStore, isAllStores, stores, loading: storesLoading } = useStores();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [store, setStore] = useState<StoreFinancialProfile | null>(null);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [records, setRecords] = useState<CalculatedMonthly[]>([]);
  const [annualDebtService, setAnnualDebtService] = useState(0);
  const [lease, setLease] = useState<Record<string, unknown> | null>(null);
  const [realEstate, setRealEstate] = useState<Record<string, unknown> | null>(null);
  const [monthlyUtilities, setMonthlyUtilities] = useState<MonthlyUtilityRecord[]>([]);
  const [laundroScore, setLaundroScore] = useState<LaundroCfoScoreResult | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedStore?.id) {
      setStore(null);
      setRecords([]);
      setAnnualDebtService(0);
      setLease(null);
      setRealEstate(null);
      setMonthlyUtilities([]);
      setLaundroScore(null);
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
        { data: leaseData },
        { data: reData },
        { data: utilitiesData },
      ] = await Promise.all([
        supabase.from("stores").select("*").eq("id", selectedStore.id).single(),
        fetchStoreMonthlyFinancials(supabase, selectedStore.id),
        supabase.from("equipment_inventory").select("*").eq("store_id", selectedStore.id),
        fetchAnnualDebtServiceByStore(supabase, [selectedStore.id]),
        supabase.from("leases").select("*").eq("store_id", selectedStore.id).maybeSingle(),
        supabase.from("real_estate").select("*").eq("store_id", selectedStore.id).maybeSingle(),
        supabase.from("monthly_utilities").select("*").eq("store_id", selectedStore.id),
      ]);

      const errors = [storeError, equipError].filter(Boolean).map((e) => e!.message);
      if (errors.length > 0) {
        console.warn("[benchmarking] load warnings:", errors.join(" · "));
      }

      const storeProfile = storeData as StoreFinancialProfile;
      const equip = (equipmentData ?? []) as EquipmentRecord[];
      const debt = debtByStore[selectedStore.id] ?? 0;
      const sorted = enrichMonthlyRecords(
        sortRecordsDesc(financialsData as MonthlyFinancialRecord[])
      );

      setStore(storeProfile);
      setEquipment(equip);
      setAnnualDebtService(debt);
      setRecords(sorted);
      setLease(leaseData as Record<string, unknown> | null);
      setRealEstate(reData as Record<string, unknown> | null);
      setMonthlyUtilities((utilitiesData ?? []) as MonthlyUtilityRecord[]);

      const ttm = applyLoanDebtServiceToTtm(calcTtmMetrics(sorted), debt);
      const scoreResult = computeLaundroCfoScoreFromRaw({
        store: { ...storeProfile, annual_debt_service: debt },
        equipment: equip,
        lease: leaseData as Record<string, unknown> | null,
        realEstate: reData as Record<string, unknown> | null,
        monthlyFinancials: sorted.map((r) => ({ revenue: r.revenue, utilities: r.utilities })),
        monthlyUtilities: (utilitiesData ?? []) as MonthlyUtilityRecord[],
        ttmMonthsUsed: ttm.monthsUsed,
      });
      setLaundroScore(scoreResult);
    } catch {
      setLoadError(true);
      setStore(null);
      setRecords([]);
      setAnnualDebtService(0);
      setLaundroScore(null);
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
    if (!store) return null;

    const ratios = records.length > 0 ? calcRatios(store, records, ttm) : null;
    const equipMetrics = computeEquipmentMetrics(equipment);
    const avgAge =
      equipMetrics.totalMachines > 0
        ? equipMetrics.weightedAvgAge
        : Number((store as Record<string, unknown>).avg_machine_age) || null;

    const dscr = ttm.ttmDebtService > 0 ? ttm.dscr : null;

    return {
      ebitdaMargin: records.length > 0 ? ttm.ttmEbitdaMargin : null,
      revenuePerSF: ratios && ratios.revenuePerSF > 0 ? ratios.revenuePerSF : null,
      utilityRatio: ratios && ratios.utilityPct > 0 ? ratios.utilityPct : null,
      rentToRevenue: ratios && ratios.rentPct > 0 ? ratios.rentPct : null,
      dscr,
      revenuePerMachine: ratios && ratios.revenuePerMachine > 0 ? ratios.revenuePerMachine : null,
      avgEquipmentAge: avgAge,
      storeName: String(store.name ?? "Your Store"),
      hasFinancials: records.length > 0,
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

  const lastUpdated = useMemo(() => {
    if (records.length === 0) return null;
    const latest = records[0];
    const d = new Date(latest.year, latest.month - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [records]);

  const dialBenchmarks = useMemo(() => {
    const ebitda = industryBenchmarks.find((b) => b.metric === "EBITDA Margin")!;
    const dscr = industryBenchmarks.find((b) => b.metric === "DSCR")!;
    return { ebitda, dscr };
  }, []);

  const scaleMetrics = useMemo(
    () =>
      rows.filter((r) =>
        ["Revenue per SF", "Revenue per Machine", "Utility Ratio", "Avg Equipment Age", "Rent to Revenue"].includes(
          r.metric
        )
      ),
    [rows]
  );

  const allGrades = useMemo((): LetterGrade[] => {
    const grades: LetterGrade[] = [];

    if (metrics?.ebitdaMargin != null) {
      grades.push(zoneLetterGrade(metrics.ebitdaMargin, 15, 22, 40));
    }
    if (metrics?.dscr != null) {
      grades.push(zoneLetterGrade(metrics.dscr, 1.25, 1.5, 3));
    }
    if (laundroScore) {
      grades.push(zoneLetterGrade(laundroScore.total, 50, 70, 100));
    }
    for (const r of scaleMetrics) {
      if (r.store != null) {
        grades.push(benchmarkLetterGrade(r.store, r.median, r.top25, r.bottom25, r.lowerIsBetter));
      }
    }
    return grades;
  }, [metrics, laundroScore, scaleMetrics]);

  const overallGrade = averageGrades(allGrades);

  /* Dial zone definitions */
  const ebitdaZones: ColorZone[] = [
    { start: 0, end: 15, color: "#ef4444", darkGlow: "rgba(239,68,68,0.6)" },
    { start: 15, end: 22, color: "#f59e0b", darkGlow: "rgba(245,158,11,0.6)" },
    { start: 22, end: 40, color: "#22c55e", darkGlow: "rgba(34,197,94,0.6)" },
  ];

  const dscrZones: ColorZone[] = [
    { start: 0, end: 1.25, color: "#ef4444", darkGlow: "rgba(239,68,68,0.6)" },
    { start: 1.25, end: 1.5, color: "#f59e0b", darkGlow: "rgba(245,158,11,0.6)" },
    { start: 1.5, end: 3, color: "#22c55e", darkGlow: "rgba(34,197,94,0.6)" },
  ];

  const scoreZones: ColorZone[] = [
    { start: 0, end: 50, color: "#ef4444", darkGlow: "rgba(239,68,68,0.6)" },
    { start: 50, end: 70, color: "#f59e0b", darkGlow: "rgba(245,158,11,0.6)" },
    { start: 70, end: 100, color: "#22c55e", darkGlow: "rgba(34,197,94,0.6)" },
  ];

  if (storesLoading || loading) {
    return <LoadingSkeleton variant="metric" />;
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (stores.length === 0 || isAllStores || !selectedStore) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-center py-10">
        <p className="text-[14px] text-slate-500 dark:text-slate-400">Select a store to see benchmarks</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-full -m-4 sm:-m-6 p-4 sm:p-6 space-y-6"
      style={{ background: "var(--benchmark-bg, #f4f6f9)" }}
    >
      <style>{`
        .dark [data-benchmark-page] { --benchmark-bg: #0a0f1a; }
        [data-benchmark-page] { --benchmark-bg: #f4f6f9; }
      `}</style>
      <div data-benchmark-page className="space-y-6" style={{ background: "var(--benchmark-bg)" }}>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight">
              Store vs Industry Benchmarks
            </h1>
            {lastUpdated && (
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                Last updated: {lastUpdated}
                {metrics?.storeName ? ` · ${metrics.storeName}` : ""}
              </p>
            )}
            {!lastUpdated && metrics?.storeName && (
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">{metrics.storeName}</p>
            )}
          </div>
          {allGrades.length > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Overall
              </span>
              <div className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white/10 border border-slate-700/50 dark:border-white/10">
                <span className="text-[28px] font-bold text-white dark:text-white leading-none tabular-nums">
                  {overallGrade}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Section 1 — Dashboard Dials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DashboardDial
            label="EBITDA Margin"
            value={metrics?.ebitdaMargin ?? null}
            displayValue={metrics?.ebitdaMargin != null ? fmtPct(metrics.ebitdaMargin) : "—"}
            min={0}
            max={40}
            zones={ebitdaZones}
            grade={metrics?.ebitdaMargin != null ? zoneLetterGrade(metrics.ebitdaMargin, 15, 22, 40) : null}
            redEnd={15}
            yellowEnd={22}
            worstLabel={`Worst — ${fmtBenchmarkVal(dialBenchmarks.ebitda.bottom25, "%")}`}
            medianLabel={`Median — ${fmtBenchmarkVal(dialBenchmarks.ebitda.median, "%")}`}
            bestLabel={`Best — ${fmtBenchmarkVal(dialBenchmarks.ebitda.top25, "%")}`}
          />
          <DashboardDial
            label="DSCR"
            value={metrics?.dscr ?? null}
            displayValue={metrics?.dscr != null ? `${metrics.dscr.toFixed(2)}x` : "—"}
            min={0}
            max={3}
            zones={dscrZones}
            grade={metrics?.dscr != null ? zoneLetterGrade(metrics.dscr, 1.25, 1.5, 3) : null}
            redEnd={1.25}
            yellowEnd={1.5}
            worstLabel={`Worst — ${fmtBenchmarkVal(dialBenchmarks.dscr.bottom25, "x")}`}
            medianLabel={`Median — ${fmtBenchmarkVal(dialBenchmarks.dscr.median, "x")}`}
            bestLabel={`Best — ${fmtBenchmarkVal(dialBenchmarks.dscr.top25, "x")}`}
          />
          <DashboardDial
            label={<DisclaimerLabel>LaundroCFO Score</DisclaimerLabel>}
            value={laundroScore?.total ?? null}
            displayValue={laundroScore ? String(laundroScore.total) : "—"}
            min={0}
            max={100}
            zones={scoreZones}
            grade={
              laundroScore ? zoneLetterGrade(laundroScore.total, 50, 70, 100) : null
            }
            redEnd={50}
            yellowEnd={70}
            worstLabel="Worst — 0"
            medianLabel="Median — 65"
            bestLabel="Best — 90+"
          />
        </div>

        {/* Section 2 — Sliding Scales */}
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Detailed Metrics
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {scaleMetrics.map((row) => (
              <SlidingScale key={row.metric} {...row} />
            ))}
          </div>
        </div>

        {/* Footnote */}
        <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-700/50">
          Industry data sourced from Coin Laundry Association, LaundroCFO peer database (2024).
          Utility ratio uses trailing 12-month P&amp;L when available.
        </p>
      </div>
    </div>
  );
}
