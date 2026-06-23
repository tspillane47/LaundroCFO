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
  parseDate,
} from "./shared";
import {
  calcBuildingEquity,
  calcCombinedValueEstimate,
  calcMarketRentDifference,
  calcOccupancyCostRatioFromRent,
  calcRealEstateLTV,
  calcRentPerSquareFoot,
  flagStyle,
  getUnderwritingFlags,
  normalizeMortgages,
  sumMortgageBalances,
  sumMortgagePayments,
  type Mortgage,
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
  mortgages: Mortgage[] | null;
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
  monthly_rent_charged: string;
  market_rent_estimate: string;
};

type MortgageForm = {
  lender_name: string;
  monthly_payment: string;
  balance: string;
};

function emptyMortgageForm(): MortgageForm {
  return { lender_name: "", monthly_payment: "", balance: "" };
}

function mortgagesToForms(mortgages: Mortgage[]): MortgageForm[] {
  if (!mortgages.length) return [emptyMortgageForm()];
  return mortgages.map((m) => ({
    lender_name: m.lender_name ?? "",
    monthly_payment: m.monthly_payment != null ? String(m.monthly_payment) : "",
    balance: m.balance != null ? String(m.balance) : "",
  }));
}

function formsToMortgages(forms: MortgageForm[]): Mortgage[] {
  return forms
    .filter((f) => f.lender_name.trim() || f.monthly_payment || f.balance)
    .map((f) => ({
      lender_name: f.lender_name.trim(),
      monthly_payment: Number(f.monthly_payment) || 0,
      balance: Number(f.balance) || 0,
    }));
}

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
  const [mortgageForms, setMortgageForms] = useState<MortgageForm[]>([emptyMortgageForm()]);

  function setField<K extends keyof RealEstateForm>(field: K, value: RealEstateForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setMortgageField(index: number, field: keyof MortgageForm, value: string) {
    setMortgageForms((forms) =>
      forms.map((f, i) => (i === index ? { ...f, [field]: value } : f))
    );
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
      setMortgageForms(mortgagesToForms(normalizeMortgages(data.mortgages, data)));
    } else {
      setRecord(null);
      setForm(emptyForm(store.address));
      setMortgageForms([emptyMortgageForm()]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [store.id]);

  const metrics = useMemo(() => {
    const estimatedValue = record?.estimated_value ?? null;
    const mortgages = normalizeMortgages(record?.mortgages, record ?? undefined);
    const loanBalance = sumMortgageBalances(mortgages);
    const totalMonthlyPayment = sumMortgagePayments(mortgages);
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
    const debtService =
      totalMonthlyPayment != null ? totalMonthlyPayment * 12 : record?.annual_debt_service ?? null;
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
      monthlyMortgagePayment: totalMonthlyPayment,
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
      mortgages,
      totalMonthlyPayment,
      totalBalance: loanBalance,
    };
  }, [record, store]);

  function enterEditMode() {
    if (record) {
      setForm(recordToForm(record));
      setMortgageForms(mortgagesToForms(normalizeMortgages(record.mortgages, record)));
    } else {
      setForm(emptyForm(store.address));
      setMortgageForms([emptyMortgageForm()]);
    }
    setMode("edit");
    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    if (record) {
      setForm(recordToForm(record));
      setMortgageForms(mortgagesToForms(normalizeMortgages(record.mortgages, record)));
    } else {
      setMortgageForms([emptyMortgageForm()]);
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

    const mortgages = formsToMortgages(mortgageForms);
    const totalMonthlyPayment = sumMortgagePayments(mortgages);
    const totalBalance = sumMortgageBalances(mortgages);
    const annualDebtService = totalMonthlyPayment != null ? totalMonthlyPayment * 12 : null;

    const payload = {
      store_id: store.id,
      user_id: user.id,
      property_owner_entity: form.property_owner_entity || null,
      same_entity_as_laundromat: form.same_entity_as_laundromat,
      related_landlord_entity: form.same_entity_as_laundromat
        ? null
        : form.related_landlord_entity || null,
      ownership_percentage: form.ownership_percentage ? Number(form.ownership_percentage) : null,
      date_purchased: form.date_purchased || null,
      purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      property_address: form.property_address || null,
      parcel_id: form.parcel_id || null,
      total_square_footage: form.total_square_footage ? Number(form.total_square_footage) : null,
      laundromat_square_footage: form.laundromat_square_footage
        ? Number(form.laundromat_square_footage)
        : null,
      other_tenants: form.other_tenants,
      ownership_notes: form.ownership_notes || null,
      mortgages,
      mortgage_lender: mortgages[0]?.lender_name || null,
      current_loan_balance: totalBalance,
      monthly_mortgage_payment: totalMonthlyPayment,
      annual_debt_service: annualDebtService,
      monthly_rent_charged: form.monthly_rent_charged
        ? Number(form.monthly_rent_charged)
        : null,
      market_rent_estimate: form.market_rent_estimate
        ? Number(form.market_rent_estimate)
        : null,
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
            {metrics.mortgages.length > 0 ? (
              <div>
                {metrics.mortgages.map((mortgage, i) => (
                  <div
                    key={i}
                    className={clsx(
                      "py-3",
                      i > 0 && "border-t border-white/[0.06]"
                    )}
                  >
                    <LabelValue label="Lender" value={mortgage.lender_name || "—"} />
                    <LabelValue
                      label="Monthly Payment"
                      value={formatCurrency(mortgage.monthly_payment)}
                    />
                    <LabelValue label="Balance" value={formatCurrency(mortgage.balance)} />
                  </div>
                ))}
                {metrics.mortgages.length > 1 && (
                  <div className="pt-3 mt-1 border-t border-white/[0.08]">
                    <LabelValue
                      label="Total Monthly Payments"
                      value={formatCurrency(metrics.totalMonthlyPayment)}
                    />
                    <LabelValue
                      label="Total Loan Balance"
                      value={formatCurrency(metrics.totalBalance)}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[13px] text-slate-500">No mortgages on file</div>
            )}
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
            <div className="flex items-center justify-between">
              <div className="section-title mb-0">Mortgage & Debt</div>
              <button
                type="button"
                onClick={() => setMortgageForms((f) => [...f, emptyMortgageForm()])}
                className="btn-outline text-[11px]"
              >
                + Add Mortgage
              </button>
            </div>

            {mortgageForms.map((mortgageForm, i) => (
              <div key={i} className="card2 grid grid-cols-4 gap-3 items-end">
                <div>
                  <div className="metric-label mb-1.5">Lender Name</div>
                  <input
                    type="text"
                    value={mortgageForm.lender_name}
                    onChange={(e) => setMortgageField(i, "lender_name", e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Bank or lender name"
                  />
                </div>
                <div>
                  <div className="metric-label mb-1.5">Monthly Payment</div>
                  <input
                    type="number"
                    value={mortgageForm.monthly_payment}
                    onChange={(e) => setMortgageField(i, "monthly_payment", e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="4200"
                  />
                </div>
                <div>
                  <div className="metric-label mb-1.5">Balance</div>
                  <input
                    type="number"
                    value={mortgageForm.balance}
                    onChange={(e) => setMortgageField(i, "balance", e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="520000"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setMortgageForms((f) => f.filter((_, idx) => idx !== i))}
                  className="btn-outline text-[11px] text-red-400 border-red-500/20 hover:bg-red-500/10"
                  disabled={mortgageForms.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
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
