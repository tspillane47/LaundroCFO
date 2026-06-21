"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { invalidateValuationCache } from "@/lib/getStoreValuation";
import { syncEquipmentToStoreCache, resolveSquareFootage } from "@/lib/storeCanonical";
import { useStores } from "@/lib/store-context";
import { toBool, toNum, toNullableText } from "@/lib/formHelpers";
import {
  sortRecordsDesc,
  enrichMonthlyRecords,
  buildUtilitiesLookup,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
} from "@/lib/financials";
import { MetricCard } from "@/components/ui/MetricCard";
import { INPUT_CLASS, preventEnterSubmit } from "@/components/occupancy/shared";
import {
  MANUFACTURERS,
  WASHER_SIZES,
  DRYER_SIZES,
  CONDITIONS,
  DEFAULT_DRYER_REVENUE_PCT,
  type EquipmentRecord,
  type MachineType,
  type MachineCondition,
  computeEquipmentMetrics,
  turnsPerDayColor,
  ageColor,
  avgAgeColor,
  gradeColor,
  adjustmentColor,
  formatAdjustment,
} from "@/lib/equipment";
import { fmtDollar } from "@/lib/calculations";
import { FormBanner } from "@/components/ui/FormBanner";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { PageError } from "@/components/ui/PageError";

type Store = {
  id: string;
  name: string | null;
  monthly_revenue: number | null;
  monthly_expenses: number | null;
  dryer_revenue_pct: number | null;
  occupancy_type: string | null;
  square_footage: number | null;
};

type TtmFinancialSnapshot = {
  ttmSelfServiceRevenue: number;
  ttmRevenue: number;
  monthsUsed: number;
};

type EquipmentForm = {
  machine_type: MachineType;
  manufacturer: string;
  machine_size: string;
  quantity: string;
  installation_year: string;
  high_speed_extract: boolean;
  condition: MachineCondition;
  notes: string;
  avg_vend_price: string;
};

const EMPTY_FORM: EquipmentForm = {
  machine_type: "Washer",
  manufacturer: "Speed Queen",
  machine_size: "30lb",
  quantity: "1",
  installation_year: String(new Date().getFullYear() - 5),
  high_speed_extract: false,
  condition: "Good",
  notes: "",
  avg_vend_price: "",
};

function fmtVendPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div>
      <label className="block text-[11px] text-slate-500 mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function EquipmentPage() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedStore, refreshStores } = useStores();
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [ttmFinancials, setTtmFinancials] = useState<TtmFinancialSnapshot | null>(null);
  const [squareFootage, setSquareFootage] = useState<number | null>(null);
  const [dryerRevenuePct, setDryerRevenuePct] = useState(DEFAULT_DRYER_REVENUE_PCT);
  const [savingDryerPct, setSavingDryerPct] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EquipmentForm>(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      if (!selectedStore?.id) {
        setMessage({ type: "error", text: "Select a store from the dropdown above." });
      setStore(null);
      setEquipment([]);
      setTtmFinancials(null);
      setSquareFootage(null);
      return;
      }

      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .select("id, name, monthly_revenue, monthly_expenses, dryer_revenue_pct, occupancy_type, square_footage")
        .eq("id", selectedStore.id)
        .single();
      if (storeError) throw storeError;
      if (!storeData) throw new Error("No store found");
      setStore(storeData);

      const storeDryerPct =
        storeData.dryer_revenue_pct != null
          ? Number(storeData.dryer_revenue_pct)
          : DEFAULT_DRYER_REVENUE_PCT;
      setDryerRevenuePct(storeDryerPct);

      const [{ data: equipmentData, error: equipmentError }, { data: financialsData }, { data: utilitiesData }, { data: leaseData }, { data: realEstateData }] =
        await Promise.all([
          supabase
            .from("equipment_inventory")
            .select("*")
            .eq("user_id", user.id)
            .eq("store_id", storeData.id)
            .order("machine_type", { ascending: true })
            .order("installation_year", { ascending: false }),
          supabase
            .from("monthly_financials")
            .select("year, month, revenue, self_service_revenue")
            .eq("store_id", storeData.id)
            .order("year", { ascending: false })
            .order("month", { ascending: false }),
          supabase
            .from("monthly_utilities")
            .select("year, month, water, gas, electric, sewer, trash, internet")
            .eq("store_id", storeData.id),
          supabase.from("leases").select("square_footage").eq("store_id", storeData.id).maybeSingle(),
          supabase
            .from("real_estate")
            .select("laundromat_square_footage, total_square_footage")
            .eq("store_id", storeData.id)
            .maybeSingle(),
        ]);

      if (equipmentError) throw equipmentError;

      setEquipment((equipmentData ?? []) as EquipmentRecord[]);

      const sqft = resolveSquareFootage(storeData, leaseData, realEstateData);
      setSquareFootage(sqft);

      if (financialsData && financialsData.length > 0) {
        const utilitiesLookup = buildUtilitiesLookup((utilitiesData ?? []) as MonthlyUtilityRecord[]);
        const records = enrichMonthlyRecords(
          sortRecordsDesc(financialsData as MonthlyFinancialRecord[]),
          utilitiesLookup
        );
        const ttmRecords = records.slice(0, 12);
        const monthsUsed = ttmRecords.length;
        setTtmFinancials({
          ttmSelfServiceRevenue: ttmRecords.reduce(
            (sum, r) => sum + (r.self_service_revenue ?? 0),
            0
          ),
          ttmRevenue: ttmRecords.reduce((sum, r) => sum + (r.revenue ?? 0), 0),
          monthsUsed,
        });
      } else {
        setTtmFinancials(null);
      }
    } catch {
      setLoadError(true);
      setStore(null);
      setEquipment([]);
      setTtmFinancials(null);
      setSquareFootage(null);
    } finally {
      setLoading(false);
    }
  }, [router, supabase, selectedStore?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(
    () =>
      computeEquipmentMetrics(equipment, currentYear, {
        selfServiceTtmRevenue: ttmFinancials?.ttmSelfServiceRevenue,
        dryerRevenuePct,
      }),
    [equipment, currentYear, ttmFinancials?.ttmSelfServiceRevenue, dryerRevenuePct]
  );

  const turns = metrics.turns ?? null;
  const hasSelfServiceTtm =
    (ttmFinancials?.ttmSelfServiceRevenue ?? 0) > 0 && (ttmFinancials?.monthsUsed ?? 0) > 0;

  const annualizedSelfServiceRevenue = useMemo(() => {
    if (!ttmFinancials || ttmFinancials.monthsUsed === 0) return 0;
    return (ttmFinancials.ttmSelfServiceRevenue / ttmFinancials.monthsUsed) * 12;
  }, [ttmFinancials]);

  const annualizedTotalRevenue = useMemo(() => {
    if (!ttmFinancials || ttmFinancials.monthsUsed === 0) return 0;
    return (ttmFinancials.ttmRevenue / ttmFinancials.monthsUsed) * 12;
  }, [ttmFinancials]);

  const revenuePerMachine = useMemo(() => {
    if (!hasSelfServiceTtm || metrics.totalMachines === 0) return null;
    return annualizedSelfServiceRevenue / metrics.totalMachines;
  }, [hasSelfServiceTtm, annualizedSelfServiceRevenue, metrics.totalMachines]);

  const revenuePerSF = useMemo(() => {
    if (!ttmFinancials || !squareFootage || squareFootage <= 0) return null;
    return annualizedTotalRevenue / squareFootage;
  }, [ttmFinancials, squareFootage, annualizedTotalRevenue]);

  const annualEbitda = useMemo(() => {
    if (!store) return 0;
    const revenue = store.monthly_revenue ?? 0;
    const expenses = store.monthly_expenses ?? 0;
    return (revenue - expenses) * 12;
  }, [store]);

  const valuationImpactDollars = metrics.totalEquipmentAdjustment * annualEbitda;

  function updateForm(field: keyof EquipmentForm, value: string | boolean) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "machine_type") {
        const type = value as MachineType;
        next.machine_size = type === "Washer" ? "30lb" : "30lb Stack";
        if (type === "Dryer") {
          next.high_speed_extract = false;
          next.avg_vend_price = "";
        }
      }
      return next;
    });
  }

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveStatus("idle");
    setShowForm(true);
  }

  function openEditForm(item: EquipmentRecord) {
    setEditingId(item.id);
    setForm({
      machine_type: item.machine_type,
      manufacturer: item.manufacturer,
      machine_size: item.machine_size,
      quantity: String(item.quantity),
      installation_year: String(item.installation_year),
      high_speed_extract: item.high_speed_extract ?? false,
      condition: item.condition,
      notes: item.notes ?? "",
      avg_vend_price:
        item.avg_vend_price != null && item.avg_vend_price > 0 ? String(item.avg_vend_price) : "",
    });
    setSaveStatus("idle");
    setShowForm(true);
  }

  async function persistDryerRevenuePct(pct: number) {
    if (!store || savingDryerPct) return;
    setSavingDryerPct(true);

    const { error } = await supabase
      .from("stores")
      .update({ dryer_revenue_pct: pct })
      .eq("id", store.id);

    if (error) {
      setMessage({ type: "error", text: "We couldn't save dryer revenue estimate." });
    } else {
      setStore((prev) => (prev ? { ...prev, dryer_revenue_pct: pct } : prev));
      await refreshStores();
    }
    setSavingDryerPct(false);
  }

  function handleDryerSliderRelease() {
    void persistDryerRevenuePct(dryerRevenuePct);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!store || !userId || saving || saveStatus === "success") return;

    const quantity = toNum(form.quantity);
    const installationYear = toNum(form.installation_year);

    if (quantity < 1) {
      setMessage({ type: "error", text: "Quantity must be at least 1." });
      return;
    }
    if (!installationYear || installationYear < 1980 || installationYear > currentYear) {
      setMessage({ type: "error", text: `Installation year must be between 1980 and ${currentYear}.` });
      return;
    }

    setSaving(true);
    setSaveStatus("idle");
    setMessage(null);

    try {
      const payload = {
        user_id: userId,
        store_id: store.id,
        machine_type: form.machine_type,
        manufacturer: form.manufacturer,
        machine_size: form.machine_size,
        quantity,
        installation_year: installationYear,
        high_speed_extract: form.machine_type === "Washer" ? toBool(form.high_speed_extract) : false,
        condition: form.condition,
        notes: toNullableText(form.notes),
        avg_vend_price:
          form.machine_type === "Washer" && form.avg_vend_price.trim()
            ? toNum(form.avg_vend_price)
            : null,
      };

      const { error: saveError } = editingId
        ? await supabase.from("equipment_inventory").update(payload).eq("id", editingId)
        : await supabase.from("equipment_inventory").insert(payload);

      if (saveError) {
        console.error("Equipment save error:", saveError);
        setSaveStatus("error");
        setMessage({ type: "error", text: "We couldn't save this. Please try again." });
        setSaving(false);
        return;
      }

      invalidateValuationCache(store.id);
      await syncEquipmentToStoreCache(store.id, supabase);
      await refreshStores();
      setSaveStatus("success");
      setMessage({ type: "success", text: "Saved successfully." });
      setTimeout(() => {
        setMessage(null);
        setSaveStatus("idle");
      }, 3000);
      closeForm();
      setSaving(false);
      await loadData();
    } catch (err) {
      console.error("Unexpected equipment save error:", err);
      setSaveStatus("error");
      setMessage({ type: "error", text: "We couldn't save this. Please try again." });
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this machine group? This cannot be undone.")) return;

    setMessage(null);
    const { error: deleteError } = await supabase.from("equipment_inventory").delete().eq("id", id);
    if (deleteError) {
      setMessage({ type: "error", text: "We couldn't save this. Please try again." });
      return;
    }
    if (editingId === id) closeForm();
    if (store) {
      await syncEquipmentToStoreCache(store.id, supabase);
      invalidateValuationCache(store.id);
      await refreshStores();
    }
    await loadData();
  }

  const sizeOptions = form.machine_type === "Washer" ? WASHER_SIZES : DRYER_SIZES;

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">Equipment Inventory</h1>
          <p className="text-slate-500 text-[13px] mt-0.5">
            Fleet tracking, age analysis, and valuation impact for {store?.name ?? "your store"}
          </p>
        </div>
        <button type="button" onClick={openAddForm} className="btn-primary text-[13px] py-2 px-4 flex-shrink-0">
          + Add Machine Group
        </button>
      </div>

      <FormBanner message={message} />

      {/* Section 1 — Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 grid-4">
        <MetricCard label="Total Washers" value={String(metrics.totalWashers)} sub="Front-load fleet" />
        <MetricCard label="Total Dryers" value={String(metrics.totalDryers)} sub="Dryer fleet" />
        <div className="card overflow-hidden min-w-0">
          <div className="metric-label">Weighted Avg Age</div>
          <div className={clsx("metric-value", avgAgeColor(metrics.weightedAvgAge))}>
            {metrics.weightedAvgAge.toFixed(1)} yrs
          </div>
          <div className="text-[12px] mt-1 text-slate-500">
            {metrics.weightedAvgAge < 8
              ? "Modern fleet"
              : metrics.weightedAvgAge < 12
                ? "Aging — monitor capex"
                : "Replacement risk"}
          </div>
        </div>
        <div className="card overflow-hidden min-w-0">
          <div className="metric-label">Equipment Quality Score</div>
          <div className="flex items-center gap-2 min-w-0">
            <div className={clsx("metric-value min-w-0", gradeColor(metrics.grade))}>
              Grade {metrics.grade}
            </div>
            <span className="text-[12px] text-slate-500 shrink-0">({metrics.qualityScore}/100)</span>
          </div>
          <div className="progress-bar mt-2">
            <div
              className={clsx(
                "h-full rounded-full",
                metrics.grade === "A"
                  ? "bg-green-500"
                  : metrics.grade === "B"
                    ? "bg-blue-500"
                    : metrics.grade === "C"
                      ? "bg-amber-500"
                      : "bg-red-500"
              )}
              style={{ width: `${metrics.qualityScore}%` }}
            />
          </div>
        </div>
        <MetricCard
          label="Est. Replacement Value"
          value={fmtDollar(metrics.estimatedReplacementValue)}
          sub="Full fleet replacement"
        />
        <div className="card overflow-hidden min-w-0">
          <div className="metric-label">Valuation Impact</div>
          <div
            className={clsx("metric-value", adjustmentColor(metrics.totalEquipmentAdjustment))}
            title={formatAdjustment(metrics.totalEquipmentAdjustment)}
          >
            {formatAdjustment(metrics.totalEquipmentAdjustment)}
          </div>
          <div className="text-[12px] mt-1 text-slate-500">EBITDA multiple adjustment</div>
        </div>
      </div>

      {/* Operating Metrics */}
      <div className="card">
        <div className="section-title mb-4">Operating Metrics</div>
        {!hasSelfServiceTtm ? (
          <p className="text-[13px] text-slate-500">
            Enter financials to calculate operating metrics.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card2 min-w-0">
                <div className="metric-label">Revenue Per Machine</div>
                <div className="text-[18px] font-bold text-slate-100 tabular-nums">
                  {revenuePerMachine != null ? fmtDollar(revenuePerMachine) : "—"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Self-service, annualized</div>
              </div>
              <div className="card2 min-w-0">
                <div className="metric-label">Revenue Per SF</div>
                <div className="text-[18px] font-bold text-slate-100 tabular-nums">
                  {revenuePerSF != null ? fmtDollar(revenuePerSF) : "—"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Total revenue, annualized</div>
              </div>
              <div className="card2 min-w-0">
                <div className="metric-label">Washer Revenue</div>
                <div className="text-[18px] font-bold text-blue-300 tabular-nums">
                  {turns ? fmtDollar(turns.washerRevenue) : "—"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Backed out of self-service TTM</div>
              </div>
              <div className="card2 min-w-0">
                <div className="metric-label">Dryer Revenue</div>
                <div className="text-[18px] font-bold text-purple-300 tabular-nums">
                  {turns ? fmtDollar(turns.dryerRevenue) : "—"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {turns && turns.dryerRevenuePct === 0
                    ? "Free dry store"
                    : turns
                      ? `${turns.dryerRevenuePct.toFixed(1)}% of washer revenue`
                      : "Estimated split"}
                </div>
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <div className="space-y-3 mb-4">
                <div className="flex flex-wrap items-center gap-2">
                  {dryerRevenuePct === 0 ? (
                    <span className="text-[12px] font-medium text-slate-300">Free dry store</span>
                  ) : (
                    <span className="text-[12px] font-medium text-slate-300">Dryer revenue estimate</span>
                  )}
                  <span className="text-[18px] font-bold text-slate-100 tabular-nums">
                    {dryerRevenuePct.toFixed(1)}%
                  </span>
                  {dryerRevenuePct === 0 && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-green-400 bg-green-500/10 border border-green-500/20 rounded px-2 py-0.5">
                      Free dry store
                    </span>
                  )}
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={0.5}
                  value={dryerRevenuePct}
                  disabled={savingDryerPct}
                  onChange={(e) => setDryerRevenuePct(Number(e.target.value))}
                  onMouseUp={handleDryerSliderRelease}
                  onTouchEnd={handleDryerSliderRelease}
                  className="w-full h-2 accent-blue-500 cursor-pointer disabled:opacity-50"
                />
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>0%</span>
                  <span className="text-slate-500">Dryer revenue as % of washer revenue</span>
                  <span>60%</span>
                </div>
              </div>

              {!turns || turns.missingVendPrices ? (
                <p className="text-[13px] text-amber-400/90 mb-4">
                  Add vend prices to machine groups to calculate turns per day.
                </p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="card2 min-w-0">
                    <div className="metric-label">Average Turns Per Day</div>
                    <div
                      className={clsx(
                        "text-[22px] font-bold tabular-nums",
                        turns.overallTurnsPerDay != null
                          ? turnsPerDayColor(turns.overallTurnsPerDay)
                          : "text-slate-400"
                      )}
                    >
                      {turns.overallTurnsPerDay != null ? turns.overallTurnsPerDay.toFixed(2) : "—"}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Fleet-wide washer utilization</div>
                  </div>
                  <div className="card2 min-w-0 lg:col-span-2">
                    <div className="metric-label mb-2">Turns by Size</div>
                    {turns.bySize.length === 0 ? (
                      <div className="text-[12px] text-slate-500">No washer groups with vend prices.</div>
                    ) : (
                      <div className="space-y-2">
                        {turns.bySize.map((group) => (
                          <div
                            key={group.size}
                            className="flex items-center justify-between text-[12px] gap-3"
                          >
                            <span className="text-slate-400">
                              {group.size} · {group.quantity} machines · {fmtDollar(group.avgVendPrice)} vend
                            </span>
                            <span
                              className={clsx(
                                "font-semibold tabular-nums shrink-0",
                                turnsPerDayColor(group.turnsPerDay)
                              )}
                            >
                              {group.turnsPerDay.toFixed(2)}/day
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="card2 min-w-0">
                    <div className="metric-label">Average Vend Price</div>
                    <div className="text-[18px] font-bold text-slate-100 tabular-nums">
                      {turns.weightedAvgVendPrice != null
                        ? fmtDollar(turns.weightedAvgVendPrice)
                        : "—"}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Quantity-weighted washers</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Section 2 — Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column — 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          {/* Age Distribution */}
          <div className="card">
            <div className="section-title">Age Distribution</div>
            {metrics.totalMachines === 0 ? (
              <div className="text-[13px] text-slate-500 py-4">Add equipment to see age distribution.</div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {metrics.ageBuckets.map((bucket) => (
                  <div key={bucket.label} className="flex items-center gap-3 py-3">
                    <div className="text-[12px] text-slate-400 w-28 flex-shrink-0">{bucket.label}</div>
                    <div className="flex-1 h-2 bg-[#243347] rounded-full overflow-hidden">
                      <div
                        className={clsx("h-full rounded-full transition-all", bucket.color)}
                        style={{ width: `${Math.max(bucket.pct, bucket.count > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <div className={clsx("text-[12px] font-semibold w-36 text-right", bucket.textColor)}>
                      {bucket.pct.toFixed(0)}% ({bucket.count} machines)
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Equipment Inventory */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title mb-0">Equipment Inventory</div>
              <button type="button" onClick={openAddForm} className="btn-primary text-[12px] py-1.5 px-3">
                Add Machine Group
              </button>
            </div>

            {equipment.length === 0 && !showForm ? (
              <div className="text-center py-12">
                <div className="text-[15px] font-semibold text-slate-200 mb-2">No equipment added yet</div>
                <div className="text-[13px] text-slate-500 mb-6 max-w-sm mx-auto">
                  Add your washer and dryer fleet to track age, quality score, and valuation impact.
                </div>
                <button type="button" onClick={openAddForm} className="btn-primary px-8 py-3 text-[14px]">
                  + Add Machine Group
                </button>
              </div>
            ) : (
              <div className="table-scroll overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.06]">
                      <th className="text-left pb-2 font-medium">Type</th>
                      <th className="text-left pb-2 font-medium">Manufacturer</th>
                      <th className="text-left pb-2 font-medium">Size</th>
                      <th className="text-left pb-2 font-medium">Vend Price</th>
                      <th className="text-left pb-2 font-medium">Qty</th>
                      <th className="text-left pb-2 font-medium">Year</th>
                      <th className="text-left pb-2 font-medium">Age</th>
                      <th className="text-center pb-2 font-medium">200G</th>
                      <th className="text-left pb-2 font-medium">Condition</th>
                      <th className="text-right pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {equipment.map((item) => {
                      const age = currentYear - item.installation_year;
                      return (
                        <tr key={item.id}>
                          <td className="py-2.5 text-slate-300">{item.machine_type}</td>
                          <td className="py-2.5 text-slate-400">{item.manufacturer}</td>
                          <td className="py-2.5 text-slate-400">{item.machine_size}</td>
                          <td className="py-2.5 text-slate-400">
                            {item.machine_type === "Dryer" ? (
                              "—"
                            ) : item.avg_vend_price != null && item.avg_vend_price > 0 ? (
                              fmtVendPrice(item.avg_vend_price)
                            ) : (
                              <span
                                className="text-amber-400 cursor-help"
                                title="Add vend price to calculate turns per day"
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-slate-400">{item.quantity}</td>
                          <td className="py-2.5 text-slate-400">{item.installation_year}</td>
                          <td className={clsx("py-2.5 font-semibold", ageColor(age))}>{age} yr</td>
                          <td className="py-2.5 text-center text-slate-400">
                            {item.machine_type === "Washer" && item.high_speed_extract ? (
                              <span className="text-green-400">✓</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 text-slate-400">{item.condition}</td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditForm(item)}
                                className="btn-outline text-[11px] py-1 px-2"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="btn-outline text-[11px] py-1 px-2 text-red-400 border-red-500/20 hover:bg-red-500/10"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {equipment.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-white/[0.08]">
                        <td className="pt-3 text-slate-400 font-semibold" colSpan={9}>
                          Total Replacement Cost
                        </td>
                        <td className="pt-3 text-right text-slate-100 font-bold">
                          {fmtDollar(metrics.estimatedReplacementValue)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Section 3 — Add/Edit form */}
            {showForm && (
              <div className="mt-5 pt-5 border-t border-white/[0.08]">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[13px] font-semibold text-slate-200">
                    {editingId ? "Edit Machine Group" : "Add Machine Group"}
                  </div>
                  <button type="button" onClick={closeForm} className="btn-outline text-[11px]">
                    Cancel
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SelectField
                    label="Machine Type"
                    value={form.machine_type}
                    onChange={(v) => updateForm("machine_type", v)}
                    options={["Washer", "Dryer"]}
                  />
                  <SelectField
                    label="Manufacturer"
                    value={form.manufacturer}
                    onChange={(v) => updateForm("manufacturer", v)}
                    options={MANUFACTURERS}
                  />
                  <SelectField
                    label="Machine Size"
                    value={form.machine_size}
                    onChange={(v) => updateForm("machine_size", v)}
                    options={sizeOptions}
                  />
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={(e) => updateForm("quantity", e.target.value)}
                      onKeyDown={preventEnterSubmit}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">Installation Year</label>
                    <input
                      type="number"
                      min={1980}
                      max={currentYear}
                      value={form.installation_year}
                      onChange={(e) => updateForm("installation_year", e.target.value)}
                      onKeyDown={preventEnterSubmit}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <SelectField
                    label="Condition"
                    value={form.condition}
                    onChange={(v) => updateForm("condition", v)}
                    options={CONDITIONS}
                  />
                  {form.machine_type === "Washer" && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1.5">
                        Average Vend Price ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.25}
                        value={form.avg_vend_price}
                        onChange={(e) => updateForm("avg_vend_price", e.target.value)}
                        onKeyDown={preventEnterSubmit}
                        className={INPUT_CLASS}
                        placeholder="e.g. 4.50"
                      />
                      {!form.avg_vend_price.trim() && (
                        <p className="text-[11px] text-amber-400/90 mt-1">
                          Vend price needed for turns per day calculation
                        </p>
                      )}
                    </div>
                  )}
                  {form.machine_type === "Washer" && (
                    <div className="flex items-center gap-2 pt-6">
                      <input
                        id="high_speed_extract"
                        type="checkbox"
                        checked={form.high_speed_extract}
                        onChange={(e) => updateForm("high_speed_extract", e.target.checked)}
                        className="rounded border-white/20 bg-[#1e2a3a]"
                      />
                      <label htmlFor="high_speed_extract" className="text-[13px] text-slate-300">
                        High Speed Extract (200G+)
                      </label>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1.5">Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => updateForm("notes", e.target.value)}
                      onKeyDown={preventEnterSubmit}
                      className={clsx(INPUT_CLASS, "min-h-[80px] resize-y")}
                      placeholder="Optional notes about this machine group..."
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || saveStatus === "success"}
                    className="btn-primary py-2 px-5 text-[13px]"
                  >
                    {saveStatus === "success"
                      ? "Saved ✓"
                      : saving
                        ? "Saving..."
                        : editingId
                          ? "Update Machine Group"
                          : "Save Machine Group"}
                  </button>
                  <button type="button" onClick={closeForm} className="btn-outline py-2 px-5 text-[13px]">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column — 1/3 */}
        <div className="space-y-4">
          {/* Valuation Impact */}
          <div className="card">
            <div className="section-title">Valuation Impact</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-400">Base equipment adjustment</span>
                <span className={clsx("font-semibold", adjustmentColor(metrics.baseEquipmentAdjustment))}>
                  {formatAdjustment(metrics.baseEquipmentAdjustment)}
                </span>
              </div>
              {metrics.bonus200GAdjustment > 0 && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-slate-400">200G bonus</span>
                  <span className="font-semibold text-green-400">+0.10x</span>
                </div>
              )}
              <div className="border-t border-white/[0.08] pt-3 flex items-center justify-between text-[13px]">
                <span className="text-slate-200 font-medium">Total equipment adjustment</span>
                <span className={clsx("font-bold text-[15px]", adjustmentColor(metrics.totalEquipmentAdjustment))}>
                  {formatAdjustment(metrics.totalEquipmentAdjustment)}
                </span>
              </div>
              <div className="card2">
                <div className="metric-label">Impact on Store Value</div>
                <div
                  className={clsx(
                    "text-[20px] font-bold",
                    valuationImpactDollars >= 0 ? "text-green-400" : "text-red-400"
                  )}
                >
                  {valuationImpactDollars >= 0 ? "+" : "−"}
                  {fmtDollar(Math.abs(valuationImpactDollars))}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {formatAdjustment(metrics.totalEquipmentAdjustment)} × {fmtDollar(annualEbitda)} EBITDA
                </div>
              </div>

              {/* Visual indicator */}
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-slate-600 mb-1">
                  <span>−0.50x</span>
                  <span>0.00x</span>
                  <span>+0.60x</span>
                </div>
                <div className="relative h-2 bg-[#243347] rounded-full">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                  <div
                    className={clsx(
                      "absolute top-0 h-full w-2 rounded-full",
                      metrics.totalEquipmentAdjustment >= 0 ? "bg-green-500" : "bg-red-500"
                    )}
                    style={{
                      left: `${Math.min(98, Math.max(2, ((metrics.totalEquipmentAdjustment + 0.5) / 1.1) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Equipment Mix */}
          <div className="card">
            <div className="section-title">Equipment Mix</div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="card2 text-center">
                <div className="metric-label">Washers</div>
                <div className="text-[28px] font-bold text-blue-300">{metrics.totalWashers}</div>
              </div>
              <div className="card2 text-center">
                <div className="metric-label">Dryers</div>
                <div className="text-[28px] font-bold text-purple-300">{metrics.totalDryers}</div>
              </div>
            </div>
            {metrics.totalMachines > 0 && (
              <div className="text-[12px] text-slate-500 text-center mb-4">
                Ratio {metrics.totalWashers}:{metrics.totalDryers} washer/dryer
              </div>
            )}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="text-slate-400">200G Washers</span>
                  <span className="font-semibold text-slate-200">{metrics.pct200GWashers.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-[#243347] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${Math.min(100, metrics.pct200GWashers)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="text-slate-400">Under 10 Years</span>
                  <span className="font-semibold text-slate-200">{metrics.pctUnder10Years.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-[#243347] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(100, metrics.pctUnder10Years)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
