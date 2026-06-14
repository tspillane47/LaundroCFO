"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { SmallMetric } from "@/components/ui/MetricCard";
import clsx from "clsx";
import {
  INPUT_CLASS,
  LabelValue,
  YesNoToggle,
  formatBool,
  formatCurrency,
  formatDate,
  formatPct,
  parseDate,
} from "./shared";
import {
  toBool,
  toNullableDate,
  toNullableNum,
  toNullableText,
} from "@/lib/formHelpers";
import {
  calcBuildingEquity,
  calcCombinedValueEstimate,
  calcMarketRentDifference,
  calcOccupancyCostRatioFromRent,
  calcRealEstateLTV,
  calcRentPerSquareFoot,
  flagStyle,
  getUnderwritingFlags,
} from "@/lib/real-estate-calculations";

type RealEstate = {
  id: string;
  store_id: string;
  property_owner_entity: string | null;
  same_entity_as_laundromat: boolean | null;
  related_landlord_entity: string | null;
  ownership_percentage: number | null;
  date_purchased: string | null;
  purchase_price: number | null;
  estimated_value: number | null;
  property_address: string | null;
  parcel_id: string | null;
  total_square_footage: number | null;
  laundromat_square_footage: number | null;
  other_tenants: boolean | null;
  ownership_notes: string | null;
  mortgage_lender: string | null;
  original_loan_amount: number | null;
  current_loan_balance: number | null;
  interest_rate: number | null;
  monthly_mortgage_payment: number | null;
  annual_debt_service: number | null;
  maturity_date: string | null;
  amortization_term: number | null;
  balloon_payment: boolean | null;
  balloon_date: string | null;
  mortgage_notes: string | null;
  monthly_rent_charged: number | null;
  market_rent_estimate: number | null;
  user_id: string | null;
};

type Store = {
  id: string;
  address: string | null;
  monthly_revenue: number | null;
  monthly_expenses: number | null;
};

type RealEstateForm = {
  property_owner_entity: string;
  same_entity_as_laundromat: boolean;
  related_landlord_entity: string;
  ownership_percentage: string;
  date_purchased: string;
  purchase_price: string;
  estimated_value: string;
  property_address: string;
  parcel_id: string;
  total_square_footage: string;
  laundromat_square_footage: string;
  other_tenants: boolean;
  ownership_notes: string;
  mortgage_lender: string;
  original_loan_amount: string;
  current_loan_balance: string;
  interest_rate: string;
  monthly_mortgage_payment: string;
  annual_debt_service: string;
  maturity_date: string;
  amortization_term: string;
  balloon_payment: boolean;
  balloon_date: string;
  mortgage_notes: string;
  monthly_rent_charged: string;
  market_rent_estimate: string;
};

function emptyForm(storeAddress: string | null): RealEstateForm {
  return {
    property_owner_entity: "",
    same_entity_as_laundromat: true,
    related_landlord_entity: "",
    ownership_percentage: "100",
    date_purchased: "",
    purchase_price: "",
    estimated_value: "",
    property_address: storeAddress ?? "",
    parcel_id: "",
    total_square_footage: "",
    laundromat_square_footage: "",
    other_tenants: false,
    ownership_notes: "",
    mortgage_lender: "",
    original_loan_amount: "",
    current_loan_balance: "",
    interest_rate: "",
    monthly_mortgage_payment: "",
    annual_debt_service: "",
    maturity_date: "",
    amortization_term: "",
    balloon_payment: false,
    balloon_date: "",
    mortgage_notes: "",
    monthly_rent_charged: "",
    market_rent_estimate: "",
  };
}

