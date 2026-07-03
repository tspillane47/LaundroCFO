"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import {
  applyLoanDebtServiceToTtm,
  calcTtmMetrics,
  enrichMonthlyRecords,
  fetchAnnualDebtServiceByStore,
  sortRecordsDesc,
  type MonthlyFinancialRecord,
} from "@/lib/financials";
import { resolveStoreFinancials } from "@/lib/getStoreValuation";
import { useStores } from "@/lib/store-context";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import { type EquipmentRecord } from "@/lib/equipment";
import {
  buildDefaultScenarioInputs,
  buildScenarioNarrative,
  calcYearsRemaining,
  computeAllInteractiveScenarios,
  formatPayback,
  formatRank,
  isInvestmentScenario,
  rankScenariosByImpact,
  SCENARIO_IDS,
  type InteractiveScenarioResult,
  type ScenarioInputParams,
  type StoreScenarioContext,
} from "@/lib/scenarios";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageError } from "@/components/ui/PageError";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useToast } from "@/components/ui/ToastProvider";
import { ScenarioIcon } from "@/components/ui/ScenarioIcon";

type SliderConfig = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
};

type SavedScenarioRow = {
  id: string;
  scenario_name: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  created_at: string;
};

export default function ScenariosPage() {
  return (
    <DesktopOnlyGate featureName="Scenarios">
      <ScenariosPageContent />
    </DesktopOnlyGate>
  );
}

