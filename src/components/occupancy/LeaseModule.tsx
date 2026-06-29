"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { invalidateValuationCache } from "@/lib/getStoreValuation";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { SmallMetric } from "@/components/ui/MetricCard";
import clsx from "clsx";
import { getNextRentEscalation } from "@/lib/rent-escalation";
import {
  INPUT_CLASS,
  LabelValue,
  formatBool,
  formatCurrency,
  formatDate,
  formatPct,
  parseDate,
  preventEnterSubmit,
} from "./shared";

type Lease = {
  id: string;
  store_id: string;
  landlord_name: string | null;
  tenant_entity: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  monthly_rent: number | null;
  annual_escalation_pct: number | null;
  cam_charges: number | null;
  square_footage: number | null;
  security_deposit: number | null;
  personal_guaranty: boolean | null;
  assignment_rights: string | null;
  sublease_rights: boolean | null;
  exclusivity_clause: boolean | null;
  use_restrictions: string | null;
};

type LeaseOption = {
  id: string;
  lease_id: string;
  option_number: number | null;
  option_years: number | null;
  status: string | null;
  notice_days: number | null;
};

type Store = {
  id: string;
  address: string | null;
  monthly_revenue: number | null;
};

type LeaseForm = {
  landlord: string;
  tenant_entity: string;
  lease_start_date: string;
  lease_end_date: string;
  monthly_rent: string;
  annual_escalation_pct: string;
  cam_charges: string;
  square_footage: string;
  security_deposit: string;
  personal_guaranty: boolean;
  assignment_rights: string;
  sublease_rights: boolean;
  exclusivity_clause: boolean;
  use_restrictions: string;
};

type OptionForm = {
  id?: string;
  option_number: string;
  option_years: string;
  status: string;
  notice_days: string;
};

const ASSIGNMENT_OPTIONS = ["Allowed", "With Consent", "Not Allowed"];
const OPTION_STATUSES = ["Available", "Exercised", "Expired", "Declined"];

/** Coerce lease booleans; legacy sublease dropdown values must never reach the DB as text. */
function toLeaseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "allowed", "with consent"].includes(normalized)) return true;
    return false;
  }
  return Boolean(value);
}

function emptyLeaseForm(): LeaseForm {
  return {
    landlord: "",
    tenant_entity: "",
    lease_start_date: "",
    lease_end_date: "",
    monthly_rent: "",
    annual_escalation_pct: "",
    cam_charges: "",
    square_footage: "",
    security_deposit: "",
    personal_guaranty: false,
    assignment_rights: "With Consent",
    sublease_rights: false,
    exclusivity_clause: false,
    use_restrictions: "",
  };
}

function leaseToForm(lease: Lease): LeaseForm {
  return {
    landlord: lease.landlord_name ?? "",
    tenant_entity: lease.tenant_entity ?? "",
    lease_start_date: lease.lease_start_date?.split("T")[0] ?? "",
    lease_end_date: lease.lease_end_date?.split("T")[0] ?? "",
    monthly_rent: lease.monthly_rent != null ? String(lease.monthly_rent) : "",
    annual_escalation_pct:
      lease.annual_escalation_pct != null ? String(lease.annual_escalation_pct) : "",
    cam_charges: lease.cam_charges != null ? String(lease.cam_charges) : "",
    square_footage: lease.square_footage != null ? String(lease.square_footage) : "",
    security_deposit: lease.security_deposit != null ? String(lease.security_deposit) : "",
    personal_guaranty: toLeaseBoolean(lease.personal_guaranty),
    assignment_rights: lease.assignment_rights ?? "With Consent",
    sublease_rights: toLeaseBoolean(lease.sublease_rights),
    exclusivity_clause: toLeaseBoolean(lease.exclusivity_clause),
    use_restrictions: lease.use_restrictions ?? "",
  };
}

function optionToForm(option: LeaseOption): OptionForm {
  return {
    id: option.id,
    option_number: option.option_number != null ? String(option.option_number) : "",
    option_years: option.option_years != null ? String(option.option_years) : "",
    status: option.status ?? "Available",
    notice_days: option.notice_days != null ? String(option.notice_days) : "",
  };
}