function recordToForm(record: RealEstate): RealEstateForm {
  return {
    property_owner_entity: record.property_owner_entity ?? "",
    same_entity_as_laundromat: record.same_entity_as_laundromat ?? true,
    related_landlord_entity: record.related_landlord_entity ?? "",
    ownership_percentage:
      record.ownership_percentage != null ? String(record.ownership_percentage) : "",
    date_purchased: record.date_purchased?.split("T")[0] ?? "",
    purchase_price: record.purchase_price != null ? String(record.purchase_price) : "",
    estimated_value: record.estimated_value != null ? String(record.estimated_value) : "",
    property_address: record.property_address ?? "",
    parcel_id: record.parcel_id ?? "",
    total_square_footage:
      record.total_square_footage != null ? String(record.total_square_footage) : "",
    laundromat_square_footage:
      record.laundromat_square_footage != null ? String(record.laundromat_square_footage) : "",
    other_tenants: record.other_tenants ?? false,
    ownership_notes: record.ownership_notes ?? "",
    mortgage_lender: record.mortgage_lender ?? "",
    original_loan_amount:
      record.original_loan_amount != null ? String(record.original_loan_amount) : "",
    current_loan_balance:
      record.current_loan_balance != null ? String(record.current_loan_balance) : "",
    interest_rate: record.interest_rate != null ? String(record.interest_rate) : "",
    monthly_mortgage_payment:
      record.monthly_mortgage_payment != null ? String(record.monthly_mortgage_payment) : "",
    annual_debt_service:
      record.annual_debt_service != null ? String(record.annual_debt_service) : "",
    maturity_date: record.maturity_date?.split("T")[0] ?? "",
    amortization_term: record.amortization_term != null ? String(record.amortization_term) : "",
    balloon_payment: record.balloon_payment ?? false,
    balloon_date: record.balloon_date?.split("T")[0] ?? "",
    mortgage_notes: record.mortgage_notes ?? "",
    monthly_rent_charged:
      record.monthly_rent_charged != null ? String(record.monthly_rent_charged) : "",
    market_rent_estimate:
      record.market_rent_estimate != null ? String(record.market_rent_estimate) : "",
  };
}

