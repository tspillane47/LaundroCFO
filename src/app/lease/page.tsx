"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { SmallMetric } from "@/components/ui/MetricCard";
import clsx from "clsx";

type Lease = {
  id: string;
  store_id: string;
  landlord: string | null;
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
  sublease_rights: string | null;
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
  sublease_rights: string;
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

const INPUT_CLASS =
  "w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500";

const ASSIGNMENT_OPTIONS = ["Allowed", "With Consent", "Not Allowed"];
const SUBLEASE_OPTIONS = ["Allowed", "With Consent", "Not Allowed", "Prohibited"];
const OPTION_STATUSES = ["Available", "Exercised", "Expired", "Declined"];

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
    sublease_rights: "With Consent",
    exclusivity_clause: false,
    use_restrictions: "",
  };
}

function leaseToForm(lease: Lease): LeaseForm {
  return {
    landlord: lease.landlord ?? "",
    tenant_entity: lease.tenant_entity ?? "",
    lease_start_date: lease.lease_start_date?.split("T")[0] ?? "",
    lease_end_date: lease.lease_end_date?.split("T")[0] ?? "",
    monthly_rent: lease.monthly_rent != null ? String(lease.monthly_rent) : "",
    annual_escalation_pct:
      lease.annual_escalation_pct != null ? String(lease.annual_escalation_pct) : "",
    cam_charges: lease.cam_charges != null ? String(lease.cam_charges) : "",
    square_footage: lease.square_footage != null ? String(lease.square_footage) : "",
    security_deposit: lease.security_deposit != null ? String(lease.security_deposit) : "",
    personal_guaranty: lease.personal_guaranty ?? false,
    assignment_rights: lease.assignment_rights ?? "With Consent",
    sublease_rights: lease.sublease_rights ?? "With Consent",
    exclusivity_clause: lease.exclusivity_clause ?? false,
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

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: string | null): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(1) + "%";
}

function formatBool(value: boolean | null): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
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

function LabelValue({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-[13px] border-b border-white/[0.04] last:border-b-0">
      <span className="text-slate-400">{label}</span>
      {badge ? (
        <span className={`badge ${badge}`}>{value}</span>
      ) : (
        <span className="font-semibold text-slate-100 text-right max-w-[60%]">{value}</span>
      )}
    </div>
  );
}

