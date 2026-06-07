"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { calcValuationMultiple } from "@/lib/valuation";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";

type LocationType = "urban" | "suburban" | "average" | "rural";
type RevenueTrend = "growing" | "stable" | "declining";
type StoreCondition = "remodeled" | "average" | "needs_renovation";
type CompetitionLevel = "protected" | "normal" | "heavy";

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

function formatAdj(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(2)}x`;
}

function PillSelector<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
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
          </button>
        ))}
      </div>
    </div>
  );
}

const LOCATION_OPTIONS: { value: LocationType; label: string }[] = [
  { value: "urban", label: "Prime Dense Urban" },
  { value: "suburban", label: "Strong Suburban" },
  { value: "average", label: "Average Small City" },
  { value: "rural", label: "Rural Market" },
];

const REVENUE_OPTIONS: { value: RevenueTrend; label: string }[] = [
  { value: "growing", label: "Growing" },
  { value: "stable", label: "Stable" },
  { value: "declining", label: "Declining" },
];

const CONDITION_OPTIONS: { value: StoreCondition; label: string }[] = [
  { value: "remodeled", label: "Recently Remodeled" },
  { value: "average", label: "Average Condition" },
  { value: "needs_renovation", label: "Needs Renovation" },
];

const COMPETITION_OPTIONS: { value: CompetitionLevel; label: string }[] = [
  { value: "protected", label: "Protected Market" },
  { value: "normal", label: "Normal Competition" },
  { value: "heavy", label: "Heavy Competition" },
];

export default function ValuationPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");
  const [storeId, setStoreId] = useState<string | null>(null);

  const [locationType, setLocationType] = useState<LocationType>("suburban");
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrend>("stable");
  const [storeCondition, setStoreCondition] = useState<StoreCondition>("average");
  const [competitionLevel, setCompetitionLevel] = useState<CompetitionLevel>("normal");

  const [annualEbitda, setAnnualEbitda] = useState(0);
  const [totalLeaseControl, setTotalLeaseControl] = useState(0);
  const [occupancyType, setOccupancyType] = useState<string>("leased");
  const [avgEquipmentAge, setAvgEquipmentAge] = useState(6);
  const [squareFootage, setSquareFootage] = useState(3500);
  const [realEstateValue, setRealEstateValue] = useState(0);
  const [isOwnerOccupied, setIsOwnerOccupied] = useState(false);

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

      setStoreId(storeData.id);
      setLocationType((storeData.location_type as LocationType) ?? "suburban");
      setRevenueTrend((storeData.revenue_trend as RevenueTrend) ?? "stable");
      setStoreCondition((storeData.store_condition as StoreCondition) ?? "average");
      setCompetitionLevel((storeData.competition_level as CompetitionLevel) ?? "normal");
      setAvgEquipmentAge(storeData.avg_machine_age ?? 6);
      setSquareFootage(storeData.square_footage ?? 3500);

      const revenue = storeData.monthly_revenue ?? 69250;
      const expenses = storeData.monthly_expenses ?? 49470;
      setAnnualEbitda((revenue - expenses) * 12);

      const ownerOccupied = storeData.occupancy_type === "owner_occupied";
      setIsOwnerOccupied(ownerOccupied);
      setOccupancyType(ownerOccupied ? "owned" : "leased");

      if (ownerOccupied) {
        const { data: reData } = await supabase
          .from("real_estate")
          .select("*")
          .eq("store_id", storeData.id)
          .limit(1)
          .maybeSingle();
        setRealEstateValue(reData?.estimated_value ?? 0);
        setTotalLeaseControl(15);
      } else {
        const { data: leaseData } = await supabase
          .from("leases")
          .select("*")
          .eq("store_id", storeData.id)
          .limit(1)
          .maybeSingle();

        if (leaseData) {
          const yearsRemaining = calcYearsRemaining(leaseData.lease_end_date);
          const { data: optionsData } = await supabase
            .from("lease_options")
            .select("*")
            .eq("lease_id", leaseData.id)
            .order("option_number", { ascending: true });
          const available = (optionsData ?? []).filter((o) => o.status === "Available");
          const optionYears = available.reduce((s, o) => s + (o.option_years ?? 0), 0);
          setTotalLeaseControl(yearsRemaining + optionYears);
        } else {
          setTotalLeaseControl(0);
        }
        setRealEstateValue(0);
      }

      setLoading(false);
    }
    load();
  }, []);

  const valuation = useMemo(
    () =>
      calcValuationMultiple({
        ebitda: annualEbitda,
        locationCategory: locationType,
        totalLeaseControl,
        occupancyType,
        avgEquipmentAge,
        squareFootage,
        revenueTrend,
        storeCondition,
        competitionLevel,
        realEstateValue: isOwnerOccupied ? realEstateValue : undefined,
      }),
    [
      annualEbitda,
      locationType,
      totalLeaseControl,
      occupancyType,
      avgEquipmentAge,
      squareFootage,
      revenueTrend,
      storeCondition,
      competitionLevel,
      realEstateValue,
      isOwnerOccupied,
    ]
  );

  const allFactors = useMemo(() => {
    const locationAdj =
      locationType === "urban" ? 0.25 :
      locationType === "suburban" ? 0.1 :
      locationType === "rural" ? -0.25 : 0;

    const leaseAdj =
      totalLeaseControl >= 15 ? 0.5 :
      totalLeaseControl >= 10 ? 0.25 :
      totalLeaseControl >= 7 ? 0.1 :
      totalLeaseControl >= 5 ? 0 :
      totalLeaseControl >= 3 ? -0.25 : -0.75;

    const reAdj = occupancyType === "owned" ? 0.25 : 0;

    const equipAdj =
      avgEquipmentAge <= 5 ? 0.5 :
      avgEquipmentAge <= 10 ? 0.25 :
      avgEquipmentAge <= 15 ? 0 :
      avgEquipmentAge <= 20 ? -0.5 : -1.0;

    const sfAdj =
      squareFootage > 5000 ? 0.25 :
      squareFootage >= 3500 ? 0.1 :
      squareFootage >= 2500 ? 0 :
      squareFootage >= 1500 ? -0.25 : -0.5;

    const revAdj =
      revenueTrend === "growing" ? 0.25 :
      revenueTrend === "declining" ? -0.5 : 0;

    const condAdj =
      storeCondition === "remodeled" ? 0.25 :
      storeCondition === "needs_renovation" ? -0.5 : 0;

    const compAdj =
      competitionLevel === "protected" ? 0.25 :
      competitionLevel === "heavy" ? -0.25 : 0;

    return [
      {
        label: "Location Type",
        detail: LOCATION_OPTIONS.find((o) => o.value === locationType)?.label ?? locationType,
        value: locationAdj,
      },
      {
        label: "Lease Term Control",
        detail: isOwnerOccupied ? "Owner-occupied (N/A)" : `${totalLeaseControl.toFixed(1)} years total control`,
        value: isOwnerOccupied ? 0 : leaseAdj,
      },
      {
        label: "Real Estate Ownership",
        detail: isOwnerOccupied ? "Building owned" : "Leased space",
        value: reAdj,
      },
      {
        label: "Equipment Age",
        detail: `${avgEquipmentAge.toFixed(1)} years avg`,
        value: equipAdj,
      },
      {
        label: "Store Size",
        detail: `${squareFootage.toLocaleString()} sq ft`,
        value: sfAdj,
      },
      {
        label: "Revenue Trend",
        detail: REVENUE_OPTIONS.find((o) => o.value === revenueTrend)?.label ?? revenueTrend,
        value: revAdj,
      },
      {
        label: "Store Condition",
        detail: CONDITION_OPTIONS.find((o) => o.value === storeCondition)?.label ?? storeCondition,
        value: condAdj,
      },
      {
        label: "Competition Level",
        detail: COMPETITION_OPTIONS.find((o) => o.value === competitionLevel)?.label ?? competitionLevel,
        value: compAdj,
      },
    ];
  }, [
    locationType,
    totalLeaseControl,
    occupancyType,
    avgEquipmentAge,
    squareFootage,
    revenueTrend,
    storeCondition,
    competitionLevel,
    isOwnerOccupied,
  ]);

  async function handleSave() {
    if (!storeId) return;
    setSaving(true);
    setError("");
    setSaveSuccess(false);

    const { error: updateError } = await supabase
      .from("stores")
      .update({
        location_type: locationType,
        revenue_trend: revenueTrend,
        store_condition: storeCondition,
        competition_level: competitionLevel,
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
          EBITDA multiple model with qualitative and quantitative adjustments
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {/* Qualitative inputs — 2x2 grid */}
      <div className="grid grid-cols-2 gap-4">
        <PillSelector
          label="Location Type"
          options={LOCATION_OPTIONS}
          value={locationType}
          onChange={setLocationType}
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
          label="Competition Level"
          options={COMPETITION_OPTIONS}
          value={competitionLevel}
          onChange={setCompetitionLevel}
        />
      </div>

      {/* Valuation Breakdown */}
      <div className="card">
        <div className="section-title mb-0">Valuation Breakdown</div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-slate-400">Base Multiple</span>
            <span className="font-semibold text-slate-100">{fmtMultiple(valuation.baseMultiple)}</span>
          </div>

          {valuation.adjustments.map((adj) => (
            <div key={adj.label} className="flex items-center justify-between text-[13px]">
              <span className="text-slate-400">{adj.label}</span>
              <span className={clsx("font-semibold", adj.value >= 0 ? "text-green-400" : "text-red-400")}>
                {formatAdj(adj.value)}
              </span>
            </div>
          ))}

          <div className="border-t border-white/[0.08] pt-3 mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-slate-200">Final Multiple</span>
              <span className="text-[22px] font-bold text-slate-100">{fmtMultiple(valuation.finalMultiple)}</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-slate-400">× EBITDA</span>
              <span className="font-semibold text-slate-100">{fmtDollar(annualEbitda)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-slate-200">= Business Value</span>
              <span className="text-[22px] font-bold text-green-400">{fmtDollar(valuation.businessValue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Combined value for owner-occupied */}
      {isOwnerOccupied && (
        <div className="card border-blue-500/20">
          <div className="section-title mb-0">Total Enterprise Value</div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="card2">
              <div className="metric-label">Business Value</div>
              <div className="text-[18px] font-bold text-slate-100">{fmtDollar(valuation.businessValue)}</div>
            </div>
            <div className="card2">
              <div className="metric-label">Real Estate Value</div>
              <div className="text-[18px] font-bold text-blue-300">{fmtDollar(valuation.realEstateValue)}</div>
            </div>
            <div className="card2 border-green-500/30 bg-green-500/5">
              <div className="metric-label">Combined Value</div>
              <div className="text-[26px] font-bold text-green-400">{fmtDollar(valuation.combinedValue)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Multiple Adjustments Summary */}
      <div className="card">
        <div className="section-title mb-0">Multiple Adjustments Summary</div>
        <div className="mt-4 divide-y divide-white/[0.04]">
          {allFactors.map((factor) => (
            <div key={factor.label} className="flex items-center justify-between py-3 text-[13px]">
              <div>
                <div className="text-slate-200 font-medium">{factor.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{factor.detail}</div>
              </div>
              <span
                className={clsx(
                  "font-semibold text-[14px] flex-shrink-0 ml-4",
                  factor.value > 0 ? "text-green-400" : factor.value < 0 ? "text-red-400" : "text-slate-500"
                )}
              >
                {factor.value === 0 ? "Neutral (0.00x)" : formatAdj(factor.value)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-3 text-[13px] border-t border-white/[0.08]">
            <div>
              <div className="text-slate-200 font-semibold">Final Multiple (capped 2.50x – 6.00x)</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Base 3.50x plus all adjustments</div>
            </div>
            <span className="font-bold text-[18px] text-blue-300">{fmtMultiple(valuation.finalMultiple)}</span>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !storeId}
          className="btn-primary py-2.5 px-6 text-[13px]"
        >
          {saving ? "Saving..." : "Save Valuation Settings"}
        </button>
        {saveSuccess && (
          <span className="text-[12px] text-green-400">Settings saved successfully</span>
        )}
      </div>
    </div>
  );
}
