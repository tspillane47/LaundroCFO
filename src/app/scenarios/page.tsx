"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import {
  calcTtmMetrics,
  enrichMonthlyRecords,
  sortRecordsDesc,
  type MonthlyFinancialRecord,
} from "@/lib/financials";
import { resolveStoreFinancials } from "@/lib/getStoreValuation";
import { useStores } from "@/lib/store-context";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import { type EquipmentRecord } from "@/lib/equipment";
import {
  buildDefaultScenarioInputs,
  calcYearsRemaining,
  computeInteractiveScenario,
  computeScenarios,
  type ScenarioInputParams,
  type ScenarioResult,
  type StoreScenarioContext,
} from "@/lib/scenarios";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageError } from "@/components/ui/PageError";

type SliderConfig = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
};

export default function ScenariosPage() {
  const supabase = createClient();
  const { selectedStore, isAllStores, stores, loading: storesLoading } = useStores();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [ctx, setCtx] = useState<StoreScenarioContext | null>(null);
  const [selectedId, setSelectedId] = useState("retool");
  const [inputParams, setInputParams] = useState<ScenarioInputParams | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedStore?.id) {
      setCtx(null);
      setInputParams(null);
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
        { data: equipmentData, error: equipError },
        { data: financialsData, error: financialsError },
      ] = await Promise.all([
        supabase.from("stores").select("*").eq("id", selectedStore.id).single(),
        supabase.from("equipment_inventory").select("*").eq("store_id", selectedStore.id),
        supabase
          .from("monthly_financials")
          .select("*")
          .eq("store_id", selectedStore.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
      ]);

      if (storeError) throw storeError;
      if (!storeData) throw new Error("Store not found");
      if (equipError) throw equipError;
      if (financialsError) throw financialsError;

      const sorted = enrichMonthlyRecords(
        sortRecordsDesc((financialsData ?? []) as MonthlyFinancialRecord[])
      );
      const ttmMetrics = sorted.length > 0 ? calcTtmMetrics(sorted) : null;
      const resolvedFinancials = resolveStoreFinancials(storeData, ttmMetrics);
      const ownerOccupied = storeData.occupancy_type === "owner_occupied";
      let totalLeaseControl = ownerOccupied ? 15 : 0;
      let leaseYearsRemaining = ownerOccupied ? 15 : 0;
      let realEstateValue = 0;

      if (ownerOccupied) {
        const { data: reData, error: reError } = await supabase
          .from("real_estate")
          .select("estimated_value")
          .eq("store_id", storeData.id)
          .limit(1)
          .maybeSingle();
        if (reError) throw reError;
        realEstateValue = reData?.estimated_value ?? 0;
      } else {
        const { data: leaseData, error: leaseError } = await supabase
          .from("leases")
          .select("id, lease_end_date")
          .eq("store_id", storeData.id)
          .limit(1)
          .maybeSingle();
        if (leaseError) throw leaseError;

        if (leaseData) {
          const remaining = calcYearsRemaining(leaseData.lease_end_date);
          const { data: optionsData, error: optionsError } = await supabase
            .from("lease_options")
            .select("option_years, status")
            .eq("lease_id", leaseData.id);
          if (optionsError) throw optionsError;
          const optionYears = (optionsData ?? [])
            .filter((o) => o.status === "Available")
            .reduce((s, o) => s + (o.option_years ?? 0), 0);
          leaseYearsRemaining = remaining;
          totalLeaseControl = remaining + optionYears;
        }
      }

      const nextCtx: StoreScenarioContext = {
        store: storeData,
        equipment: (equipmentData ?? []) as EquipmentRecord[],
        totalLeaseControl,
        leaseYearsRemaining,
        isOwnerOccupied: ownerOccupied,
        realEstateValue,
        resolvedFinancials,
        annualDebtService: ttmMetrics?.ttmDebtService ?? 0,
      };

      setCtx(nextCtx);
      setInputParams(buildDefaultScenarioInputs(nextCtx));
    } catch {
      setLoadError(true);
      setCtx(null);
      setInputParams(null);
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id, supabase]);

  useEffect(() => {
    if (storesLoading) return;
    loadData();
  }, [storesLoading, loadData]);

  const scenarios = useMemo(() => (ctx ? computeScenarios(ctx) : []), [ctx]);

  const liveScenario = useMemo(() => {
    if (!ctx || !inputParams) return null;
    return computeInteractiveScenario(ctx, selectedId, inputParams);
  }, [ctx, selectedId, inputParams]);

  const updateParams = useCallback(
    <K extends keyof ScenarioInputParams>(
      key: K,
      patch: Partial<ScenarioInputParams[K]>
    ) => {
      setInputParams((prev) =>
        prev ? { ...prev, [key]: { ...prev[key], ...patch } } : prev
      );
    },
    []
  );

  if (storesLoading || loading) {
    return <LoadingSkeleton variant="card" />;
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (stores.length === 0) {
    return (
      <EmptyState
        icon="Store"
        title="No stores yet"
        description="Add a store to model valuation scenarios."
        ctaLabel="Add Your First Store"
        ctaHref="/portfolio"
      />
    );
  }

  if (isAllStores || !selectedStore) {
    return (
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Select a store to model scenarios
        </p>
      </div>
    );
  }

  const hasFinancials =
    ctx != null &&
    ctx.resolvedFinancials != null &&
    ctx.resolvedFinancials.source !== "none" &&
    ctx.resolvedFinancials.monthlyRevenue > 0;

  if (!ctx || !liveScenario || !inputParams || !hasFinancials) {
    return (
      <EmptyState
        icon="LineChart"
        title="No financial data to model"
        description="Add monthly financials first to run scenarios"
        ctaLabel="Go to Financials"
        ctaHref="/financials"
      />
    );
  }

  const isNeg = liveScenario.valueImpact < 0;
  const sliders = buildSliders(selectedId, inputParams, updateParams);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-gray-900 dark:text-slate-100">
          Scenario Planner{" "}
          <span className="text-[12px] text-gray-700 dark:text-gray-600 dark:text-slate-500 font-normal ml-2">
            {String(ctx.store.name ?? "Store")} — based on live financials
          </span>
        </h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {scenarios.map((sc) => (
            <ScenarioCard
              key={sc.id}
              scenario={sc}
              active={selectedId === sc.id}
              onSelect={() => setSelectedId(sc.id)}
            />
          ))}
        </div>

        <div className="card xl:sticky xl:top-0 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div className="text-[13px] font-bold text-gray-900 dark:text-slate-100 mb-4">
            {liveScenario.title}
          </div>

          <div className="space-y-4 mb-5 pb-5 border-b border-[var(--border)]">
            <div className="text-[11px] text-gray-700 dark:text-slate-600 uppercase tracking-wider">
              Adjust Assumptions
            </div>
            {sliders.map((slider) => (
              <ScenarioSlider key={slider.label} {...slider} />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="card2">
              <div className="metric-label">Current Value</div>
              <div className="text-[16px] font-bold text-gray-900 dark:text-slate-100">
                {fmtDollar(liveScenario.currentValue)}
              </div>
            </div>
            <div className={clsx("card2", isNeg ? "border-red-500/20" : "border-green-500/20")}>
              <div className="metric-label">Scenario Value</div>
              <div className={clsx("text-[16px] font-bold", isNeg ? "text-red-400" : "text-green-400")}>
                {fmtDollar(liveScenario.scenarioValue)}
              </div>
            </div>
            <div className="card2">
              <div className="metric-label">Value Change</div>
              <div className={clsx("text-[16px] font-bold", isNeg ? "text-red-400" : "text-green-400")}>
                {isNeg ? "−" : "+"}
                {fmtDollar(Math.abs(liveScenario.valueImpact))}
              </div>
            </div>
            <div className="card2">
              <div className="metric-label">% Change</div>
              <div className={clsx("text-[16px] font-bold", isNeg ? "text-red-400" : "text-green-400")}>
                {isNeg ? "−" : "+"}
                {Math.abs(liveScenario.pctChange).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-700 dark:text-slate-600 uppercase tracking-wider mb-2">
            Key Outputs
          </div>
          <div className="divide-y divide-white/[0.04] mb-4">
            {(selectedId === "retool" ||
              selectedId === "revenue" ||
              selectedId === "utility" ||
              selectedId === "wdf" ||
              selectedId === "rent" ||
              selectedId === "commercial" ||
              selectedId === "delivery") && (
              <OutputRow label="New EBITDA" value={fmtDollar(liveScenario.newEbitda)} />
            )}
            {(selectedId === "retool" || selectedId === "lease") && (
              <OutputRow label="Multiple Applied" value={fmtMultiple(liveScenario.newMultiple)} accent />
            )}
            {selectedId === "rent" && (
              <OutputRow
                label="DSCR"
                value={liveScenario.newDscr != null ? fmtMultiple(liveScenario.newDscr) : "—"}
                accent
              />
            )}
            <OutputRow label="Scenario Value" value={fmtDollar(liveScenario.scenarioValue)} />
          </div>

          <div
            className={clsx(
              "p-3 rounded-lg text-[12px]",
              isNeg
                ? "bg-red-500/8 border border-red-500/20 text-red-400"
                : "bg-green-500/8 border border-green-500/20 text-green-400"
            )}
          >
            {liveScenario.note}
          </div>
        </div>
      </div>
    </div>
  );
}

function OutputRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-[12px]">
      <span className="text-gray-700 dark:text-slate-500">{label}</span>
      <span className={clsx("font-semibold", accent ? "text-blue-300" : "text-gray-900 dark:text-slate-100")}>
        {value}
      </span>
    </div>
  );
}

function ScenarioSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: SliderConfig) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] text-gray-700 dark:text-slate-500">{label}</label>
        <span className="text-[12px] font-semibold text-gray-900 dark:text-slate-100 tabular-nums">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="scenario-slider"
      />
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-600 dark:text-slate-600 tabular-nums">{format(min)}</span>
        <span className="text-[10px] text-gray-600 dark:text-slate-600 tabular-nums">{format(max)}</span>
      </div>
    </div>
  );
}

