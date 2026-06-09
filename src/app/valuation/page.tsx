"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { calcValuation, type ValuationResult } from "@/lib/valuation";
import {
  computeEquipmentMetrics,
  formatAdjustment,
  gradeColor,
  type EquipmentRecord,
} from "@/lib/equipment";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import { INPUT_CLASS } from "@/components/occupancy/shared";

type MarketDensity = "urban" | "suburban" | "average" | "rural";
type RevenueTrend = "growing" | "stable" | "declining";
type StoreCondition = "excellent" | "good" | "fair" | "poor";
type CompetitionLevel = "protected" | "normal" | "heavy";

type StoreRow = {
  id: string;
  name: string | null;
  square_footage: number | null;
  monthly_revenue: number | null;
  monthly_expenses: number | null;
  occupancy_type: string | null;
  market_density: string | null;
  location_type: string | null;
  revenue_trend: string | null;
  store_condition: string | null;
  competition_level: string | null;
  self_service_pct: number | null;
  wdf_pct: number | null;
  commercial_pct: number | null;
  pickup_delivery_pct: number | null;
  last_retool_year: number | null;
  retool_investment: number | null;
  retool_type: string | null;
  avg_machine_age: number | null;
};

const MARKET_OPTIONS: { value: MarketDensity; label: string; adj: number }[] = [
  { value: "urban", label: "Prime Dense Urban", adj: 0.25 },
  { value: "suburban", label: "Strong Suburban", adj: 0.1 },
  { value: "average", label: "Average Small City", adj: 0 },
  { value: "rural", label: "Rural Market", adj: -0.25 },
];

const REVENUE_OPTIONS: { value: RevenueTrend; label: string }[] = [
  { value: "growing", label: "Growing" },
  { value: "stable", label: "Stable" },
  { value: "declining", label: "Declining" },
];

const CONDITION_OPTIONS: { value: StoreCondition; label: string }[] = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

const COMPETITION_OPTIONS: { value: CompetitionLevel; label: string }[] = [
  { value: "protected", label: "Protected Market" },
  { value: "normal", label: "Normal Competition" },
  { value: "heavy", label: "Heavy Competition" },
];

const RETOOL_TYPES = [
  "Full Fleet Replacement",
  "Partial Washer Upgrade",
  "Dryer Replacement",
  "Store Renovation + Equipment",
  "Other",
];

