"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { fmtDollar, fmtPct } from "@/lib/calculations";
import {
  MONTH_NAMES,
  MONTH_SHORT,
  monthKey,
  sortRecordsDesc,
  enrichMonthlyRecords,
  buildUtilitiesLookup,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
  type UtilityImportField,
} from "@/lib/financials";
import {
  computeTurnsPerDay,
  DEFAULT_DRYER_REVENUE_PCT,
  type EquipmentRecord,
} from "@/lib/equipment";
import {
  computeEquipmentMetrics,
  getMostRecentUtility,
  totalUtilities,
  utilityPctOfRevenue,
  waterCostPerSF,
  waterCostPerTurn,
  waterCostPerWasher,
  type MonthlyUtilityRow,
} from "@/lib/utilities";
import { toNullableText, toNum } from "@/lib/formHelpers";
import { INPUT_CLASS, preventEnterSubmit } from "@/components/occupancy/shared";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { FormBanner } from "@/components/ui/FormBanner";
import { KpiCard } from "@/components/ui/KpiCard";
import { MetricTooltip } from "@/components/ui/MetricTooltip";
import { PageError } from "@/components/ui/PageError";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";

type StoreProfile = {
  id: string;
  name: string | null;
  square_footage: number | null;
  washers: number | null;
  monthly_revenue: number | null;
  avg_machine_age: number | null;
  dryer_revenue_pct: number | null;
};

type UtilityForm = {
  water: number;
  gas: number;
  electric: number;
  sewer: number;
  trash: number;
  internet: number;
  notes: string;
};

type EquipmentRow = EquipmentRecord;

const emptyForm = (): UtilityForm => ({
  water: 0,
  gas: 0,
  electric: 0,
  sewer: 0,
  trash: 0,
  internet: 0,
  notes: "",
});

function monthLabel(year: number, month: number) {
  return `${MONTH_SHORT[month - 1]} '${String(year).slice(-2)}`;
}

function benchmarkColor(value: number, low: number, high: number): string {
  if (value < low) return "text-green-400";
  if (value <= high) return "text-amber-400";
  return "text-red-400";
}

function fmtCostPerLoad(value: number | null): string {
  return value != null ? `$${value.toFixed(2)}/load` : "N/A";
}

function fmtLoadsPerMonth(value: number | null): string {
  return value != null ? Math.round(value).toLocaleString() : "N/A";
}

function costPerLoadBenchmark(value: number): { label: string; color: string } {
  if (value < 0.4) return { label: "Good", color: "text-green-400" };
  if (value <= 0.55) return { label: "Watch", color: "text-amber-400" };
  return { label: "High", color: "text-red-400" };
}

function sumTtmUtilityField(
  ttmRecords: { year: number; month: number }[],
  utilitiesLookup: Map<string, MonthlyUtilityRecord>,
  field: UtilityImportField
): number {
  return ttmRecords.reduce((sum, record) => {
    const utilityRecord = utilitiesLookup.get(monthKey(record.year, record.month));
    return sum + (utilityRecord?.[field] ?? 0);
  }, 0);
}