function calcYearsOwned(datePurchased: string | null): number {
  const purchased = parseDate(datePurchased);
  if (!purchased) return 0;
  const now = new Date();
  return Math.max(0, (now.getTime() - purchased.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function calcRealEstateScore(params: {
  ltv: number | null;
  ownershipPct: number | null;
  yearsOwned: number;
  hasBalloon: boolean;
  balloonWithin2Years: boolean;
  debtServiceToRevenue: number | null;
}): number {
  let score = 50;

  if (params.ltv != null) {
    if (params.ltv < 50) score += 20;
    else if (params.ltv < 65) score += 10;
    else if (params.ltv > 80) score -= 15;
    else if (params.ltv > 70) score -= 5;
  }

  if (params.ownershipPct === 100) score += 10;
  else if (params.ownershipPct != null && params.ownershipPct >= 50) score += 5;
  else if (params.ownershipPct != null && params.ownershipPct < 50) score -= 10;

  if (params.yearsOwned >= 10) score += 10;
  else if (params.yearsOwned >= 5) score += 5;

  if (params.hasBalloon && params.balloonWithin2Years) score -= 15;
  else if (params.hasBalloon) score -= 5;

  if (params.debtServiceToRevenue != null && params.debtServiceToRevenue > 25) score -= 10;
  else if (params.debtServiceToRevenue != null && params.debtServiceToRevenue < 15) score += 5;

  return Math.min(100, Math.max(0, score));
}

function riskFromScore(score: number): { label: string; color: string; ringColor: string } {
  if (score >= 75) return { label: "Strong Position", color: "text-green-400", ringColor: "#22c55e" };
  if (score >= 50) return { label: "Moderate Position", color: "text-amber-400", ringColor: "#f59e0b" };
  return { label: "Elevated Risk", color: "text-red-400", ringColor: "#ef4444" };
}

type Props = {
  store: Store;
};

export function RealEstateModule({ store }: Props) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<"view" | "edit">("view");

  const [record, setRecord] = useState<RealEstate | null>(null);
  const [form, setForm] = useState<RealEstateForm>(emptyForm(store.address));

  function setField<K extends keyof RealEstateForm>(field: K, value: RealEstateForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function loadData() {
    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("real_estate")
      .select("*")
      .eq("store_id", store.id)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    if (data) {
      setRecord(data);
      setForm(recordToForm(data));
    } else {
      setRecord(null);
      setForm(emptyForm(store.address));
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [store.id]);

  const metrics = useMemo(() => {
    const estimatedValue = record?.estimated_value ?? null;
    const loanBalance = record?.current_loan_balance ?? null;
    const monthlyRentCharged = record?.monthly_rent_charged ?? null;
    const marketRentEstimate = record?.market_rent_estimate ?? null;
    const laundromatSqft = record?.laundromat_square_footage ?? null;

    const equity = calcBuildingEquity(estimatedValue, loanBalance);
    const ltv = calcRealEstateLTV(loanBalance, estimatedValue);
    const rentPerSF = calcRentPerSquareFoot(monthlyRentCharged, laundromatSqft);
    const occupancyCostRatio = calcOccupancyCostRatioFromRent(
      monthlyRentCharged,
      store.monthly_revenue
    );
    const marketRentDiff = calcMarketRentDifference(monthlyRentCharged, marketRentEstimate);

    const monthlyRevenue = store.monthly_revenue ?? 0;
    const monthlyExpenses = store.monthly_expenses ?? 0;
    const annualEbitda = (monthlyRevenue - monthlyExpenses) * 12;
    const combinedValue = calcCombinedValueEstimate(annualEbitda, estimatedValue);

    const yearsOwned = calcYearsOwned(record?.date_purchased ?? null);
    const annualRevenue = monthlyRevenue * 12;
    const debtService = record?.annual_debt_service ?? null;
    const debtServiceToRevenue =
      debtService != null && annualRevenue > 0 ? (debtService / annualRevenue) * 100 : null;

    const balloonDate = parseDate(record?.balloon_date ?? null);
    const now = new Date();
    const balloonWithin2Years =
      record?.balloon_payment === true &&
      balloonDate != null &&
      balloonDate.getTime() - now.getTime() < 2 * 365.25 * 24 * 60 * 60 * 1000;

    const score = calcRealEstateScore({
      ltv,
      ownershipPct: record?.ownership_percentage ?? null,
      yearsOwned,
      hasBalloon: record?.balloon_payment ?? false,
      balloonWithin2Years,
      debtServiceToRevenue,
    });
    const risk = riskFromScore(score);

    const flags = getUnderwritingFlags({
      monthlyRentCharged,
      marketRentEstimate,
      sameEntityAsLaundromat: record?.same_entity_as_laundromat ?? null,
      monthlyMortgagePayment: record?.monthly_mortgage_payment ?? null,
      buildingEquity: equity,
    });

    return {
      equity,
      ltv,
      rentPerSF,
      occupancyCostRatio,
      marketRentDiff,
      combinedValue,
      yearsOwned,
      debtService,
      debtServiceToRevenue,
      score,
      risk,
      flags,
    };
  }, [record, store]);

  function enterEditMode() {
    if (record) {
      setForm(recordToForm(record));
    } else {
      setForm(emptyForm(store.address));
    }
    setMode("edit");
    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    if (record) {
      setForm(recordToForm(record));
    }
    setMode("view");
    setError("");
    setSuccess("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in to save.");
      setSaving(false);
      return;
    }

    const balloonPayment = toBool(form.balloon_payment);
    const payload = {
      store_id: store.id,
      user_id: user.id,
      property_owner_entity: toNullableText(form.property_owner_entity),
      same_entity_as_laundromat: toBool(form.same_entity_as_laundromat),
      related_landlord_entity: toBool(form.same_entity_as_laundromat)
        ? null
        : toNullableText(form.related_landlord_entity),
      ownership_percentage: toNullableNum(form.ownership_percentage),
      date_purchased: toNullableDate(form.date_purchased),
      purchase_price: toNullableNum(form.purchase_price),
      estimated_value: toNullableNum(form.estimated_value),
      property_address: toNullableText(form.property_address),
      parcel_id: toNullableText(form.parcel_id),
      total_square_footage: toNullableNum(form.total_square_footage),
      laundromat_square_footage: toNullableNum(form.laundromat_square_footage),
      other_tenants: toBool(form.other_tenants),
      ownership_notes: toNullableText(form.ownership_notes),
      mortgage_lender: toNullableText(form.mortgage_lender),
      original_loan_amount: toNullableNum(form.original_loan_amount),
      current_loan_balance: toNullableNum(form.current_loan_balance),
      interest_rate: toNullableNum(form.interest_rate),
      monthly_mortgage_payment: toNullableNum(form.monthly_mortgage_payment),
      annual_debt_service: toNullableNum(form.annual_debt_service),
      maturity_date: toNullableDate(form.maturity_date),
      amortization_term: toNullableNum(form.amortization_term),
      balloon_payment: balloonPayment,
      balloon_date: balloonPayment ? toNullableDate(form.balloon_date) : null,
      mortgage_notes: toNullableText(form.mortgage_notes),
      monthly_rent_charged: toNullableNum(form.monthly_rent_charged),
      market_rent_estimate: toNullableNum(form.market_rent_estimate),
    };

    const { error: upsertError } = await supabase
      .from("real_estate")
      .upsert(payload, { onConflict: "store_id" });

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    setSuccess("Real estate profile saved successfully.");
    setMode("view");
    setSaving(false);
    await loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500 text-[13px]">Loading real estate data...</div>
      </div>
    );
  }

  const entityBadge = record?.same_entity_as_laundromat ? "badge-green" : "badge-amber";
  const balloonBadge = record?.balloon_payment ? "badge-amber" : "badge-green";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-100">Real Estate Ownership</h2>
          <p className="text-slate-500 text-[13px] mt-0.5">Owner-occupied or related-party real estate</p>
        </div>
        {mode === "view" ? (
          <button onClick={enterEditMode} className="btn-primary">
            {record ? "Edit Profile" : "Add Profile"}
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={cancelEdit} className="btn-outline" disabled={saving}>
              Cancel
            </button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-[12px] text-green-400">
          {success}
        </div>
      )}

      {mode === "view" && !record ? (
        <div className="card text-center py-12">
          <div className="text-slate-300 text-[14px]">No real estate profile on file</div>
          <p className="text-slate-500 text-[13px] mt-2 mb-4">
            Add building ownership and mortgage details to track equity and debt position.
          </p>
          <button onClick={enterEditMode} className="btn-primary">
            Add Profile
          </button>
        </div>
      ) : mode === "view" && record ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="card flex flex-col items-center justify-center py-4">
              <div className="metric-label mb-2">Real Estate Score</div>
              <ScoreRing score={metrics.score} size={90} color={metrics.risk.ringColor} />
              <div className={clsx("text-[12px] font-semibold mt-2", metrics.risk.color)}>
                {metrics.score}/100
              </div>
            </div>
            <SmallMetric
              label="Building Equity"
              value={metrics.equity != null ? formatCurrency(metrics.equity) : "—"}
              color="text-green-400"
            />
            <SmallMetric
              label="Real Estate LTV"
              value={metrics.ltv != null ? metrics.ltv.toFixed(1) + "%" : "—"}
              color={
                metrics.ltv != null && metrics.ltv > 70 ? "text-amber-400" : "text-slate-100"
              }
            />
            <SmallMetric
              label="Years Owned"
              value={metrics.yearsOwned.toFixed(1)}
              color="text-blue-400"
            />
            <div className="card2">
              <div className="metric-label">Position</div>
              <div className={clsx("text-lg font-bold", metrics.risk.color)}>
                {metrics.risk.label}
              </div>
            </div>
            <SmallMetric
              label="Debt Service / Revenue"
              value={
                metrics.debtServiceToRevenue != null
                  ? metrics.debtServiceToRevenue.toFixed(1) + "%"
                  : "—"
              }
              color={
                metrics.debtServiceToRevenue != null && metrics.debtServiceToRevenue > 20
                  ? "text-amber-400"
                  : "text-slate-100"
              }
            />
          </div>

          <div className="card">
            <div className="section-title">Automatic Calculations</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <SmallMetric
                label="Building Equity"
                value={metrics.equity != null ? formatCurrency(metrics.equity) : "—"}
                color="text-green-400"
              />
              <SmallMetric
                label="Real Estate LTV"
                value={metrics.ltv != null ? metrics.ltv.toFixed(1) + "%" : "—"}
                color={
                  metrics.ltv != null && metrics.ltv > 70 ? "text-amber-400" : "text-slate-100"
                }
              />
              <SmallMetric
                label="Rent per Square Foot"
                value={
                  metrics.rentPerSF != null
                    ? "$" + metrics.rentPerSF.toFixed(2) + "/yr"
                    : "—"
                }
                color="text-blue-400"
              />
              <SmallMetric
                label="Occupancy Cost Ratio"
                value={
                  metrics.occupancyCostRatio != null
                    ? metrics.occupancyCostRatio.toFixed(1) + "%"
                    : "—"
                }
                color={
                  metrics.occupancyCostRatio != null && metrics.occupancyCostRatio > 20
                    ? "text-amber-400"
                    : "text-slate-100"
                }
              />
              <SmallMetric
                label="Market Rent Difference"
                value={
                  metrics.marketRentDiff != null
                    ? (metrics.marketRentDiff >= 0 ? "+" : "") +
                      formatCurrency(metrics.marketRentDiff)
                    : "—"
                }
                color={
                  metrics.marketRentDiff != null && metrics.marketRentDiff !== 0
                    ? "text-amber-400"
                    : "text-slate-100"
                }
              />
              <SmallMetric
                label="Combined Value Estimate"
                value={
                  metrics.combinedValue != null ? formatCurrency(metrics.combinedValue) : "—"
                }
                color="text-blue-300"
              />
            </div>
          </div>

          {metrics.flags.length > 0 && (
            <div className="card space-y-3">
              <div className="section-title mb-0">Underwriting Flags</div>
              {metrics.flags.map((flag, i) => (
                <div
                  key={i}
                  className={clsx("p-3 rounded-lg border text-[12px]", flagStyle(flag.type))}
                >
                  {flag.message}
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="section-title">Building Ownership</div>
            <div>
              <LabelValue
                label="Property Owner Entity"
                value={record.property_owner_entity ?? "—"}
              />
              <LabelValue
                label="Same Entity as Laundromat"
                value={formatBool(record.same_entity_as_laundromat)}
                badge={entityBadge}
              />
              {!record.same_entity_as_laundromat && (
                <LabelValue
                  label="Related Landlord Entity"
                  value={record.related_landlord_entity ?? "—"}
                />
              )}
              <LabelValue
                label="Ownership Percentage"
                value={
                  record.ownership_percentage != null
                    ? record.ownership_percentage + "%"
                    : "—"
                }
              />
              <LabelValue label="Date Purchased" value={formatDate(record.date_purchased)} />
              <LabelValue label="Purchase Price" value={formatCurrency(record.purchase_price)} />
              <LabelValue label="Estimated Value" value={formatCurrency(record.estimated_value)} />
              <LabelValue label="Property Address" value={record.property_address ?? "—"} />
              <LabelValue label="Parcel ID" value={record.parcel_id ?? "—"} />
              <LabelValue
                label="Total Square Footage"
                value={
                  record.total_square_footage != null
                    ? record.total_square_footage.toLocaleString() + " sq ft"
                    : "—"
                }
              />
              <LabelValue
                label="Laundromat Square Footage"
                value={
                  record.laundromat_square_footage != null
                    ? record.laundromat_square_footage.toLocaleString() + " sq ft"
                    : "—"
                }
              />
              <LabelValue label="Other Tenants" value={formatBool(record.other_tenants)} />
              <LabelValue label="Ownership Notes" value={record.ownership_notes ?? "—"} />
            </div>
          </div>

          <div className="card">
            <div className="section-title">Mortgage & Debt</div>
            <div>
              <LabelValue label="Mortgage Lender" value={record.mortgage_lender ?? "—"} />
              <LabelValue
                label="Original Loan Amount"
                value={formatCurrency(record.original_loan_amount)}
              />
              <LabelValue
                label="Current Loan Balance"
                value={formatCurrency(record.current_loan_balance)}
              />
              <LabelValue label="Interest Rate" value={formatPct(record.interest_rate)} />
              <LabelValue
                label="Monthly Mortgage Payment"
                value={formatCurrency(record.monthly_mortgage_payment)}
              />
              <LabelValue
                label="Annual Debt Service"
                value={formatCurrency(record.annual_debt_service)}
              />
              <LabelValue label="Maturity Date" value={formatDate(record.maturity_date)} />
              <LabelValue
                label="Amortization Term"
                value={
                  record.amortization_term != null ? record.amortization_term + " years" : "—"
                }
              />
              <LabelValue
                label="Balloon Payment"
                value={formatBool(record.balloon_payment)}
                badge={balloonBadge}
              />
              {record.balloon_payment && (
                <LabelValue label="Balloon Date" value={formatDate(record.balloon_date)} />
              )}
              <LabelValue label="Mortgage Notes" value={record.mortgage_notes ?? "—"} />
            </div>
          </div>

          <div className="card">
            <div className="section-title">Related-Party Rent</div>
            <div>
              <LabelValue
                label="Monthly Rent Charged"
                value={formatCurrency(record.monthly_rent_charged)}
              />
              <LabelValue
                label="Market Rent Estimate"
                value={formatCurrency(record.market_rent_estimate)}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-5">
          <div className="card space-y-4">
            <div className="section-title mb-0">Building Ownership</div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label mb-1.5">Property Owner Entity</div>
                <input
                  type="text"
                  value={form.property_owner_entity}
                  onChange={(e) => setField("property_owner_entity", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="LLC or entity that owns the building"
                />
              </div>
              <div>
                <YesNoToggle
                  label="Same Entity as Laundromat"
                  value={form.same_entity_as_laundromat}
                  onChange={(v) => setField("same_entity_as_laundromat", v)}
                />
              </div>
            </div>

            {!form.same_entity_as_laundromat && (
              <div>
                <div className="metric-label mb-1.5">Related Landlord Entity</div>
                <input
                  type="text"
                  value={form.related_landlord_entity}
                  onChange={(e) => setField("related_landlord_entity", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Related-party landlord entity"
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="metric-label mb-1.5">Ownership Percentage</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.ownership_percentage}
                  onChange={(e) => setField("ownership_percentage", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="100"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Date Purchased</div>
                <input
                  type="date"
                  value={form.date_purchased}
                  onChange={(e) => setField("date_purchased", e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Parcel ID</div>
                <input
                  type="text"
                  value={form.parcel_id}
                  onChange={(e) => setField("parcel_id", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="County parcel / APN"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label mb-1.5">Purchase Price</div>
                <input
                  type="number"
                  value={form.purchase_price}
                  onChange={(e) => setField("purchase_price", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="850000"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Estimated Value</div>
                <input
                  type="number"
                  value={form.estimated_value}
                  onChange={(e) => setField("estimated_value", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="1200000"
                />
              </div>
            </div>

            <div>
              <div className="metric-label mb-1.5">Property Address</div>
              <input
                type="text"
                value={form.property_address}
                onChange={(e) => setField("property_address", e.target.value)}
                className={INPUT_CLASS}
                placeholder="Full property address"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="metric-label mb-1.5">Total Square Footage</div>
                <input
                  type="number"
                  value={form.total_square_footage}
                  onChange={(e) => setField("total_square_footage", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="6000"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Laundromat Square Footage</div>
                <input
                  type="number"
                  value={form.laundromat_square_footage}
                  onChange={(e) => setField("laundromat_square_footage", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="4450"
                />
              </div>
              <div>
                <YesNoToggle
                  label="Other Tenants"
                  value={form.other_tenants}
                  onChange={(v) => setField("other_tenants", v)}
                />
              </div>
            </div>

            <div>
              <div className="metric-label mb-1.5">Ownership Notes</div>
              <textarea
                value={form.ownership_notes}
                onChange={(e) => setField("ownership_notes", e.target.value)}
                className={INPUT_CLASS + " min-h-[80px] resize-y"}
                placeholder="Partnership structure, easements, zoning notes..."
              />
            </div>
          </div>

          <div className="card space-y-4">
            <div className="section-title mb-0">Mortgage & Debt</div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label mb-1.5">Mortgage Lender</div>
                <input
                  type="text"
                  value={form.mortgage_lender}
                  onChange={(e) => setField("mortgage_lender", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Bank or lender name"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Interest Rate (%)</div>
                <input
                  type="number"
                  step="0.01"
                  value={form.interest_rate}
                  onChange={(e) => setField("interest_rate", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="6.25"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label mb-1.5">Original Loan Amount</div>
                <input
                  type="number"
                  value={form.original_loan_amount}
                  onChange={(e) => setField("original_loan_amount", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="680000"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Current Loan Balance</div>
                <input
                  type="number"
                  value={form.current_loan_balance}
                  onChange={(e) => setField("current_loan_balance", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="520000"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="metric-label mb-1.5">Monthly Mortgage Payment</div>
                <input
                  type="number"
                  value={form.monthly_mortgage_payment}
                  onChange={(e) => setField("monthly_mortgage_payment", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="4200"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Annual Debt Service</div>
                <input
                  type="number"
                  value={form.annual_debt_service}
                  onChange={(e) => setField("annual_debt_service", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="50400"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Amortization Term (Years)</div>
                <input
                  type="number"
                  value={form.amortization_term}
                  onChange={(e) => setField("amortization_term", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="25"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label mb-1.5">Maturity Date</div>
                <input
                  type="date"
                  value={form.maturity_date}
                  onChange={(e) => setField("maturity_date", e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <YesNoToggle
                  label="Balloon Payment"
                  value={form.balloon_payment}
                  onChange={(v) => setField("balloon_payment", v)}
                />
              </div>
            </div>

            {form.balloon_payment && (
              <div>
                <div className="metric-label mb-1.5">Balloon Date</div>
                <input
                  type="date"
                  value={form.balloon_date}
                  onChange={(e) => setField("balloon_date", e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            )}

            <div>
              <div className="metric-label mb-1.5">Mortgage Notes</div>
              <textarea
                value={form.mortgage_notes}
                onChange={(e) => setField("mortgage_notes", e.target.value)}
                className={INPUT_CLASS + " min-h-[80px] resize-y"}
                placeholder="Prepayment penalties, rate adjustments, covenants..."
              />
            </div>
          </div>

          <div className="card space-y-4">
            <div className="section-title mb-0">Related-Party Rent</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label mb-1.5">Monthly Rent Charged</div>
                <input
                  type="number"
                  value={form.monthly_rent_charged}
                  onChange={(e) => setField("monthly_rent_charged", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="6200"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Market Rent Estimate</div>
                <input
                  type="number"
                  value={form.market_rent_estimate}
                  onChange={(e) => setField("market_rent_estimate", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="7500"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