function buildSliders(
  scenarioId: string,
  params: ScenarioInputParams,
  update: <K extends keyof ScenarioInputParams>(
    key: K,
    patch: Partial<ScenarioInputParams[K]>
  ) => void
): SliderConfig[] {
  switch (scenarioId) {
    case "retool":
      return [
        {
          label: "Investment Amount",
          min: 50000,
          max: 500000,
          step: 10000,
          value: params.retool.investment,
          onChange: (v) => update("retool", { investment: v }),
          format: (v) => fmtDollar(v),
        },
        {
          label: "New Equipment Age",
          min: 1,
          max: 5,
          step: 1,
          value: params.retool.equipmentAge,
          onChange: (v) => update("retool", { equipmentAge: v }),
          format: (v) => `${v} yr${v === 1 ? "" : "s"}`,
        },
      ];
    case "revenue":
      return [
        {
          label: "Revenue Increase",
          min: 1,
          max: 30,
          step: 1,
          value: params.revenue.increasePct,
          onChange: (v) => update("revenue", { increasePct: v }),
          format: (v) => `${v}%`,
        },
      ];
    case "utility":
      return [
        {
          label: "Utility Reduction",
          min: 1,
          max: 15,
          step: 1,
          value: params.utility.reductionPct,
          onChange: (v) => update("utility", { reductionPct: v }),
          format: (v) => `${v}%`,
        },
      ];
    case "lease":
      return [
        {
          label: "Years to Extend",
          min: 1,
          max: 10,
          step: 1,
          value: params.lease.yearsToExtend,
          onChange: (v) => update("lease", { yearsToExtend: v }),
          format: (v) => `${v} yr${v === 1 ? "" : "s"}`,
        },
      ];
    case "wdf":
      return [
        {
          label: "WDF Revenue % of Total",
          min: 5,
          max: 40,
          step: 1,
          value: params.wdf.wdfPct,
          onChange: (v) => update("wdf", { wdfPct: v }),
          format: (v) => `${v}%`,
        },
        {
          label: "Price per Pound",
          min: 1.25,
          max: 2.5,
          step: 0.05,
          value: params.wdf.pricePerLb,
          onChange: (v) => update("wdf", { pricePerLb: v }),
          format: (v) => `$${v.toFixed(2)}`,
        },
      ];
    case "rent":
      return [
        {
          label: "Rent Increase",
          min: 1,
          max: 30,
          step: 1,
          value: params.rent.increasePct,
          onChange: (v) => update("rent", { increasePct: v }),
          format: (v) => `${v}%`,
        },
      ];
    case "commercial":
      return [
        {
          label: "Revenue Loss",
          min: 1,
          max: 30,
          step: 1,
          value: params.commercial.revenueLossPct,
          onChange: (v) => update("commercial", { revenueLossPct: v }),
          format: (v) => `${v}%`,
        },
      ];
    case "delivery":
      return [
        {
          label: "Route Revenue per Month",
          min: 500,
          max: 10000,
          step: 500,
          value: params.delivery.routeRevenueMonthly,
          onChange: (v) => update("delivery", { routeRevenueMonthly: v }),
          format: (v) => fmtDollar(v),
        },
      ];
    default:
      return [];
  }
}

