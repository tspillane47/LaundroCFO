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
  calcYearsRemaining,
  computeScenarios,
  type ScenarioResult,
  type StoreScenarioContext,
} from "@/lib/scenarios";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { PageError } from "@/components/ui/PageError";

export default function ScenariosPage() {
  const supabase = createClient();
  const { selectedStore, isAllStores, stores, loading: storesLoading } = useStores();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [ctx, setCtx] = useState<StoreScenarioContext | null>(null);
  const [selectedId, setSelectedId] = useState("retool");

  const loadData = useCallback(async () => {
    if (!selectedStore?.id) {
      setCtx(null);
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
          totalLeaseControl = remaining + optionYears;
        }
      }

      setCtx({
        store: storeData,
        equipment: (equipmentData ?? []) as EquipmentRecord[],
        totalLeaseControl,
        isOwnerOccupied: ownerOccupied,
        realEstateValue,
        resolvedFinancials,
      });
    } catch {
      setLoadError(true);
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id, supabase]);

  useEffect(() => {
    if (storesLoading) return;
    loadData();
  }, [storesLoading, loadData]);

  const scenarios = useMemo(
    () => (ctx ? computeScenarios(ctx) : []),
    [ctx]
  );

  const selected = useMemo(
    () => scenarios.find((s) => s.id === selectedId) ?? scenarios[0] ?? null,
    [scenarios, selectedId]
  );

  if (storesLoading || loading) {
    return (
      <div className="space-y-5">
        <CardSkeleton />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (stores.length === 0) {
    return (
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Add a store to model valuation scenarios.
        </p>
      </div>
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

  if (!ctx || !selected || !hasFinancials) {
    return (
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Add store financials (monthly revenue & expenses) to model scenarios.
        </p>
      </div>
    );
  }

  const isNeg = selected.valueImpact < 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-slate-100">
          Scenario Planner{" "}
          <span className="text-[12px] text-slate-500 font-normal ml-2">
            {String(ctx.store.name ?? "Store")} — based on live financials
          </span>
        </h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {scenarios.map((sc) => (
            <ScenarioCard
              key={sc.id}
              scenario={sc}
              active={selected.id === sc.id}
              onSelect={() => setSelectedId(sc.id)}
            />
          ))}
        </div>

        <div className="card xl:sticky xl:top-0">
          <div className="text-[13px] font-bold text-slate-100 mb-4">
            {selected.emoji} {selected.title}
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="card2">
              <div className="metric-label">Current Value</div>
              <div className="text-[16px] font-bold text-slate-100">
                {fmtDollar(selected.currentValue)}
              </div>
            </div>
            <div className={clsx("card2", isNeg ? "border-red-500/20" : "border-green-500/20")}>
              <div className="metric-label">Scenario Value</div>
              <div className={clsx("text-[16px] font-bold", isNeg ? "text-red-400" : "text-green-400")}>
                {fmtDollar(selected.scenarioValue)}
              </div>
            </div>
            <div className="card2">
              <div className="metric-label">Value Change</div>
              <div className={clsx("text-[16px] font-bold", isNeg ? "text-red-400" : "text-green-400")}>
                {isNeg ? "−" : "+"}
                {fmtDollar(Math.abs(selected.valueImpact))}
              </div>
            </div>
            <div className="card2">
              <div className="metric-label">% Change</div>
              <div className={clsx("text-[16px] font-bold", isNeg ? "text-red-400" : "text-green-400")}>
                {isNeg ? "−" : "+"}
                {Math.abs(selected.pctChange).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-600 uppercase tracking-wider mb-2">Key Outputs</div>
          <div className="divide-y divide-white/[0.04] mb-4">
            <div className="flex items-center justify-between py-2 text-[12px]">
              <span className="text-slate-500">New EBITDA</span>
              <span className="font-semibold text-slate-100">{fmtDollar(selected.newEbitda)}</span>
            </div>
            <div className="flex items-center justify-between py-2 text-[12px]">
              <span className="text-slate-500">Multiple Applied</span>
              <span className="font-semibold text-blue-300">{fmtMultiple(selected.newMultiple)}</span>
            </div>
            {Object.entries(selected.detail).map(([k, v]) => {
              const label = k
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (s) => s.toUpperCase());
              return (
                <div key={k} className="flex items-center justify-between py-2 text-[12px]">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-100">
                    {typeof v === "number" && k.toLowerCase().includes("revenue") && k !== "revenueGain"
                      ? fmtDollar(v)
                      : String(v)}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            className={clsx(
              "p-3 rounded-lg text-[12px]",
              isNeg
                ? "bg-red-500/8 border border-red-500/20 text-red-400"
                : "bg-green-500/8 border border-green-500/20 text-green-400"
            )}
          >
            {selected.note}
          </div>
        </div>
      </div>
    </div>
  );
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
      <div className="text-[13px] font-semibold text-slate-100">
        {scenario.emoji} {scenario.title}
      </div>
      <div className="text-[11px] text-slate-500 mt-1">{scenario.description}</div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.05]">
        <div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider">Value Impact</div>
          <div className={clsx("text-[16px] font-bold mt-0.5", neg ? "text-red-400" : "text-green-400")}>
            {neg ? "−" : "+"}
            {fmtDollar(Math.abs(scenario.valueImpact))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-600 uppercase tracking-wider">
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