function ScenariosPageContent() {
  const supabase = createClient();
  const { selectedStore, isAllStores, stores, loading: storesLoading } = useStores();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [ctx, setCtx] = useState<StoreScenarioContext | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("retool");
  const [inputParams, setInputParams] = useState<ScenarioInputParams | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState("retool");
  const [compareB, setCompareB] = useState("revenue");
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioRow[]>([]);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSavedScenarios = useCallback(
    async (storeId: string, uid: string) => {
      const { data, error } = await supabase
        .from("saved_scenarios")
        .select("id, scenario_name, inputs, outputs, created_at")
        .eq("store_id", storeId)
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (!error && data) setSavedScenarios(data as SavedScenarioRow[]);
    },
    [supabase]
  );

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
      setUserId(user.id);

      const [
        { data: storeData, error: storeError },
        { data: equipmentData, error: equipError },
        { data: financialsData, error: financialsError },
        annualDebtByStore,
      ] = await Promise.all([
        supabase.from("stores").select("*").eq("id", selectedStore.id).single(),
        supabase.from("equipment_inventory").select("*").eq("store_id", selectedStore.id),
        supabase
          .from("monthly_financials")
          .select("*")
          .eq("store_id", selectedStore.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
        fetchAnnualDebtServiceByStore(supabase, [selectedStore.id]),
      ]);

      if (storeError) throw storeError;
      if (!storeData) throw new Error("Store not found");
      if (equipError) throw equipError;
      if (financialsError) throw financialsError;

      const sorted = enrichMonthlyRecords(
        sortRecordsDesc((financialsData ?? []) as MonthlyFinancialRecord[])
      );
      const scheduledAnnualDebtService = annualDebtByStore[selectedStore.id] ?? 0;
      const ttmMetrics =
        sorted.length > 0
          ? applyLoanDebtServiceToTtm(calcTtmMetrics(sorted), scheduledAnnualDebtService)
          : null;
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
        annualDebtService: scheduledAnnualDebtService,
      };

      setCtx(nextCtx);
      setInputParams(buildDefaultScenarioInputs(nextCtx));
      await loadSavedScenarios(selectedStore.id, user.id);
    } catch {
      setLoadError(true);
      setCtx(null);
      setInputParams(null);
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id, supabase, loadSavedScenarios]);

  useEffect(() => {
    if (storesLoading) return;
    loadData();
  }, [storesLoading, loadData]);

  const rankedScenarios = useMemo(
    () => (ctx && inputParams ? rankScenariosByImpact(ctx, inputParams) : []),
    [ctx, inputParams]
  );

  const liveScenarios = useMemo(
    () => (ctx && inputParams ? computeAllInteractiveScenarios(ctx, inputParams) : []),
    [ctx, inputParams]
  );

  const liveScenarioMap = useMemo(
    () => new Map(liveScenarios.map((s) => [s.id, s])),
    [liveScenarios]
  );

  const rankMap = useMemo(
    () => new Map(rankedScenarios.map((s) => [s.id, s.rank])),
    [rankedScenarios]
  );

  const liveScenario = liveScenarioMap.get(selectedId) ?? null;

  const compareScenarioA = liveScenarioMap.get(compareA) ?? null;
  const compareScenarioB = liveScenarioMap.get(compareB) ?? null;

  const topOpportunities = rankedScenarios.filter((s) => s.valueImpact > 0).slice(0, 3);

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

  const handleSaveScenario = useCallback(async () => {
    if (!ctx || !inputParams || !liveScenario || !selectedStore?.id || !userId) return;
    setSaving(true);
    try {
      const outputs = {
        currentValue: liveScenario.currentValue,
        scenarioValue: liveScenario.scenarioValue,
        valueImpact: liveScenario.valueImpact,
        pctChange: liveScenario.pctChange,
        currentEbitda: liveScenario.currentEbitda,
        newEbitda: liveScenario.newEbitda,
        ebitdaChange: liveScenario.ebitdaChange,
        baselineDscr: liveScenario.baselineDscr,
        newDscr: liveScenario.newDscr,
        monthlyCashFlowImpact: liveScenario.monthlyCashFlowImpact,
        paybackMonths: liveScenario.paybackMonths,
        breakEvenMonths: liveScenario.breakEvenMonths,
        investmentRequired: liveScenario.investmentRequired,
        newMultiple: liveScenario.newMultiple,
      };
      const { error } = await supabase.from("saved_scenarios").insert({
        store_id: selectedStore.id,
        user_id: userId,
        scenario_name: liveScenario.title,
        inputs: { scenarioId: selectedId, params: inputParams },
        outputs,
      });
      if (error) throw error;
      toast.success("Scenario saved");
      await loadSavedScenarios(selectedStore.id, userId);
      setSavedExpanded(true);
    } catch {
      toast.error("Failed to save — please try again");
    } finally {
      setSaving(false);
    }
  }, [
    ctx,
    inputParams,
    liveScenario,
    selectedStore?.id,
    userId,
    selectedId,
    supabase,
    loadSavedScenarios,
    toast,
  ]);

  const handleDeleteSaved = useCallback(
    async (id: string) => {
      if (!selectedStore?.id || !userId) return;
      await supabase.from("saved_scenarios").delete().eq("id", id);
      await loadSavedScenarios(selectedStore.id, userId);
    },
    [selectedStore?.id, userId, supabase, loadSavedScenarios]
  );

  if (storesLoading || loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingSkeleton key={i} variant="metric-card" />
        ))}
      </div>
    );
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
  const narrative = buildScenarioNarrative(liveScenario, ctx, inputParams);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-[15px] font-semibold text-[var(--text-primary)]">
          Scenario Planner{" "}
          <span className="text-[12px] text-[var(--text-muted)] font-normal ml-2">
            {String(ctx.store.name ?? "Store")} — based on live financials
          </span>
        </h1>
        <button
          type="button"
          onClick={() => setCompareMode((v) => !v)}
          className={clsx(
            "text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors",
            compareMode
              ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/30"
          )}
        >
          {compareMode ? "Close Compare" : "Compare Scenarios"}
        </button>
      </div>

      {/* Section 1 — Top Opportunities */}
      {topOpportunities.length > 0 && (
        <section className="card card-success">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-success)] mb-3">
            Your Top {topOpportunities.length} Opportunities
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topOpportunities.map((opp, i) => (
              <div
                key={opp.id}
                className={clsx(
                  "rounded-lg p-3 border",
                  i === 0
                    ? "bg-amber-500/8 border-amber-500/30"
                    : "bg-green-500/5 border-green-500/20"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ScenarioIcon name={opp.icon} size={16} />
                  <span className="text-[12px] font-bold text-[var(--text-primary)]">
                    #{opp.rank} {opp.title}
                  </span>
                </div>
                <div className="text-[18px] font-bold text-[var(--text-success)]">
                  +{fmtDollar(opp.valueImpact)}
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  {opp.opportunityReason}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 4 — Compare Mode */}
      {compareMode && compareScenarioA && compareScenarioB && (
        <ComparePanel
          scenarioA={compareScenarioA}
          scenarioB={compareScenarioB}
          compareA={compareA}
          compareB={compareB}
          onCompareAChange={setCompareA}
          onCompareBChange={setCompareB}
          scenarios={liveScenarios}
        />
      )}

      {/* Sections 2 & 3 — Cards + Right Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SCENARIO_IDS.map((id) => {
            const scenario = liveScenarioMap.get(id);
            if (!scenario) return null;
            return (
              <ScenarioCard
                key={id}
                scenario={scenario}
                rank={rankMap.get(id) ?? 0}
                active={selectedId === id}
                onSelect={() => setSelectedId(id)}
              />
            );
          })}
        </div>

        <div className="card xl:sticky xl:top-0 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--text-primary)]">
              <ScenarioIcon name={liveScenario.icon} size={16} />
              {liveScenario.title}
            </div>
            <button
              type="button"
              onClick={handleSaveScenario}
              disabled={saving}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/40 hover:text-blue-400 transition-colors shrink-0 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Scenario"}
            </button>
          </div>

          {/* Sliders */}
          <div className="space-y-4 mb-5 pb-5 border-b border-[var(--border)]">
            <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
              Adjust Assumptions
            </div>
            {sliders.length > 0 ? (
              sliders.map((slider) => <ScenarioSlider key={slider.label} {...slider} />)
            ) : (
              <p className="text-[11px] text-[var(--text-secondary)]">
                No adjustable inputs for this scenario.
              </p>
            )}
          </div>

          {/* Key Metrics Grid */}
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Key Metrics
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <MetricTile label="Current Value" value={fmtDollar(liveScenario.currentValue)} />
            <MetricTile
              label="Scenario Value"
              value={fmtDollar(liveScenario.scenarioValue)}
              accent={isNeg ? "red" : "green"}
            />
            <MetricTile
              label="Value Change"
              value={`${isNeg ? "−" : "+"}${fmtDollar(Math.abs(liveScenario.valueImpact))}`}
              accent={isNeg ? "red" : "green"}
            />
            <MetricTile
              label="% Change"
              value={`${isNeg ? "−" : "+"}${Math.abs(liveScenario.pctChange).toFixed(1)}%`}
              accent={isNeg ? "red" : "green"}
            />
            <MetricTile label="Current EBITDA" value={fmtDollar(liveScenario.currentEbitda)} />
            <MetricTile label="New EBITDA" value={fmtDollar(liveScenario.newEbitda)} />
            <MetricTile
              label="EBITDA Change"
              value={`${liveScenario.ebitdaChange >= 0 ? "+" : "−"}${fmtDollar(Math.abs(liveScenario.ebitdaChange))}`}
              accent={liveScenario.ebitdaChange >= 0 ? "green" : "red"}
            />
            <MetricTile
              label="Current DSCR"
              value={
                liveScenario.baselineDscr != null
                  ? fmtMultiple(liveScenario.baselineDscr)
                  : "—"
              }
            />
            <MetricTile
              label="New DSCR"
              value={
                liveScenario.newDscr != null ? fmtMultiple(liveScenario.newDscr) : "—"
              }
              accent={
                liveScenario.newDscr != null && liveScenario.newDscr < 1.25
                  ? "red"
                  : undefined
              }
            />
            <MetricTile
              label="Monthly Cash Flow"
              value={`${liveScenario.monthlyCashFlowImpact >= 0 ? "+" : "−"}${fmtDollar(Math.abs(liveScenario.monthlyCashFlowImpact))}`}
              accent={liveScenario.monthlyCashFlowImpact >= 0 ? "green" : "red"}
            />
            {isInvestmentScenario(selectedId) && (
              <>
                <MetricTile
                  label="Payback Period"
                  value={formatPayback(liveScenario.paybackMonths)}
                />
                <MetricTile
                  label="Break-even Timeline"
                  value={
                    liveScenario.breakEvenMonths != null
                      ? `${Math.round(liveScenario.breakEvenMonths)} mo`
                      : "—"
                  }
                />
              </>
            )}
          </div>

          {/* Narrative */}
          <div
            className={clsx(
              "p-3 rounded-lg text-[12px] leading-relaxed",
              isNeg
                ? "bg-red-500/8 border border-red-500/20 text-red-300"
                : "bg-green-500/8 border border-green-500/20 text-green-300"
            )}
          >
            {narrative}
          </div>
        </div>
      </div>

      {/* Section 5 — Saved Scenarios */}
      {savedScenarios.length > 0 && (
        <section className="card">
          <button
            type="button"
            onClick={() => setSavedExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              Saved Scenarios ({savedScenarios.length})
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {savedExpanded ? "Collapse ▲" : "Expand ▼"}
            </span>
          </button>
          {savedExpanded && (
            <div className="mt-4 space-y-2">
              {savedScenarios.map((saved) => (
                <SavedScenarioItem
                  key={saved.id}
                  saved={saved}
                  onDelete={() => handleDeleteSaved(saved.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MetricTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "red";
}) {
  return (
    <div
      className={clsx(
        "card2",
        accent === "green" && "border-green-500/20",
        accent === "red" && "border-red-500/20"
      )}
    >
      <div className="metric-label">{label}</div>
      <div
        className={clsx(
          "text-[14px] font-bold tabular-nums",
          accent === "green" && "text-green-400",
          accent === "red" && "text-red-400",
          !accent && "text-[var(--text-primary)]"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ComparePanel({
  scenarioA,
  scenarioB,
  compareA,
  compareB,
  onCompareAChange,
  onCompareBChange,
  scenarios,
}: {
  scenarioA: InteractiveScenarioResult;
  scenarioB: InteractiveScenarioResult;
  compareA: string;
  compareB: string;
  onCompareAChange: (id: string) => void;
  onCompareBChange: (id: string) => void;
  scenarios: InteractiveScenarioResult[];
}) {
  const rows: { label: string; a: string; b: string }[] = [
    {
      label: "Investment Required",
      a:
        scenarioA.investmentRequired != null
          ? fmtDollar(scenarioA.investmentRequired)
          : "—",
      b:
        scenarioB.investmentRequired != null
          ? fmtDollar(scenarioB.investmentRequired)
          : "—",
    },
    {
      label: "Value Impact",
      a: `${scenarioA.valueImpact >= 0 ? "+" : "−"}${fmtDollar(Math.abs(scenarioA.valueImpact))}`,
      b: `${scenarioB.valueImpact >= 0 ? "+" : "−"}${fmtDollar(Math.abs(scenarioB.valueImpact))}`,
    },
    {
      label: "New Store Value",
      a: fmtDollar(scenarioA.scenarioValue),
      b: fmtDollar(scenarioB.scenarioValue),
    },
    {
      label: "EBITDA Impact",
      a: `${scenarioA.ebitdaChange >= 0 ? "+" : "−"}${fmtDollar(Math.abs(scenarioA.ebitdaChange))}`,
      b: `${scenarioB.ebitdaChange >= 0 ? "+" : "−"}${fmtDollar(Math.abs(scenarioB.ebitdaChange))}`,
    },
    {
      label: "New DSCR",
      a: scenarioA.newDscr != null ? fmtMultiple(scenarioA.newDscr) : "—",
      b: scenarioB.newDscr != null ? fmtMultiple(scenarioB.newDscr) : "—",
    },
    {
      label: "Payback Period",
      a: formatPayback(scenarioA.paybackMonths),
      b: formatPayback(scenarioB.paybackMonths),
    },
    {
      label: "Monthly Cash Flow Impact",
      a: `${scenarioA.monthlyCashFlowImpact >= 0 ? "+" : "−"}${fmtDollar(Math.abs(scenarioA.monthlyCashFlowImpact))}`,
      b: `${scenarioB.monthlyCashFlowImpact >= 0 ? "+" : "−"}${fmtDollar(Math.abs(scenarioB.monthlyCashFlowImpact))}`,
    },
  ];

  return (
    <section className="card">
      <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">
        Side-by-Side Comparison
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <select
          value={compareA}
          onChange={(e) => onCompareAChange(e.target.value)}
          className="text-[12px] bg-[var(--bg-card2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-primary)]"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          value={compareB}
          onChange={(e) => onCompareBChange(e.target.value)}
          className="text-[12px] bg-[var(--bg-card2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-primary)]"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 text-[var(--text-secondary)] font-medium">
                Metric
              </th>
              <th className="text-right py-2 text-[var(--text-primary)] font-semibold">
                <span className="inline-flex items-center justify-end gap-1.5">
                  <ScenarioIcon name={scenarioA.icon} />
                  {scenarioA.title}
                </span>
              </th>
              <th className="text-right py-2 text-[var(--text-primary)] font-semibold">
                <span className="inline-flex items-center justify-end gap-1.5">
                  <ScenarioIcon name={scenarioB.icon} />
                  {scenarioB.title}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2.5 text-[var(--text-secondary)]">{row.label}</td>
                <td className="py-2.5 text-right font-semibold text-[var(--text-primary)] tabular-nums">
                  {row.a}
                </td>
                <td className="py-2.5 text-right font-semibold text-[var(--text-primary)] tabular-nums">
                  {row.b}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SavedScenarioItem({
  saved,
  onDelete,
}: {
  saved: SavedScenarioRow;
  onDelete: () => void;
}) {
  const outputs = saved.outputs as {
    valueImpact?: number;
    scenarioValue?: number;
    newEbitda?: number;
  };
  const impact = outputs.valueImpact ?? 0;
  const neg = impact < 0;

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--bg-card2)] border border-[var(--border)]">
      <div>
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">
          {saved.scenario_name}
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
          {new Date(saved.created_at).toLocaleDateString()} · Value{" "}
          {outputs.scenarioValue != null ? fmtDollar(outputs.scenarioValue) : "—"} · EBITDA{" "}
          {outputs.newEbitda != null ? fmtDollar(outputs.newEbitda) : "—"}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className={clsx(
            "text-[13px] font-bold tabular-nums",
            neg ? "text-red-400" : "text-green-400"
          )}
        >
          {neg ? "−" : "+"}
          {fmtDollar(Math.abs(impact))}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="text-[10px] text-[var(--text-secondary)] hover:text-red-400"
        >
          Delete
        </button>
      </div>
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
        <label className="text-[11px] text-[var(--text-muted)]">{label}</label>
        <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums">
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
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
          {format(min)}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
          {format(max)}
        </span>
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
  rank,
  active,
  onSelect,
}: {
  scenario: InteractiveScenarioResult;
  rank: number;
  active: boolean;
  onSelect: () => void;
}) {
  const neg = scenario.valueImpact < 0;
  const neutral = scenario.valueImpact === 0;
  const isRisk = scenario.id === "commercial" || scenario.id === "rent";

  const borderClass = neutral
    ? "border-gray-400/30"
    : neg
      ? "border-red-500/50"
      : "border-green-500/50";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "card text-left transition-all border-2 relative",
        borderClass,
        active && "ring-2 ring-blue-500/50 bg-blue-500/5",
        !active && "hover:border-blue-500/40"
      )}
    >
      {rank > 0 && (
        <span
          className={clsx(
            "absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded",
            rank <= 3 && !neg
              ? "bg-amber-500/15 text-[var(--text-warning)]"
              : "bg-[var(--bg-card2)] text-[var(--text-secondary)]"
          )}
        >
          {formatRank(rank)}
        </span>
      )}

      <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)] pr-10">
        <ScenarioIcon name={scenario.icon} size={16} />
        {scenario.title}
      </div>
      <div className="text-[11px] text-[var(--text-muted)] mt-1">
        {scenario.description}
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--border)]">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
          Value Impact
        </div>
        <div
          className={clsx(
            "text-[18px] font-bold mt-0.5 tabular-nums",
            neg || isRisk ? "text-red-400" : "text-green-400"
          )}
        >
          {neg ? "−" : neutral ? "" : "+"}
          {fmtDollar(Math.abs(scenario.valueImpact))}
        </div>

        {isInvestmentScenario(scenario.id) && scenario.paybackMonths != null && (
          <div className="text-[11px] text-[var(--text-secondary)] mt-1.5">
            Payback: {formatPayback(scenario.paybackMonths)}
          </div>
        )}

        {(scenario.id === "rent" || scenario.id === "commercial") && neg && (
          <div className="text-[10px] text-red-400/80 mt-1">
            Downside risk scenario
          </div>
        )}
      </div>
    </button>
  );
}