function ScenarioCard({
  scenario,
  active,
  onSelect,
}: {
  scenario: ScenarioResult;
  active: boolean;
  onSelect: () => void;
}) {
  const neg = scenario.valueImpact < 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "card text-left transition-all hover:border-blue-500/50",
        active && "border-blue-500 bg-blue-500/5"
      )}
    >
      <div className="text-[13px] font-semibold text-gray-900 dark:text-slate-100">
        {scenario.title}
      </div>
      <div className="text-[11px] text-gray-700 dark:text-gray-600 dark:text-slate-500 mt-1">
        {scenario.description}
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.05]">
        <div>
          <div className="text-[10px] text-gray-700 dark:text-gray-600 dark:text-slate-600 uppercase tracking-wider">
            Value Impact
          </div>
          <div className={clsx("text-[16px] font-bold mt-0.5", neg ? "text-red-400" : "text-green-400")}>
            {neg ? "−" : "+"}
            {fmtDollar(Math.abs(scenario.valueImpact))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-700 dark:text-gray-600 dark:text-slate-600 uppercase tracking-wider">
            {scenario.id === "revenue" ? "New EBITDA" : scenario.id === "retool" ? "Multiple" : "% Change"}
          </div>
          <div className="text-[16px] font-bold text-blue-300 mt-0.5">
            {scenario.id === "revenue"
              ? fmtDollar(scenario.newEbitda)
              : scenario.id === "retool"
                ? fmtMultiple(scenario.newMultiple)
                : `${neg ? "−" : "+"}${Math.abs(scenario.pctChange).toFixed(1)}%`}
          </div>
        </div>
      </div>
    </button>
  );
}