function emptyOptionForm(index: number): OptionForm {
  return {
    option_number: String(index + 1),
    option_years: "",
    status: "Available",
    notice_days: "",
  };
}

function diffInMonths(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function calcYearsRemaining(endDate: string | null): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  const now = new Date();
  const ms = end.getTime() - now.getTime();
  return Math.max(0, ms / (365.25 * 24 * 60 * 60 * 1000));
}

function calcMonthsRemaining(endDate: string | null): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  const now = new Date();
  return Math.max(0, diffInMonths(now, end));
}

function calcLeaseScore(params: {
  yearsRemaining: number;
  availableOptions: number;
  exclusivityClause: boolean;
  personalGuaranty: boolean;
  assignmentRights: string | null;
  monthlyRent: number | null;
  monthlyRevenue: number | null;
}): number {
  let score = 50;

  if (params.yearsRemaining >= 10) score += 25;
  else if (params.yearsRemaining >= 7) score += 15;
  else if (params.yearsRemaining >= 5) score += 8;

  if (params.availableOptions >= 2) score += 10;
  else if (params.availableOptions === 1) score += 5;

  if (params.exclusivityClause) score += 5;
  if (params.personalGuaranty) score -= 10;
  if (params.assignmentRights === "Not Allowed") score -= 5;

  if (params.monthlyRent != null && params.monthlyRevenue != null && params.monthlyRevenue > 0) {
    const rentToRevenue = (params.monthlyRent / params.monthlyRevenue) * 100;
    if (rentToRevenue > 20) score -= 15;
  }

  return Math.min(100, Math.max(0, score));
}

function riskFromScore(score: number): { label: string; color: string; ringColor: string } {
  if (score >= 75) return { label: "Low Risk", color: "text-green-400", ringColor: "#22c55e" };
  if (score >= 50) return { label: "Moderate Risk", color: "text-amber-400", ringColor: "#f59e0b" };
  return { label: "High Risk", color: "text-red-400", ringColor: "#ef4444" };
}

function calcDaysUntilNoticeDeadline(
  leaseEndDate: string | null,
  options: LeaseOption[]
): number | null {
  const end = parseDate(leaseEndDate);
  if (!end) return null;

  const available = options.filter((o) => o.status === "Available" && o.notice_days != null);
  if (available.length === 0) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let earliestDays: number | null = null;
  for (const opt of available) {
    const deadline = new Date(end);
    deadline.setDate(deadline.getDate() - (opt.notice_days ?? 0));
    deadline.setHours(0, 0, 0, 0);
    const days = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (earliestDays === null || days < earliestDays) earliestDays = days;
  }

  return earliestDays;
}

type Props = {
  store: Store;
  editTrigger?: number;
  hideHeader?: boolean;
  onLeaseStatus?: (hasLease: boolean) => void;
};