export default function LeasePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<"view" | "edit">("view");

  const [store, setStore] = useState<Store | null>(null);
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: storeData, error: storeError } = await supabase
      .from("stores")
      .select("id, address, monthly_revenue")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (storeError || !storeData) {
      setError(storeError?.message ?? "No store found. Complete onboarding first.");
      setLoading(false);
      return;
    }

    setStore(storeData);

    const { data: leaseData, error: leaseError } = await supabase
      .from("leases")
      .select("*")
      .eq("store_id", storeData.id)
      .limit(1)
      .maybeSingle();

    if (leaseError) {
      setError(leaseError.message);
      setLoading(false);
      return;
    }

    if (leaseData) {
      setLease(leaseData);
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
      setOptions([]);
      setLeaseForm(emptyLeaseForm());
      setOptionForms([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

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
      monthlyRevenue: store?.monthly_revenue ?? null,
    });
    const risk = riskFromScore(score);
    const daysUntilNotice = calcDaysUntilNoticeDeadline(lease?.lease_end_date ?? null, options);

    return {
      yearsRemaining,
      monthsRemaining,
      totalControl,
      score,
      risk,
      daysUntilNotice,
      availableOptions,
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
    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    if (lease) {
      setLeaseForm(leaseToForm(lease));
      setOptionForms(options.map(optionToForm));
    }
    setMode("view");
    setError("");
    setSuccess("");
  }

  async function handleSave() {
    if (!store) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const leasePayload = {
      store_id: store.id,
      landlord: leaseForm.landlord || null,
      tenant_entity: leaseForm.tenant_entity || null,
      lease_start_date: leaseForm.lease_start_date || null,
      lease_end_date: leaseForm.lease_end_date || null,
      monthly_rent: leaseForm.monthly_rent ? Number(leaseForm.monthly_rent) : null,
      annual_escalation_pct: leaseForm.annual_escalation_pct
        ? Number(leaseForm.annual_escalation_pct)
        : null,
      cam_charges: leaseForm.cam_charges ? Number(leaseForm.cam_charges) : null,
      square_footage: leaseForm.square_footage ? Number(leaseForm.square_footage) : null,
      security_deposit: leaseForm.security_deposit ? Number(leaseForm.security_deposit) : null,
      personal_guaranty: leaseForm.personal_guaranty,
      assignment_rights: leaseForm.assignment_rights || null,
      sublease_rights: leaseForm.sublease_rights || null,
      exclusivity_clause: leaseForm.exclusivity_clause,
      use_restrictions: leaseForm.use_restrictions || null,
    };

    let leaseId = lease?.id;

    if (leaseId) {
      const { error: updateError } = await supabase
        .from("leases")
        .update(leasePayload)
        .eq("id", leaseId);
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("leases")
        .insert(leasePayload)
        .select()
        .single();
      if (insertError || !inserted) {
        setError(insertError?.message ?? "Failed to create lease");
        setSaving(false);
        return;
      }
      leaseId = inserted.id;
    }

    const existingIds = options.map((o) => o.id);
    const formIds = optionForms.filter((f) => f.id).map((f) => f.id!);
    const toDelete = existingIds.filter((id) => !formIds.includes(id));

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("lease_options")
        .delete()
        .in("id", toDelete);
      if (deleteError) {
        setError(deleteError.message);
        setSaving(false);
        return;
      }
    }

    for (const form of optionForms) {
      if (!form.option_years && !form.notice_days) continue;

      const optionPayload = {
        lease_id: leaseId,
        option_number: form.option_number ? Number(form.option_number) : null,
        option_years: form.option_years ? Number(form.option_years) : null,
        status: form.status || "Available",
        notice_days: form.notice_days ? Number(form.notice_days) : null,
      };

      if (form.id) {
        const { error: optUpdateError } = await supabase
          .from("lease_options")
          .update(optionPayload)
          .eq("id", form.id);
        if (optUpdateError) {
          setError(optUpdateError.message);
          setSaving(false);
          return;
        }
      } else {
        const { error: optInsertError } = await supabase
          .from("lease_options")
          .insert(optionPayload);
        if (optInsertError) {
          setError(optInsertError.message);
          setSaving(false);
          return;
        }
      }
    }

    setSuccess("Lease saved successfully.");
    setMode("view");
    setSaving(false);
    await loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500 text-[13px]">Loading lease data...</div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="card text-center py-12">
        <div className="text-slate-300 text-[14px]">No store found.</div>
        <p className="text-slate-500 text-[13px] mt-2">Complete onboarding to manage your lease.</p>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">Lease Management</h1>
          <p className="text-slate-500 text-[13px] mt-0.5">
            {store.address ?? "Store address not set"}
          </p>
        </div>
        {mode === "view" ? (
          <button onClick={enterEditMode} className="btn-primary">
            {lease ? "Edit Lease" : "Add Lease"}
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

      {mode === "view" && !lease ? (
        <div className="card text-center py-12">
          <div className="text-slate-300 text-[14px]">No lease on file</div>
          <p className="text-slate-500 text-[13px] mt-2 mb-4">
            Add your lease terms to calculate risk score and track renewal options.
          </p>
          <button onClick={enterEditMode} className="btn-primary">
            Add Lease
          </button>
        </div>
      ) : mode === "view" && lease ? (
        <>
          {/* SECTION 1 — Lease Overview */}
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

          {/* SECTION 2 — Base Lease Information */}
          <div className="card">
            <div className="section-title">Base Lease Information</div>
            <div>
              <LabelValue label="Landlord" value={lease.landlord ?? "—"} />
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
                  lease.square_footage != null ? lease.square_footage.toLocaleString() + " sq ft" : "—"
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
              <LabelValue label="Sublease Rights" value={lease.sublease_rights ?? "—"} />
              <LabelValue
                label="Exclusivity Clause"
                value={formatBool(lease.exclusivity_clause)}
                badge={exclusivityBadge}
              />
              <LabelValue label="Use Restrictions" value={lease.use_restrictions ?? "—"} />
            </div>
          </div>

          {/* SECTION 3 — Renewal Options */}
          <div className="card">
            <div className="section-title">Renewal Options</div>
            {options.length === 0 ? (
              <p className="text-slate-500 text-[13px]">No renewal options on file.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.06]">
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
                          <td className="py-2.5 text-slate-300">{opt.option_number ?? "—"}</td>
                          <td className="py-2.5 text-slate-300">{opt.option_years ?? "—"}</td>
                          <td className="py-2.5">
                            <span className={clsx("badge", statusColor)}>{opt.status ?? "—"}</span>
                          </td>
                          <td className="py-2.5 text-slate-400">
                            {opt.notice_days != null ? `${opt.notice_days} days` : "—"}
                          </td>
                          <td className="py-2.5 text-slate-300">{deadline}</td>
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
        /* EDIT MODE */
        <div className="space-y-5">
          <div className="card space-y-4">
            <div className="section-title mb-0">Base Lease Information</div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label mb-1.5">Landlord</div>
                <input
                  type="text"
                  value={leaseForm.landlord}
                  onChange={(e) => setLeaseField("landlord", e.target.value)}
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
              <p className="text-[11px] text-slate-600 mt-1">Edit address in Store Settings</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label mb-1.5">Lease Start Date</div>
                <input
                  type="date"
                  value={leaseForm.lease_start_date}
                  onChange={(e) => setLeaseField("lease_start_date", e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Lease End Date</div>
                <input
                  type="date"
                  value={leaseForm.lease_end_date}
                  onChange={(e) => setLeaseField("lease_end_date", e.target.value)}
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
                  className={INPUT_CLASS}
                  placeholder="850"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="metric-label mb-1.5">Square Footage</div>
                <input
                  type="number"
                  value={leaseForm.square_footage}
                  onChange={(e) => setLeaseField("square_footage", e.target.value)}
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
                  className={INPUT_CLASS}
                  placeholder="15000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <div className="metric-label mb-1.5">Sublease Rights</div>
                <select
                  value={leaseForm.sublease_rights}
                  onChange={(e) => setLeaseField("sublease_rights", e.target.value)}
                  className={INPUT_CLASS}
                >
                  {SUBLEASE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-[13px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leaseForm.personal_guaranty}
                  onChange={(e) => setLeaseField("personal_guaranty", e.target.checked)}
                  className="rounded border-white/20"
                />
                Personal Guaranty
              </label>
              <label className="flex items-center gap-2 text-[13px] text-slate-300 cursor-pointer">
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
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <div className="metric-label mb-1.5">Term (Years)</div>
                  <input
                    type="number"
                    value={form.option_years}
                    onChange={(e) => setOptionField(i, "option_years", e.target.value)}
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