const CATEGORY_COLORS: Record<string, string> = {
  equipment: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  lease: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  market: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  operations: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  revenue_mix: "bg-green-500/15 text-green-300 border-green-500/30",
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearsRemaining(endDate: string | null): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  const now = new Date();
  return Math.max(0, (end.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function normalizeMarketDensity(raw: string | null): MarketDensity {
  const v = (raw ?? "average").toLowerCase();
  if (v === "urban" || v === "dense_urban") return "urban";
  if (v === "suburban") return "suburban";
  if (v === "rural") return "rural";
  return "average";
}

function normalizeStoreCondition(raw: string | null): StoreCondition {
  const v = (raw ?? "fair").toLowerCase();
  if (v === "excellent" || v === "remodeled") return "excellent";
  if (v === "good") return "good";
  if (v === "poor" || v === "needs_renovation") return "poor";
  return "fair";
}

function formatAdj(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(2)}x`;
}

function sumCategoryAdj(result: ValuationResult, category: string): number {
  return result.adjustments
    .filter((a) => a.category === category)
    .reduce((s, a) => s + a.value, 0);
}

function PillSelector<T extends string>({
  label,
  options,
  value,
  onChange,
  showAdj,
}: {
  label: string;
  options: { value: T; label: string; adj?: number }[];
  value: T;
  onChange: (v: T) => void;
  showAdj?: boolean;
}) {
  return (
    <div className="card">
      <div className="metric-label mb-3">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              "px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all",
              value === opt.value
                ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
                : "bg-[#1e2a3a] border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-slate-200"
            )}
          >
            {opt.label}
            {showAdj && opt.adj !== undefined && opt.adj !== 0 && (
              <span className={clsx("ml-1.5", opt.adj > 0 ? "text-green-400" : "text-red-400")}>
                ({formatAdj(opt.adj)})
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ValuationPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");

  const [marketDensity, setMarketDensity] = useState<MarketDensity>("suburban");
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrend>("stable");
  const [storeCondition, setStoreCondition] = useState<StoreCondition>("fair");
  const [competitionLevel, setCompetitionLevel] = useState<CompetitionLevel>("normal");

  const [selfServicePct, setSelfServicePct] = useState(70);
  const [wdfPct, setWdfPct] = useState(18);
  const [commercialPct, setCommercialPct] = useState(12);
  const [pickupDeliveryPct, setPickupDeliveryPct] = useState(0);

  const [lastRetoolYear, setLastRetoolYear] = useState("");
  const [retoolInvestment, setRetoolInvestment] = useState("");
  const [retoolType, setRetoolType] = useState("");

  const [annualEbitda, setAnnualEbitda] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [squareFootage, setSquareFootage] = useState(3500);
  const [isOwnerOccupied, setIsOwnerOccupied] = useState(false);
  const [realEstateValue, setRealEstateValue] = useState(0);

  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [yearsRemaining, setYearsRemaining] = useState(0);
  const [totalLeaseControl, setTotalLeaseControl] = useState(0);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const savedId = localStorage.getItem("selectedStoreId");
      let storeQuery = supabase.from("stores").select("*").eq("user_id", user.id);
      if (savedId) {
        storeQuery = storeQuery.eq("id", savedId);
      } else {
        storeQuery = storeQuery.limit(1);
      }

      const { data: storeData } = await storeQuery.single();
      if (!storeData) {
        setLoading(false);
        return;
      }

      const store = storeData as StoreRow;
      setStoreId(store.id);
      setStoreName(store.name ?? "Your Store");
      setSquareFootage(store.square_footage ?? 3500);

      setMarketDensity(
        normalizeMarketDensity(store.market_density ?? store.location_type)
      );
      setRevenueTrend((store.revenue_trend as RevenueTrend) ?? "stable");
      setStoreCondition(normalizeStoreCondition(store.store_condition));
      setCompetitionLevel((store.competition_level as CompetitionLevel) ?? "normal");

      setSelfServicePct(store.self_service_pct ?? 70);
      setWdfPct(store.wdf_pct ?? 18);
      setCommercialPct(store.commercial_pct ?? 12);
      setPickupDeliveryPct(store.pickup_delivery_pct ?? 0);

      if (store.last_retool_year) setLastRetoolYear(String(store.last_retool_year));
      if (store.retool_investment) setRetoolInvestment(String(store.retool_investment));
      if (store.retool_type) setRetoolType(store.retool_type);

      const revenue = store.monthly_revenue ?? 69250;
      const expenses = store.monthly_expenses ?? 49470;
      setMonthlyRevenue(revenue);
      setAnnualEbitda((revenue - expenses) * 12);

      const ownerOccupied = store.occupancy_type === "owner_occupied";
      setIsOwnerOccupied(ownerOccupied);

      const { data: equipmentData } = await supabase
        .from("equipment_inventory")
        .select("id, user_id, store_id, machine_type, manufacturer, machine_size, quantity, installation_year, high_speed_extract, condition, notes")
        .eq("user_id", user.id)
        .eq("store_id", store.id);

      setEquipment((equipmentData ?? []) as EquipmentRecord[]);

      if (ownerOccupied) {
        const { data: reData } = await supabase
          .from("real_estate")
          .select("estimated_value")
          .eq("store_id", store.id)
          .limit(1)
          .maybeSingle();
        setRealEstateValue(reData?.estimated_value ?? 0);
        setTotalLeaseControl(15);
        setYearsRemaining(15);
      } else {
        const { data: leaseData } = await supabase
          .from("leases")
          .select("id, lease_end_date")
          .eq("store_id", store.id)
          .limit(1)
          .maybeSingle();

        if (leaseData) {
          const remaining = calcYearsRemaining(leaseData.lease_end_date);
          setYearsRemaining(remaining);

          const { data: optionsData } = await supabase
            .from("lease_options")
            .select("option_years, status")
            .eq("lease_id", leaseData.id)
            .order("option_number", { ascending: true });

          const optionYears = (optionsData ?? [])
            .filter((o) => o.status === "Available")
            .reduce((s, o) => s + (o.option_years ?? 0), 0);
          setTotalLeaseControl(remaining + optionYears);
        } else {
          setYearsRemaining(0);
          setTotalLeaseControl(0);
        }
        setRealEstateValue(0);
      }

      setLoading(false);
    }
    load();
  }, []);

  const equipMetrics = useMemo(
    () => computeEquipmentMetrics(equipment),
    [equipment]
  );

  const valuation = useMemo(
    () =>
      calcValuation({
        ebitda: annualEbitda,
        monthlyRevenue,
        squareFootage,
        avgEquipmentAge: equipMetrics.totalMachines > 0
          ? equipMetrics.weightedAvgAge
          : 6,
        pct200G: equipMetrics.pct200GWashers,
        equipmentScore: equipMetrics.qualityScore,
        totalLeaseControl,
        occupancyType: isOwnerOccupied ? "owned" : "leased",
        marketDensity,
        storeCondition,
        lastRetoolYear: lastRetoolYear ? parseInt(lastRetoolYear, 10) : undefined,
        retoolInvestment: retoolInvestment ? parseFloat(retoolInvestment) : undefined,
        retoolType: retoolType || undefined,
        revenueTrend,
        competitionLevel,
        selfServicePct,
        wdfPct,
        commercialPct,
        pickupDeliveryPct,
        realEstateValue: isOwnerOccupied ? realEstateValue : undefined,
      }),
    [
      annualEbitda,
      monthlyRevenue,
      squareFootage,
      equipMetrics,
      totalLeaseControl,
      isOwnerOccupied,
      marketDensity,
      storeCondition,
      lastRetoolYear,
      retoolInvestment,
      retoolType,
      revenueTrend,
      competitionLevel,
      selfServicePct,
      wdfPct,
      commercialPct,
      pickupDeliveryPct,
      realEstateValue,
    ]
  );

  const equipmentValAdj = sumCategoryAdj(valuation, "equipment");
  const leaseValAdj = sumCategoryAdj(valuation, "lease");

  async function handleSave() {
    if (!storeId) return;
    setSaving(true);
    setError("");
    setSaveSuccess(false);

    const { error: updateError } = await supabase
      .from("stores")
      .update({
        market_density: marketDensity,
        revenue_trend: revenueTrend,
        store_condition: storeCondition,
        competition_level: competitionLevel,
        self_service_pct: selfServicePct,
        wdf_pct: wdfPct,
        commercial_pct: commercialPct,
        pickup_delivery_pct: pickupDeliveryPct,
        last_retool_year: lastRetoolYear ? parseInt(lastRetoolYear, 10) : null,
        retool_investment: retoolInvestment ? parseFloat(retoolInvestment) : null,
        retool_type: retoolType || null,
      })
      .eq("id", storeId);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500 text-[13px]">Loading valuation data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[15px] font-semibold text-slate-100">Valuation Engine</h1>
        <p className="text-slate-500 text-[13px] mt-0.5">
          EBITDA multiple model with equipment, lease, market, and revenue mix adjustments
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {/* Section 1 — Hero banner */}
      <div
        className="rounded-xl p-6 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f1e3d 0%, #1e3a5f 100%)" }}
      >
        <div className="text-[11px] uppercase tracking-wider text-white/50 mb-1">
          {storeName} — Business Value
        </div>
        <div
          className="text-white font-extrabold tracking-tight"
          style={{ fontSize: "52px", lineHeight: 1.1 }}
        >
          {fmtDollar(valuation.businessValue)}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[13px] font-semibold bg-blue-500/20 text-blue-200 border border-blue-400/30">
            {fmtMultiple(valuation.finalMultiple)} EBITDA Multiple
          </span>
          {isOwnerOccupied && realEstateValue > 0 && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[13px] font-semibold bg-green-500/20 text-green-300 border border-green-400/30">
              Combined Value: {fmtDollar(valuation.combinedValue)}
            </span>
          )}
        </div>
        {isOwnerOccupied && realEstateValue > 0 && (
          <div className="flex gap-6 mt-4 text-[12px] text-white/50">
            <span>Business: {fmtDollar(valuation.businessValue)}</span>
            <span>Real Estate: {fmtDollar(valuation.realEstateValue)}</span>
          </div>
        )}
      </div>

      {/* Section 2 — Valuation Breakdown */}
      <div className="card">
        <div className="section-title mb-0">How We Arrived At This Value</div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-slate-400">Base Multiple</span>
            <span className="font-semibold text-slate-100">{fmtMultiple(valuation.baseMultiple)}</span>
          </div>

          {valuation.adjustments.map((adj) => (
            <div
              key={`${adj.label}-${adj.category}`}
              className="flex items-start justify-between gap-4 text-[13px] py-1"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-300 font-medium">{adj.label}</span>
                  <span
                    className={clsx(
                      "text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide",
                      CATEGORY_COLORS[adj.category] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                    )}
                  >
                    {adj.category.replace("_", " ")}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{adj.reason}</div>
              </div>
              <span
                className={clsx(
                  "font-semibold flex-shrink-0",
                  adj.value >= 0 ? "text-green-400" : "text-red-400"
                )}
              >
                {formatAdj(adj.value)}
              </span>
            </div>
          ))}

          <div className="border-t border-white/[0.08] pt-3 mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-slate-200">Final Multiple</span>
              <span className="text-[22px] font-bold text-blue-400">
                {fmtMultiple(valuation.finalMultiple)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-slate-400">× Annual EBITDA</span>
              <span className="font-semibold text-slate-100">{fmtDollar(annualEbitda)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-slate-200">= Business Value</span>
              <span className="text-[22px] font-bold text-green-400">
                {fmtDollar(valuation.businessValue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3 — Qualitative inputs */}
      <div className="grid grid-cols-2 gap-4">
        <PillSelector
          label="Market Density"
          options={MARKET_OPTIONS}
          value={marketDensity}
          onChange={setMarketDensity}
          showAdj
        />
        <PillSelector
          label="Revenue Trend"
          options={REVENUE_OPTIONS}
          value={revenueTrend}
          onChange={setRevenueTrend}
        />
        <PillSelector
          label="Store Condition"
          options={CONDITION_OPTIONS}
          value={storeCondition}
          onChange={setStoreCondition}
        />
        <PillSelector
          label="Competition"
          options={COMPETITION_OPTIONS}
          value={competitionLevel}
          onChange={setCompetitionLevel}
        />
      </div>

      <div className="card">
        <div className="section-title mb-4">Service Mix & Retool</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {[
            { label: "Self Service %", value: selfServicePct, set: setSelfServicePct },
            { label: "WDF %", value: wdfPct, set: setWdfPct },
            { label: "Commercial %", value: commercialPct, set: setCommercialPct },
            { label: "Pickup & Delivery %", value: pickupDeliveryPct, set: setPickupDeliveryPct },
          ].map((field) => (
            <div key={field.label}>
              <label className="block text-[11px] text-slate-500 mb-1.5">{field.label}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={field.value}
                onChange={(e) => field.set(parseFloat(e.target.value) || 0)}
                className={INPUT_CLASS}
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1.5">Last Retool Year</label>
            <input
              type="number"
              min={1990}
              max={new Date().getFullYear()}
              placeholder="e.g. 2023"
              value={lastRetoolYear}
              onChange={(e) => setLastRetoolYear(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1.5">Investment Amount</label>
            <input
              type="number"
              min={0}
              placeholder="e.g. 395000"
              value={retoolInvestment}
              onChange={(e) => setRetoolInvestment(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1.5">Retool Type</label>
            <select
              value={retoolType}
              onChange={(e) => setRetoolType(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Select type...</option>
              {RETOOL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !storeId}
            className="btn-primary py-2.5 px-6 text-[13px]"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {saveSuccess && (
            <span className="text-[12px] text-green-400">Settings saved successfully</span>
          )}
        </div>
      </div>

      {/* Section 4 — Drivers, Risks, Improvements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card">
          <div className="section-title mb-3">Value Drivers</div>
          {valuation.valueDrivers.length === 0 ? (
            <p className="text-[12px] text-slate-500">No major value drivers identified.</p>
          ) : (
            <ul className="space-y-2.5">
              {valuation.valueDrivers.map((driver) => (
                <li key={driver} className="flex items-start gap-2 text-[12px] text-slate-300">
                  <span className="text-green-400 flex-shrink-0 mt-0.5">✓</span>
                  <span>{driver}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="section-title mb-3">Value Risks</div>
          {valuation.valueRisks.length === 0 ? (
            <p className="text-[12px] text-slate-500">No significant risks flagged.</p>
          ) : (
            <ul className="space-y-2.5">
              {valuation.valueRisks.map((risk) => (
                <li key={risk} className="flex items-start gap-2 text-[12px] text-slate-300">
                  <span className="text-amber-400 flex-shrink-0 mt-0.5">⚠</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="section-title mb-3">Improvement Opportunities</div>
          {valuation.improvements.length === 0 ? (
            <p className="text-[12px] text-slate-500">Store is well-optimized across key factors.</p>
          ) : (
            <ul className="space-y-3">
              {valuation.improvements.map((item) => (
                <li
                  key={item.action}
                  className="flex items-start justify-between gap-3 text-[12px] border-b border-white/[0.04] pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <div className="text-slate-200 font-medium">{item.action}</div>
                    <div className="text-green-400 font-semibold mt-0.5">
                      +{fmtDollar(item.estimatedGain)} potential
                    </div>
                  </div>
                  <Link
                    href="/scenarios"
                    className="text-[11px] text-blue-400 hover:text-blue-300 whitespace-nowrap flex-shrink-0"
                  >
                    Model This →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Section 5 — Equipment & Lease summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="section-title mb-4">Equipment Summary</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="metric-label">Avg Age</div>
              <div className="text-[20px] font-bold text-slate-100">
                {equipMetrics.weightedAvgAge.toFixed(1)} yrs
              </div>
            </div>
            <div>
              <div className="metric-label">Quality Grade</div>
              <div className={clsx("text-[20px] font-bold", gradeColor(equipMetrics.grade))}>
                {equipMetrics.grade}
              </div>
            </div>
            <div>
              <div className="metric-label">Under 10 Years</div>
              <div className="text-[20px] font-bold text-slate-100">
                {equipMetrics.pctUnder10Years.toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="metric-label">200G Washers</div>
              <div className="text-[20px] font-bold text-slate-100">
                {equipMetrics.pct200GWashers.toFixed(0)}%
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-[13px] text-slate-400">Equipment Valuation Adjustment</span>
            <span
              className={clsx(
                "text-[16px] font-bold",
                equipmentValAdj >= 0 ? "text-green-400" : "text-red-400"
              )}
            >
              {formatAdjustment(equipmentValAdj)}
            </span>
          </div>
        </div>

        <div className="card">
          <div className="section-title mb-4">Lease Summary</div>
          {isOwnerOccupied ? (
            <div className="text-[13px] text-slate-400">
              Owner-occupied — fee-simple real estate ownership applies instead of lease term control.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label">Years Remaining</div>
                <div className="text-[20px] font-bold text-slate-100">
                  {yearsRemaining.toFixed(1)} yrs
                </div>
              </div>
              <div>
                <div className="metric-label">Total Control</div>
                <div className="text-[20px] font-bold text-slate-100">
                  {totalLeaseControl.toFixed(1)} yrs
                </div>
              </div>
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-[13px] text-slate-400">Lease Valuation Adjustment</span>
            <span
              className={clsx(
                "text-[16px] font-bold",
                leaseValAdj >= 0 ? "text-green-400" : "text-red-400"
              )}
            >
              {formatAdjustment(leaseValAdj)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