export function LeaseModule({ store, editTrigger, hideHeader, onLeaseStatus }: Props) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<"view" | "edit">("view");

  const [lease, setLease] = useState<Lease | null>(null);
  const [options, setOptions] = useState<LeaseOption[]>([]);
  const [leaseForm, setLeaseForm] = useState<LeaseForm>(emptyLeaseForm());
  const [optionForms, setOptionForms] = useState<OptionForm[]>([]);

  function setLeaseField(field: keyof LeaseForm, value: string | boolean) {
    setLeaseForm((f) => ({ ...f, [field]: value }));
  }

  function setOptionField(index: number, field: keyof OptionForm, value: string) {
    setOptionForms((forms) => forms.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }

  async function loadData() {
    setLoading(true);
    setError("");

    const { data: leaseData, error: leaseError } = await supabase
      .from("leases")
      .select("*")
      .eq("store_id", store.id)
      .limit(1)
      .maybeSingle();

    if (leaseError) {
      setError(leaseError.message);
      setLoading(false);
      return;
    }

    if (leaseData) {
      setLease(leaseData);
      onLeaseStatus?.(true);
      setLeaseForm(leaseToForm(leaseData));

      const { data: optionsData, error: optionsError } = await supabase
        .from("lease_options")
        .select("*")
        .eq("lease_id", leaseData.id)
        .order("option_number", { ascending: true });

      if (optionsError) {
        setError(optionsError.message);
      } else {
        const opts = optionsData ?? [];
        setOptions(opts);
        setOptionForms(opts.map(optionToForm));
      }
    } else {
      setLease(null);
      onLeaseStatus?.(false);
      setOptions([]);
      setLeaseForm(emptyLeaseForm());
      setOptionForms([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [store.id]);

  const metrics = useMemo(() => {
    const yearsRemaining = calcYearsRemaining(lease?.lease_end_date ?? null);
    const monthsRemaining = calcMonthsRemaining(lease?.lease_end_date ?? null);
    const availableOptions = options.filter((o) => o.status === "Available");
    const optionYears = availableOptions.reduce((sum, o) => sum + (o.option_years ?? 0), 0);
    const totalControl = yearsRemaining + optionYears;
    const score = calcLeaseScore({
      yearsRemaining,
      availableOptions: availableOptions.length,
      exclusivityClause: lease?.exclusivity_clause ?? false,
      personalGuaranty: lease?.personal_guaranty ?? false,
      assignmentRights: lease?.assignment_rights ?? null,
      monthlyRent: lease?.monthly_rent ?? null,
      monthlyRevenue: store.monthly_revenue ?? null,
    });
    const risk = riskFromScore(score);
    const daysUntilNotice = calcDaysUntilNoticeDeadline(lease?.lease_end_date ?? null, options);

    const rentEscalation = lease
      ? getNextRentEscalation(
          lease.lease_start_date,
          lease.annual_escalation_pct,
          lease.monthly_rent
        )
      : null;

    return {
      yearsRemaining,
      monthsRemaining,
      totalControl,
      score,
      risk,
      daysUntilNotice,
      availableOptions,
      rentEscalation,
    };
  }, [lease, options, store]);

  function enterEditMode() {
    if (lease) {
      setLeaseForm(leaseToForm(lease));
      setOptionForms(options.length > 0 ? options.map(optionToForm) : [emptyOptionForm(0)]);
    } else {
      setLeaseForm(emptyLeaseForm());
      setOptionForms([emptyOptionForm(0)]);
    }
    setMode("edit");
    setSaveStatus("idle");
    setSaving(false);
    setError("");
    setSuccess("");
  }

  useEffect(() => {
    if (editTrigger && editTrigger > 0) {
      enterEditMode();
    }
  }, [editTrigger]);

  function cancelEdit() {
    if (lease) {
      setLeaseForm(leaseToForm(lease));
      setOptionForms(options.map(optionToForm));
    }
    setMode("view");
    setSaveStatus("idle");
    setSaving(false);
    setError("");
    setSuccess("");
  }

  async function handleSave() {
    if (saving || saveStatus === "success") return;
    setSaving(true);
    setSaveStatus("idle");
    setError("");
    setSuccess("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaveStatus("error");
        setError("We couldn't save this lease. Please try again.");
        setSaving(false);
        return;
      }

      const { data: savedLease, error: leaseError } = await supabase
        .from("leases")
        .upsert(
          {
            store_id: store.id,
            user_id: user.id,
            landlord_name: leaseForm.landlord || null,
            tenant_entity: leaseForm.tenant_entity || null,
            lease_start_date: leaseForm.lease_start_date || null,
            lease_end_date: leaseForm.lease_end_date || null,
            monthly_rent: Number(leaseForm.monthly_rent) || 0,
            annual_escalation_pct: Number(leaseForm.annual_escalation_pct) || 0,
            cam_charges: Number(leaseForm.cam_charges) || 0,
            security_deposit: Number(leaseForm.security_deposit) || 0,
            square_footage: Number(leaseForm.square_footage) || 0,
            personal_guaranty: toLeaseBoolean(leaseForm.personal_guaranty),
            assignment_rights: leaseForm.assignment_rights || null,
            sublease_rights: toLeaseBoolean(leaseForm.sublease_rights),
            exclusivity_clause: toLeaseBoolean(leaseForm.exclusivity_clause),
            use_restrictions: leaseForm.use_restrictions || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "store_id" }
        )
        .select()
        .single();

      if (leaseError || !savedLease) {
        console.error("Lease save error:", leaseError);
        setSaveStatus("error");
        setError("We couldn't save this lease. Please try again.");
        setSaving(false);
        return;
      }

      const leaseId = savedLease.id;
      const existingIds = options.map((o) => o.id);
      const formIds = optionForms.filter((f) => f.id).map((f) => f.id!);
      const toDelete = existingIds.filter((id) => !formIds.includes(id));

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("lease_options")
          .delete()
          .in("id", toDelete);
        if (deleteError) {
          console.error("Lease options delete error (non-blocking):", deleteError);
        }
      }

      for (const form of optionForms) {
        if (!form.option_years && !form.notice_days) continue;

        const optionPayload = {
          lease_id: leaseId,
          store_id: store.id,
          user_id: user.id,
          option_number: Number(form.option_number) || 0,
          option_years: Number(form.option_years) || 0,
          status: form.status || "Available",
          notice_days: Number(form.notice_days) || 0,
        };

        if (form.id) {
          const { error: optError } = await supabase
            .from("lease_options")
            .upsert({ id: form.id, ...optionPayload }, { onConflict: "id" });
          if (optError) {
            console.error("Lease option update error (non-blocking):", optError);
          }
        } else {
          const { error: optError } = await supabase.from("lease_options").insert(optionPayload);
          if (optError) {
            console.error("Lease option insert error (non-blocking):", optError);
          }
        }
      }

      invalidateValuationCache(store.id);
      setSaveStatus("success");
      setSuccess("Saved successfully.");
      setTimeout(() => setSuccess(""), 3000);
      setMode("view");
      setSaving(false);
      await loadData();
    } catch (err) {
      console.error("Unexpected lease save error:", err);
      setSaveStatus("error");
      setError("We couldn't save this lease. Please try again.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-700 dark:text-slate-500 text-[13px]">Loading lease data...</div>
      </div>
    );
  }

  const assignmentBadge =
    lease?.assignment_rights === "Not Allowed"
      ? "badge-red"
      : lease?.assignment_rights === "Allowed"
        ? "badge-green"
        : "badge-amber";

  const exclusivityBadge = lease?.exclusivity_clause ? "badge-green" : "badge-amber";
  const guarantyBadge = lease?.personal_guaranty ? "badge-amber" : "badge-green";

  return (
    <div className="space-y-5">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-100">Lease Management</h2>
            <p className="text-gray-700 dark:text-slate-500 text-[13px] mt-0.5">Third-party leased location</p>
          </div>
          {mode === "view" ? (
            <button type="button" onClick={enterEditMode} className="btn-primary">
              {lease ? "Edit Lease" : "Add Lease"}
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={cancelEdit} className="btn-outline" disabled={saving}>
                Cancel
              </button>
              <button type="button" onClick={handleSave} className="btn-primary" disabled={saving || saveStatus === "success"}>
                {saveStatus === "success" ? "Saved ✓" : saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      )}
      {hideHeader && mode === "edit" && (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancelEdit} className="btn-outline" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="btn-primary" disabled={saving || saveStatus === "success"}>
            {saveStatus === "success" ? "Saved ✓" : saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {error && (
        <div
          className="rounded-lg p-3 text-[12px] mb-4"
          style={{ background: "var(--bg-danger-tint)", color: "var(--text-danger)" }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="rounded-lg p-3 text-[12px] mb-4"
          style={{ background: "var(--bg-success-tint)", color: "var(--text-success)" }}
        >
          {success}
        </div>
      )}

      {mode === "view" && !lease && hideHeader ? null : mode === "view" && !lease && !hideHeader ? (
        <div className="card text-center py-12">
          <div className="text-slate-900 dark:text-slate-300 text-[14px]">No lease on file</div>
          <p className="text-gray-700 dark:text-slate-500 text-[13px] mt-2 mb-4">
            Add your lease terms to calculate risk score and track renewal options.
          </p>
          <button type="button" onClick={enterEditMode} className="btn-primary">
            Add Lease
          </button>
        </div>
      ) : mode === "view" && lease ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="card flex flex-col items-center justify-center py-4">
              <div className="metric-label mb-2">Lease Score</div>
              <ScoreRing score={metrics.score} size={90} color={metrics.risk.ringColor} />
              <div className={clsx("text-[12px] font-semibold mt-2", metrics.risk.color)}>
                {metrics.score}/100
              </div>
            </div>
            <SmallMetric
              label="Years Remaining"
              value={metrics.yearsRemaining.toFixed(1)}
              color="text-blue-400"
            />
            <SmallMetric
              label="Months Remaining"
              value={String(metrics.monthsRemaining)}
              color="text-slate-100"
            />
            <SmallMetric
              label="Total Control Remaining"
              value={metrics.totalControl.toFixed(1) + " yrs"}
              color="text-green-400"
            />
            <div className="card2">
              <div className="metric-label">Lease Risk Level</div>
              <div className={clsx("text-lg font-bold", metrics.risk.color)}>
                {metrics.risk.label}
              </div>
            </div>
            <SmallMetric
              label="Days Until Notice Deadline"
              value={
                metrics.daysUntilNotice != null
                  ? metrics.daysUntilNotice <= 0
                    ? "Past due"
                    : String(metrics.daysUntilNotice)
                  : "N/A"
              }
              color={
                metrics.daysUntilNotice != null && metrics.daysUntilNotice < 90
                  ? "text-amber-400"
                  : "text-slate-100"
              }
            />
          </div>

          {metrics.rentEscalation && (
            <div
              className={clsx(
                "card p-4 border",
                metrics.rentEscalation.monthsUntil <= 3
                  ? "bg-red-500/8 border-red-500/20"
                  : metrics.rentEscalation.monthsUntil <= 6
                    ? "bg-amber-500/8 border-amber-500/20"
                    : "bg-blue-500/8 border-blue-500/20"
              )}
            >
              <div className="text-[10px] uppercase tracking-wider text-gray-700 dark:text-slate-500 mb-1">
                Next Rent Escalation
              </div>
              <div className="text-[13px] font-semibold text-slate-100">
                {metrics.rentEscalation.nextDate.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                <span className="text-gray-700 dark:text-slate-400 font-normal">
                  {" "}
                  · in{" "}
                  {metrics.rentEscalation.monthsUntil === 1
                    ? "1 month"
                    : `${metrics.rentEscalation.monthsUntil} months`}
                </span>
              </div>
              <div className="text-[12px] text-gray-700 dark:text-slate-400 mt-1">
                Monthly rent increases from {formatCurrency(metrics.rentEscalation.currentRent)} to{" "}
                {formatCurrency(metrics.rentEscalation.newRent)} (+{formatCurrency(metrics.rentEscalation.increase)})
              </div>
            </div>
          )}

          <div className="card">
            <div className="section-title">Base Lease Information</div>
            <div>
              <LabelValue label="Landlord" value={lease.landlord_name ?? "—"} />
              <LabelValue label="Tenant Entity" value={lease.tenant_entity ?? "—"} />
              <LabelValue label="Store Address" value={store.address ?? "—"} />
              <LabelValue label="Lease Start Date" value={formatDate(lease.lease_start_date)} />
              <LabelValue label="Lease End Date" value={formatDate(lease.lease_end_date)} />
              <LabelValue label="Monthly Rent" value={formatCurrency(lease.monthly_rent)} />
              <LabelValue
                label="Annual Escalation %"
                value={formatPct(lease.annual_escalation_pct)}
              />
              <LabelValue label="CAM Charges" value={formatCurrency(lease.cam_charges)} />
              <LabelValue
                label="Square Footage"
                value={
                  lease.square_footage != null
                    ? lease.square_footage.toLocaleString() + " sq ft"
                    : "—"
                }
              />
              <LabelValue label="Security Deposit" value={formatCurrency(lease.security_deposit)} />
              <LabelValue
                label="Personal Guaranty"
                value={formatBool(lease.personal_guaranty)}
                badge={guarantyBadge}
              />
              <LabelValue
                label="Assignment Rights"
                value={lease.assignment_rights ?? "—"}
                badge={assignmentBadge}
              />
              <LabelValue
                label="Sublease Rights"
                value={formatBool(lease.sublease_rights)}
              />
              <LabelValue
                label="Exclusivity Clause"
                value={formatBool(lease.exclusivity_clause)}
                badge={exclusivityBadge}
              />
              <LabelValue label="Use Restrictions" value={lease.use_restrictions ?? "—"} />
            </div>
          </div>

          <div className="card">
            <div className="section-title">Renewal Options</div>
            {options.length === 0 ? (
              <p className="text-gray-700 dark:text-slate-500 text-[13px]">No renewal options on file.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] text-gray-700 dark:text-slate-600 uppercase tracking-wider border-b border-white/[0.06]">
                      <th className="text-left pb-2 font-medium">Option #</th>
                      <th className="text-left pb-2 font-medium">Term (Years)</th>
                      <th className="text-left pb-2 font-medium">Status</th>
                      <th className="text-left pb-2 font-medium">Notice Required</th>
                      <th className="text-left pb-2 font-medium">Notice Deadline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {options.map((opt) => {
                      const end = parseDate(lease.lease_end_date);
                      let deadline = "—";
                      if (end && opt.notice_days != null) {
                        const d = new Date(end);
                        d.setDate(d.getDate() - opt.notice_days);
                        deadline = d.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        });
                      }
                      const statusColor =
                        opt.status === "Available"
                          ? "badge-green"
                          : opt.status === "Exercised"
                            ? "badge-blue"
                            : "badge-amber";
                      return (
                        <tr key={opt.id}>
                          <td className="py-2.5 text-slate-900 dark:text-slate-300">{opt.option_number ?? "—"}</td>
                          <td className="py-2.5 text-slate-900 dark:text-slate-300">{opt.option_years ?? "—"}</td>
                          <td className="py-2.5">
                            <span className={clsx("badge", statusColor)}>{opt.status ?? "—"}</span>
                          </td>
                          <td className="py-2.5 text-gray-700 dark:text-slate-400">
                            {opt.notice_days != null ? `${opt.notice_days} days` : "—"}
                          </td>
                          <td className="py-2.5 text-slate-900 dark:text-slate-300">{deadline}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {metrics.availableOptions.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-blue-500/8 border border-blue-500/20 text-[12px] text-blue-300">
                {metrics.availableOptions.length} available option
                {metrics.availableOptions.length !== 1 ? "s" : ""} adding{" "}
                {metrics.availableOptions.reduce((s, o) => s + (o.option_years ?? 0), 0)} years of
                total site control.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-5">
          <div className="card space-y-4">
            <div className="section-title mb-0">Base Lease Information</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div>
                <div className="metric-label mb-1.5">Landlord</div>
                <input
                  type="text"
                  value={leaseForm.landlord}
                  onChange={(e) => setLeaseField("landlord", e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                  placeholder="Property owner or LLC"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Tenant Entity</div>
                <input
                  type="text"
                  value={leaseForm.tenant_entity}
                  onChange={(e) => setLeaseField("tenant_entity", e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                  placeholder="Your LLC or entity name"
                />
              </div>
            </div>

            <div>
              <div className="metric-label mb-1.5">Store Address</div>
              <input
                type="text"
                value={store.address ?? ""}
                disabled
                className={INPUT_CLASS + " opacity-60 cursor-not-allowed"}
              />
              <p className="text-[11px] text-gray-700 dark:text-slate-600 mt-1">Edit address in Store Settings</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div>
                <div className="metric-label mb-1.5">Lease Start Date</div>
                <input
                  type="date"
                  value={leaseForm.lease_start_date}
                  onChange={(e) => setLeaseField("lease_start_date", e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Lease End Date</div>
                <input
                  type="date"
                  value={leaseForm.lease_end_date}
                  onChange={(e) => setLeaseField("lease_end_date", e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="metric-label mb-1.5">Monthly Rent</div>
                <input
                  type="number"
                  value={leaseForm.monthly_rent}
                  onChange={(e) => setLeaseField("monthly_rent", e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                  placeholder="6200"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Annual Escalation %</div>
                <input
                  type="number"
                  step="0.1"
                  value={leaseForm.annual_escalation_pct}
                  onChange={(e) => setLeaseField("annual_escalation_pct", e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                  placeholder="3.0"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">CAM Charges</div>
                <input
                  type="number"
                  value={leaseForm.cam_charges}
                  onChange={(e) => setLeaseField("cam_charges", e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                  placeholder="850"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div>
                <div className="metric-label mb-1.5">Square Footage</div>
                <input
                  type="number"
                  value={leaseForm.square_footage}
                  onChange={(e) => setLeaseField("square_footage", e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                  placeholder="4450"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Security Deposit</div>
                <input
                  type="number"
                  value={leaseForm.security_deposit}
                  onChange={(e) => setLeaseField("security_deposit", e.target.value)}
                  onKeyDown={preventEnterSubmit}
                  className={INPUT_CLASS}
                  placeholder="15000"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div>
                <div className="metric-label mb-1.5">Assignment Rights</div>
                <select
                  value={leaseForm.assignment_rights}
                  onChange={(e) => setLeaseField("assignment_rights", e.target.value)}
                  className={INPUT_CLASS}
                >
                  {ASSIGNMENT_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-[13px] text-slate-900 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leaseForm.sublease_rights}
                  onChange={(e) => setLeaseField("sublease_rights", e.target.checked)}
                  className="rounded border-white/20"
                />
                Sublease Rights
              </label>
              <label className="flex items-center gap-2 text-[13px] text-slate-900 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leaseForm.personal_guaranty}
                  onChange={(e) => setLeaseField("personal_guaranty", e.target.checked)}
                  className="rounded border-white/20"
                />
                Personal Guaranty
              </label>
              <label className="flex items-center gap-2 text-[13px] text-slate-900 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leaseForm.exclusivity_clause}
                  onChange={(e) => setLeaseField("exclusivity_clause", e.target.checked)}
                  className="rounded border-white/20"
                />
                Exclusivity Clause
              </label>
            </div>

            <div>
              <div className="metric-label mb-1.5">Use Restrictions</div>
              <textarea
                value={leaseForm.use_restrictions}
                onChange={(e) => setLeaseField("use_restrictions", e.target.value)}
                onKeyDown={preventEnterSubmit}
                className={INPUT_CLASS + " min-h-[80px] resize-y"}
                placeholder="Any use restrictions in the lease..."
              />
            </div>
          </div>

          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="section-title mb-0">Renewal Options</div>
              <button
                type="button"
                onClick={() => setOptionForms((f) => [...f, emptyOptionForm(f.length)])}
                className="btn-outline text-[11px]"
              >
                + Add Option
              </button>
            </div>

            {optionForms.map((form, i) => (
              <div key={form.id ?? `new-${i}`} className="card2 grid grid-cols-5 gap-3 items-end">
                <div>
                  <div className="metric-label mb-1.5">Option #</div>
                  <input
                    type="number"
                    value={form.option_number}
                    onChange={(e) => setOptionField(i, "option_number", e.target.value)}
                    onKeyDown={preventEnterSubmit}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <div className="metric-label mb-1.5">Term (Years)</div>
                  <input
                    type="number"
                    value={form.option_years}
                    onChange={(e) => setOptionField(i, "option_years", e.target.value)}
                    onKeyDown={preventEnterSubmit}
                    className={INPUT_CLASS}
                    placeholder="5"
                  />
                </div>
                <div>
                  <div className="metric-label mb-1.5">Status</div>
                  <select
                    value={form.status}
                    onChange={(e) => setOptionField(i, "status", e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {OPTION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="metric-label mb-1.5">Notice Days</div>
                  <input
                    type="number"
                    value={form.notice_days}
                    onChange={(e) => setOptionField(i, "notice_days", e.target.value)}
                    onKeyDown={preventEnterSubmit}
                    className={INPUT_CLASS}
                    placeholder="180"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setOptionForms((f) => f.filter((_, idx) => idx !== i))}
                  className="btn-outline text-[11px] text-red-400 border-red-500/20 hover:bg-red-500/10"
                  disabled={optionForms.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