function ttmUtilityFieldHasData(
  ttmRecords: { year: number; month: number }[],
  utilitiesLookup: Map<string, MonthlyUtilityRecord>,
  field: UtilityImportField
): boolean {
  return ttmRecords.some((record) => {
    const utilityRecord = utilitiesLookup.get(monthKey(record.year, record.month));
    return utilityRecord != null && (utilityRecord[field] ?? 0) > 0;
  });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-card)] dark:bg-[#1e2a3a] border border-[var(--border)] dark:border-white/10 rounded-lg p-3 text-xs shadow-sm">
      <div className="text-[var(--text-secondary)] dark:text-slate-400 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-[var(--text-secondary)] dark:text-slate-300">{entry.name}:</span>
          <span className="text-[var(--text-primary)] dark:text-slate-100 font-semibold">{fmtDollar(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function UtilitiesPage() {
  const supabase = createClient();
  const { selectedStore, loading: storesLoading } = useStores();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [records, setRecords] = useState<MonthlyUtilityRow[]>([]);
  const [financialRecords, setFinancialRecords] = useState<MonthlyFinancialRecord[]>([]);
  const [revenueByMonth, setRevenueByMonth] = useState<Map<string, number>>(new Map());
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [turnsContext, setTurnsContext] = useState<{
    selfServiceTtm: number;
    dryerRevenuePct: number;
  } | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<UtilityForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  const loadData = useCallback(async () => {
    if (!selectedStore?.id) {
      setStore(null);
      setRecords([]);
      setFinancialRecords([]);
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
      setUserId(user.id);

      const [{ data: storeData }, { data: utilityData }, { data: financialsData }, { data: equipmentData }] =
        await Promise.all([
          supabase
            .from("stores")
            .select("id, name, square_footage, washers, monthly_revenue, avg_machine_age, dryer_revenue_pct")
            .eq("id", selectedStore.id)
            .single(),
          supabase
            .from("monthly_utilities")
            .select("*")
            .eq("store_id", selectedStore.id)
            .order("year", { ascending: false })
            .order("month", { ascending: false }),
          supabase
            .from("monthly_financials")
            .select("year, month, revenue, self_service_revenue")
            .eq("store_id", selectedStore.id)
            .order("year", { ascending: false })
            .order("month", { ascending: false }),
          supabase.from("equipment_inventory").select("*").eq("store_id", selectedStore.id),
        ]);

      setStore(storeData as StoreProfile);
      setRecords((utilityData ?? []) as MonthlyUtilityRow[]);
      setFinancialRecords((financialsData ?? []) as MonthlyFinancialRecord[]);
      setEquipment((equipmentData ?? []) as EquipmentRow[]);

      if (financialsData && financialsData.length > 0) {
        const utilitiesLookup = buildUtilitiesLookup((utilityData ?? []) as MonthlyUtilityRecord[]);
        const records = enrichMonthlyRecords(
          sortRecordsDesc(financialsData as MonthlyFinancialRecord[]),
          utilitiesLookup
        );
        const ttmRecords = records.slice(0, 12);
        setTurnsContext({
          selfServiceTtm: ttmRecords.reduce((sum, r) => sum + (r.self_service_revenue ?? 0), 0),
          dryerRevenuePct:
            storeData?.dryer_revenue_pct != null
              ? Number(storeData.dryer_revenue_pct)
              : DEFAULT_DRYER_REVENUE_PCT,
        });
      } else {
        setTurnsContext(null);
        setFinancialRecords([]);
      }

      const revMap = new Map<string, number>();
      for (const row of financialsData ?? []) {
        revMap.set(monthKey(row.year, row.month), row.revenue ?? 0);
      }
      setRevenueByMonth(revMap);

      if ((utilityData ?? []).length > 0) {
        setSelectedYear(utilityData![0].year);
        setSelectedMonth(utilityData![0].month);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id, supabase]);

  useEffect(() => {
    if (storesLoading) return;
    loadData();
  }, [storesLoading, loadData]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const sortedDesc = useMemo(
    () =>
      [...records].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      }),
    [records]
  );

  const latest = useMemo(() => getMostRecentUtility(records), [records]);

  const monthsWithData = useMemo(
    () => new Set(records.filter((r) => r.year === selectedYear).map((r) => r.month)),
    [records, selectedYear]
  );

  const selectedRecord = useMemo(
    () => records.find((r) => r.year === selectedYear && r.month === selectedMonth) ?? null,
    [records, selectedYear, selectedMonth]
  );

  const liveTotal = useMemo(() => totalUtilities({ ...form, year: selectedYear, month: selectedMonth }), [form, selectedYear, selectedMonth]);

  const monthlyRevenueFor = useCallback(
    (year: number, month: number) => {
      const fromPl = revenueByMonth.get(monthKey(year, month));
      if (fromPl != null && fromPl > 0) return fromPl;
      return store?.monthly_revenue ?? 0;
    },
    [revenueByMonth, store?.monthly_revenue]
  );

  const latestRevenue = latest ? monthlyRevenueFor(latest.year, latest.month) : store?.monthly_revenue ?? 0;
  const latestTotal = latest ? totalUtilities(latest) : 0;
  const latestWater = latest?.water ?? 0;
  const sqft = store?.square_footage ?? 0;
  const washers = store?.washers ?? 0;

  const realTurnsPerDay = useMemo(() => {
    if (equipment.length === 0 || !turnsContext || turnsContext.selfServiceTtm <= 0) return null;
    const turns = computeTurnsPerDay(
      equipment,
      turnsContext.selfServiceTtm,
      turnsContext.dryerRevenuePct
    );
    if (turns.missingVendPrices || turns.overallTurnsPerDay == null) return null;
    return turns.overallTurnsPerDay;
  }, [equipment, turnsContext]);

  const yoyChange = useMemo(() => {
    if (!latest) return null;
    const prior = records.find((r) => r.year === latest.year - 1 && r.month === latest.month);
    if (!prior) return null;
    const currentTotal = totalUtilities(latest);
    const priorTotal = totalUtilities(prior);
    if (priorTotal <= 0) return null;
    return ((currentTotal - priorTotal) / priorTotal) * 100;
  }, [latest, records]);

  const chartRecords = useMemo(() => {
    return [...records]
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      })
      .slice(-12)
      .map((r) => ({
        label: monthLabel(r.year, r.month),
        water: r.water,
        gas: r.gas,
        electric: r.electric,
        total: totalUtilities(r),
      }));
  }, [records]);

  const equipMetrics = useMemo(() => {
    const computed = computeEquipmentMetrics(equipment);
    if (computed.avgEquipmentAge > 0) return computed;
    return {
      ...computed,
      avgEquipmentAge: store?.avg_machine_age ?? 0,
    };
  }, [equipment, store?.avg_machine_age]);

  const costPerLoadMetrics = useMemo(() => {
    const empty = {
      totalLoadsPerMonth: null as number | null,
      totalUtilityCostPerLoad: null as number | null,
      waterCostPerLoad: null as number | null,
      electricCostPerLoad: null as number | null,
      gasCostPerLoad: null as number | null,
    };

    if (financialRecords.length === 0) return empty;

    const utilitiesLookup = buildUtilitiesLookup(records);
    const ttmRecords = enrichMonthlyRecords(
      sortRecordsDesc(financialRecords),
      utilitiesLookup
    ).slice(0, 12);
    const monthsUsed = ttmRecords.length;
    if (monthsUsed === 0) return empty;

    const washerCount = equipment
      .filter((e) => e.machine_type === "Washer")
      .reduce((sum, e) => sum + e.quantity, 0);
    const washerCountOrNull = washerCount > 0 ? washerCount : null;
    const turnsPerDay = realTurnsPerDay;
    const totalLoadsPerMonth =
      turnsPerDay != null && turnsPerDay > 0 && washerCountOrNull != null
        ? turnsPerDay * washerCountOrNull * 30
        : null;

    const toMonthlyAverage = (ttmTotal: number) => ttmTotal / monthsUsed;

    const hasWater = ttmUtilityFieldHasData(ttmRecords, utilitiesLookup, "water");
    const hasElectric = ttmUtilityFieldHasData(ttmRecords, utilitiesLookup, "electric");
    const hasGas = ttmUtilityFieldHasData(ttmRecords, utilitiesLookup, "gas");

    const avgWater = hasWater
      ? toMonthlyAverage(sumTtmUtilityField(ttmRecords, utilitiesLookup, "water"))
      : null;
    const avgElectric = hasElectric
      ? toMonthlyAverage(sumTtmUtilityField(ttmRecords, utilitiesLookup, "electric"))
      : null;
    const avgGas = hasGas ? toMonthlyAverage(sumTtmUtilityField(ttmRecords, utilitiesLookup, "gas")) : null;

    const costPerLoad = (monthlyCost: number | null) =>
      monthlyCost != null && totalLoadsPerMonth != null && totalLoadsPerMonth > 0
        ? monthlyCost / totalLoadsPerMonth
        : null;

    const totalAvgUtilities =
      avgWater != null && avgElectric != null && avgGas != null
        ? avgWater + avgElectric + avgGas
        : null;

    return {
      totalLoadsPerMonth,
      totalUtilityCostPerLoad: costPerLoad(totalAvgUtilities),
      waterCostPerLoad: costPerLoad(avgWater),
      electricCostPerLoad: costPerLoad(avgElectric),
      gasCostPerLoad: costPerLoad(avgGas),
    };
  }, [financialRecords, records, equipment, realTurnsPerDay]);

  const equipmentInsight = useMemo(() => {
    if (!latest) return "No significant correlation detected yet - add more historical data.";
    const waterPct = utilityPctOfRevenue(latest.water, latestRevenue);
    if (equipMetrics.avgEquipmentAge > 12 && waterPct > 12) {
      return "Older equipment may be using more water per cycle. Consider retrofitting with high-efficiency washers.";
    }
    if (equipMetrics.avgEquipmentAge < 6 && waterPct < 8) {
      return "Efficient equipment is helping keep water costs low.";
    }
    return "No significant correlation detected yet - add more historical data.";
  }, [latest, equipMetrics.avgEquipmentAge, latestRevenue]);

  function openMonthForm(month: number) {
    setSelectedMonth(month);
    const existing = records.find((r) => r.year === selectedYear && r.month === month);
    if (existing) {
      setForm({
        water: existing.water ?? 0,
        gas: existing.gas ?? 0,
        electric: existing.electric ?? 0,
        sewer: existing.sewer ?? 0,
        trash: existing.trash ?? 0,
        internet: existing.internet ?? 0,
        notes: existing.notes ?? "",
      });
    } else {
      setForm(emptyForm());
    }
    setSaveStatus("idle");
    setShowForm(true);
  }

  function setFormField(key: keyof UtilityForm, value: string) {
    if (key === "notes") {
      setForm((prev) => ({ ...prev, notes: value }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value === "" ? 0 : Number(value) }));
  }

  async function saveUtilityRecord() {
    if (!store?.id || !userId || saving || saveStatus === "success") return;
    setSaving(true);
    setSaveStatus("idle");

    try {
      const payload = {
        store_id: store.id,
        user_id: userId,
        year: toNum(selectedYear),
        month: toNum(selectedMonth),
        water: toNum(form.water),
        gas: toNum(form.gas),
        electric: toNum(form.electric),
        sewer: toNum(form.sewer),
        trash: toNum(form.trash),
        internet: toNum(form.internet),
        notes: toNullableText(form.notes),
      };

      const { error } = await supabase
        .from("monthly_utilities")
        .upsert(payload, { onConflict: "store_id,year,month" });

      if (error) {
        console.error("Utilities save error:", error);
        setSaveStatus("error");
        setMessage({ type: "error", text: "We couldn't save this. Please try again." });
        setSaving(false);
        return;
      }

      setSaveStatus("success");
      setMessage({ type: "success", text: `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} saved successfully.` });
      setTimeout(() => {
        setShowForm(false);
        setSaveStatus("idle");
        setSaving(false);
      }, 600);
      await loadData();
    } catch (err) {
      console.error("Unexpected utilities save error:", err);
      setSaveStatus("error");
      setMessage({ type: "error", text: "We couldn't save this. Please try again." });
      setSaving(false);
    }
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (storesLoading || loading) {
    return (
      <div className="space-y-5">
        <CardSkeleton />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!selectedStore) {
    return (
      <div className="card text-center py-12">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Select a store to track utility costs.
        </p>
      </div>
    );
  }

  if (records.length === 0 && !showForm) {
    return (
      <div className="space-y-5">
        <FormBanner message={message} />
        <div className="card text-center py-16">
          <p className="text-[15px] mb-6 max-w-lg mx-auto" style={{ color: "var(--text-muted)" }}>
            Track your utility costs to unlock water analysis, benchmarks, and equipment efficiency insights.
          </p>
          <button type="button" className="btn-primary" onClick={() => openMonthForm(new Date().getMonth() + 1)}>
            + Add This Month&apos;s Utilities
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FormBanner message={message} />

      <div>
        <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Utilities — {store?.name ?? selectedStore.name}
        </h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
          Track water, gas, electric, and utility benchmarks
        </p>
      </div>

      {/* Section 1 — Summary cards */}
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
          label={
            <MetricTooltip
              label="Total Utilities"
              explanation="Sum of water, gas, electric, sewer, trash, and internet for the most recent month."
            />
          }
          value={<AnimatedNumber value={latestTotal} prefix="$" duration={1000} />}
          sub={`${fmtPct(utilityPctOfRevenue(latestTotal, latestRevenue))} of revenue`}
        />
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.05s" }}
          label="Water"
          value={<AnimatedNumber value={latestWater} prefix="$" duration={1000} />}
          sub={
            <>
              {fmtDollar(waterCostPerSF(latestWater, sqft))} per SF · {fmtDollar(waterCostPerWasher(latestWater, washers))}{" "}
              per washer
            </>
          }
        />
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.1s" }}
          label="Gas"
          value={<AnimatedNumber value={latest?.gas ?? 0} prefix="$" duration={1000} />}
        />
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.15s" }}
          label="Electric"
          value={<AnimatedNumber value={latest?.electric ?? 0} prefix="$" duration={1000} />}
        />
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.2s" }}
          label="YoY Utilities Change"
          value={
            yoyChange != null ? (
              <span className={yoyChange <= 0 ? "text-green-400" : "text-red-400"}>
                {yoyChange <= 0 ? "↓" : "↑"} {Math.abs(yoyChange).toFixed(1)}%
              </span>
            ) : (
              "—"
            )
          }
          sub={yoyChange != null ? "vs same month last year" : "Need prior year data"}
          valueColor={yoyChange == null ? "var(--text-muted)" : undefined}
        />
      </div>

      {/* Section 2 — Add/Edit form */}
      <div className="card">
        <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
          Utility costs are also tracked automatically when you categorize bank transactions as Water, Gas, Electric,
          etc. in Financials → Bank Import. Manual entry here will be combined with imported transactions.
        </p>
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="metric-label mb-1.5">Year</div>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className={clsx(INPUT_CLASS, "w-32")}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <div className="metric-label mb-1.5">Month</div>
              <div className="flex flex-wrap gap-1.5">
                {MONTH_SHORT.map((label, idx) => {
                  const month = idx + 1;
                  const hasData = monthsWithData.has(month);
                  const isSelected = selectedMonth === month;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setSelectedMonth(month);
                        setShowForm(false);
                      }}
                      className={clsx(
                        "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                        isSelected
                          ? "bg-blue-600/20 border-blue-500/40 text-adaptive-info"
                          : hasData
                            ? "bg-[var(--bg-page)] dark:bg-[#243347] border-[var(--border2)] dark:border-white/10 text-[var(--text-primary)] dark:text-slate-300 hover:border-blue-500/30"
                            : "bg-transparent border-white/[0.06] text-adaptive-muted hover:text-adaptive-muted"
                      )}
                    >
                      {label}
                      {hasData && <span className="ml-0.5 text-green-400">•</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <button type="button" className="btn-primary" onClick={() => openMonthForm(selectedMonth)}>
            {selectedRecord ? "Edit Month" : "Add Month"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="section-title">
            {selectedRecord ? "Edit" : "Add"} — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </div>
          <div
            className="grid gap-4"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}
          >
            {(
              [
                { key: "water", label: "Water" },
                { key: "gas", label: "Gas" },
                { key: "electric", label: "Electric" },
                { key: "sewer", label: "Sewer (optional)" },
                { key: "trash", label: "Trash" },
                { key: "internet", label: "Internet (optional)" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key}>
                <div className="metric-label mb-1.5">{label}</div>
                <input
                  type="number"
                  value={form[key] === 0 ? "" : form[key]}
                  onChange={(e) => setFormField(key, e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="metric-label mb-1.5">Notes</div>
            <textarea
              value={form.notes}
              onChange={(e) => setFormField("notes", e.target.value)}
              className={clsx(INPUT_CLASS, "min-h-[72px]")}
              placeholder="Optional notes"
            />
          </div>
          <div className="mt-4 card2 inline-block px-4 py-3">
            <div className="metric-label">Live Total</div>
            <div className="text-lg font-bold text-adaptive-info">{fmtDollar(liveTotal)}</div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveUtilityRecord}
              disabled={saving || saveStatus === "success"}
            >
              {saveStatus === "success" ? "Saved" : saving ? "Saving…" : "Save Utilities"}
            </button>
          </div>
        </div>
      )}

      {/* Section 3 — Trend charts */}
      {chartRecords.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[
            { title: "Water Trend (12 Months)", dataKey: "water", color: "#3b82f6", id: "waterGrad" },
            { title: "Gas Trend (12 Months)", dataKey: "gas", color: "#f59e0b", id: "gasGrad" },
            { title: "Electric Trend (12 Months)", dataKey: "electric", color: "#eab308", id: "electricGrad" },
          ].map((chart) => (
            <div key={chart.dataKey} className="card">
              <div className="section-title">{chart.title}</div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRecords}>
                    <defs>
                      <linearGradient id={chart.id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chart.color} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={chart.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey={chart.dataKey}
                      name={chart.title.split(" ")[0]}
                      stroke={chart.color}
                      fill={`url(#${chart.id})`}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}

          <div className="card xl:col-span-2">
            <div className="section-title">Total Utilities Trend (12 Months)</div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRecords}>
                  <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="water" name="Water" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="gas" name="Gas" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="electric" name="Electric" stroke="#eab308" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Section 4 — Benchmarks */}
      {latest && (
        <div className="card">
          <div className="section-title">Utility Benchmarks</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Water % of Revenue", value: utilityPctOfRevenue(latest.water, latestRevenue), bench: "Industry typical: 8–12%", low: 8, high: 12 },
              { label: "Gas % of Revenue", value: utilityPctOfRevenue(latest.gas, latestRevenue), bench: "Industry typical: 3–6%", low: 3, high: 6 },
              { label: "Electric % of Revenue", value: utilityPctOfRevenue(latest.electric, latestRevenue), bench: "Industry typical: 5–8%", low: 5, high: 8 },
              { label: "Total Utilities % of Revenue", value: utilityPctOfRevenue(latestTotal, latestRevenue), bench: "Industry typical: 16–26%", low: 16, high: 26 },
            ].map((item) => (
              <div key={item.label} className="card2">
                <div className="metric-label">{item.label}</div>
                <div className={clsx("text-[20px] font-bold tabular-nums", benchmarkColor(item.value, item.low, item.high))}>
                  {fmtPct(item.value)}
                </div>
                <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  {item.bench}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 5 — Utility Cost Per Load */}
      <div className="card">
        <div className="section-title">Utility Cost Per Load</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {[
            {
              label: "Total Utility Cost Per Load",
              value: fmtCostPerLoad(costPerLoadMetrics.totalUtilityCostPerLoad),
              valueClass:
                costPerLoadMetrics.totalUtilityCostPerLoad != null
                  ? costPerLoadBenchmark(costPerLoadMetrics.totalUtilityCostPerLoad).color
                  : undefined,
            },
            { label: "Water Cost Per Load", value: fmtCostPerLoad(costPerLoadMetrics.waterCostPerLoad) },
            { label: "Electric Cost Per Load", value: fmtCostPerLoad(costPerLoadMetrics.electricCostPerLoad) },
            { label: "Gas Cost Per Load", value: fmtCostPerLoad(costPerLoadMetrics.gasCostPerLoad) },
            {
              label: "Total Loads Per Month",
              value: fmtLoadsPerMonth(costPerLoadMetrics.totalLoadsPerMonth),
            },
          ].map((item) => (
            <div key={item.label} className="card2">
              <div className="metric-label">{item.label}</div>
              <div
                className={clsx("text-[18px] font-bold tabular-nums", item.valueClass)}
                style={item.valueClass ? undefined : { color: "var(--text-primary)" }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
        {costPerLoadMetrics.totalUtilityCostPerLoad != null ? (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Industry benchmark:{" "}
            <span className={costPerLoadBenchmark(costPerLoadMetrics.totalUtilityCostPerLoad).color}>
              {costPerLoadBenchmark(costPerLoadMetrics.totalUtilityCostPerLoad).label}
            </span>
            {" — "}
            Good under $0.40/load · Watch $0.40–$0.55 · High over $0.55. Based on TTM utility averages
            (water, electric, gas) and loads from equipment turns per day × washers × 30 days.
          </p>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Add monthly financials, utility costs (water, electric, gas), and equipment with vend prices to
            calculate cost per load. Industry benchmark: Good under $0.40/load · Watch $0.40–$0.55 · High
            over $0.55.
          </p>
        )}
      </div>

      {/* Section 6 — Water Analysis */}
      {latest && (
        <div className="card">
          <div className="section-title">Water Analysis</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {[
              { label: "Water Cost Per Month", value: fmtDollar(latest.water) },
              { label: "Water Cost Per SF", value: fmtDollar(waterCostPerSF(latest.water, sqft)) },
              { label: "Water Cost Per Washer", value: fmtDollar(waterCostPerWasher(latest.water, washers)) },
              { label: "Water Cost Per Turn", value: fmtDollar(waterCostPerTurn(latest.water, washers, 4.5, realTurnsPerDay)) },
            ].map((item) => (
              <div key={item.label} className="card2">
                <div className="metric-label">{item.label}</div>
                <div className="text-[18px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Water usage is one of the strongest indicators of actual store activity. Unusually low water costs relative
            to revenue may indicate underreported income or equipment issues.
          </p>
        </div>
      )}

      {/* Section 7 — Equipment Connection */}
      {latest && (
        <div className="card">
          <div className="section-title">Equipment Connection</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="card2 text-center">
              <div className="metric-label">Average Equipment Age</div>
              <div className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
                {equipMetrics.avgEquipmentAge.toFixed(1)} yrs
              </div>
            </div>
            <div className="card2 text-center">
              <div className="metric-label">Equipment Grade</div>
              <div className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
                {equipMetrics.equipmentGrade}
              </div>
            </div>
            <div className="card2 text-center">
              <div className="metric-label">Water Expense</div>
              <div className="text-[22px] font-bold text-adaptive-info">{fmtDollar(latest.water)}</div>
            </div>
          </div>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {equipmentInsight}
          </p>
        </div>
      )}

      {/* Section 8 — History table */}
      <div className="card">
        <div className="section-title">Monthly History</div>
        <div className="table-scroll">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-adaptive-muted border-b border-white/[0.06]">
                <th className="pb-3 pr-3 font-medium">Month</th>
                <th className="pb-3 pr-3 font-medium text-right">Water</th>
                <th className="pb-3 pr-3 font-medium text-right">Gas</th>
                <th className="pb-3 pr-3 font-medium text-right">Electric</th>
                <th className="pb-3 pr-3 font-medium text-right">Sewer</th>
                <th className="pb-3 pr-3 font-medium text-right">Trash</th>
                <th className="pb-3 pr-3 font-medium text-right">Internet</th>
                <th className="pb-3 pr-3 font-medium text-right">Total</th>
                <th className="pb-3 font-medium text-right">% of Revenue</th>
              </tr>
            </thead>
            <tbody>
              {sortedDesc.map((r) => {
                const total = totalUtilities(r);
                const revenue = monthlyRevenueFor(r.year, r.month);
                return (
                  <tr
                    key={`${r.year}-${r.month}`}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => openMonthForm(r.month)}
                  >
                    <td className="py-2.5 pr-3 text-adaptive-secondary">
                      {MONTH_NAMES[r.month - 1]} {r.year}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-adaptive-secondary">{fmtDollar(r.water)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-adaptive-secondary">{fmtDollar(r.gas)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-adaptive-secondary">{fmtDollar(r.electric)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-adaptive-muted">{fmtDollar(r.sewer)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-adaptive-muted">{fmtDollar(r.trash)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-adaptive-muted">{fmtDollar(r.internet)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-adaptive-info font-medium">{fmtDollar(total)}</td>
                    <td className="py-2.5 text-right tabular-nums text-adaptive-muted">
                      {fmtPct(utilityPctOfRevenue(total, revenue))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
