"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { MetricCard } from "@/components/ui/MetricCard";
import { ScoreRing } from "@/components/ui/ScoreRing";
import {
  INPUT_CLASS,
  formatCurrency,
  formatDate,
  parseDate,
} from "@/components/occupancy/shared";

// ─── Types ───────────────────────────────────────────────────────────────────

type Store = {
  id: string;
  name: string | null;
  address: string | null;
};

type InsurancePolicy = {
  id: string;
  user_id: string;
  store_id: string;
  is_active: boolean;
  policy_type: string | null;
  carrier: string | null;
  policy_number: string | null;
  agent_name: string | null;
  agency_name: string | null;
  agent_email: string | null;
  agent_phone: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  auto_renewal: boolean | null;
  annual_premium: number | null;
  monthly_premium: number | null;
  payment_frequency: string | null;
  building_coverage: number | null;
  contents_coverage: number | null;
  equipment_coverage: number | null;
  replacement_cost: boolean | null;
  liability_per_occurrence: number | null;
  liability_aggregate: number | null;
  business_interruption: boolean | null;
  business_interruption_amount: number | null;
  flood_coverage: boolean | null;
  flood_amount: number | null;
  equipment_breakdown: boolean | null;
  equipment_breakdown_amount: number | null;
  sewer_backup: boolean | null;
  water_damage: boolean | null;
  employee_theft: boolean | null;
  cyber_coverage: boolean | null;
  utility_interruption: boolean | null;
  ordinance_law: boolean | null;
  property_deductible: number | null;
  wind_deductible: number | null;
  flood_deductible: number | null;
  equipment_deductible: number | null;
  notes: string | null;
};

type InsuranceClaim = {
  id: string;
  policy_id: string;
  claim_date: string | null;
  claim_type: string | null;
  description: string | null;
  amount: number | null;
  status: string | null;
};

type PolicyForm = {
  policy_type: string;
  carrier: string;
  policy_number: string;
  agent_name: string;
  agency_name: string;
  agent_email: string;
  agent_phone: string;
  effective_date: string;
  expiration_date: string;
  auto_renewal: boolean;
  annual_premium: string;
  monthly_premium: string;
  payment_frequency: string;
  building_coverage: string;
  contents_coverage: string;
  equipment_coverage: string;
  replacement_cost: boolean;
  liability_per_occurrence: string;
  liability_aggregate: string;
  business_interruption: boolean;
  business_interruption_amount: string;
  flood_coverage: boolean;
  flood_amount: string;
  equipment_breakdown: boolean;
  equipment_breakdown_amount: string;
  sewer_backup: boolean;
  water_damage: boolean;
  employee_theft: boolean;
  cyber_coverage: boolean;
  utility_interruption: boolean;
  ordinance_law: boolean;
  property_deductible: string;
  wind_deductible: string;
  flood_deductible: string;
  equipment_deductible: string;
  notes: string;
};

type ClaimForm = {
  policy_id: string;
  claim_date: string;
  claim_type: string;
  description: string;
  amount: string;
  status: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────

const POLICY_TYPES = [
  "General Liability",
  "Commercial Property",
  "Business Owners Policy (BOP)",
  "Workers Compensation",
  "Umbrella / Excess Liability",
  "Equipment Breakdown",
  "Business Interruption",
  "Cyber Liability",
  "Commercial Auto",
  "Professional Liability",
  "Flood Insurance",
  "Crime / Employee Theft",
];

const PAYMENT_FREQUENCIES = ["Annual", "Semi-Annual", "Quarterly", "Monthly"];

const CLAIM_TYPES = [
  "Property Damage",
  "Liability",
  "Equipment Breakdown",
  "Business Interruption",
  "Theft",
  "Water Damage",
  "Other",
];

const CLAIM_STATUSES = ["Open", "In Review", "Approved", "Denied", "Closed"];

const POLICY_TYPE_COLORS: Record<string, string> = {
  "General Liability": "badge-blue",
  "Commercial Property": "badge-green",
  "Business Owners Policy (BOP)": "badge-blue",
  "Workers Compensation": "badge-amber",
  "Umbrella / Excess Liability": "badge-blue",
  "Equipment Breakdown": "badge-amber",
  "Business Interruption": "badge-red",
  "Cyber Liability": "badge-blue",
  "Commercial Auto": "badge-green",
  "Professional Liability": "badge-amber",
  "Flood Insurance": "badge-blue",
  "Crime / Employee Theft": "badge-red",
};

const ADDITIONAL_COVERAGE_FIELDS: { key: keyof PolicyForm; label: string }[] = [
  { key: "sewer_backup", label: "Sewer Backup" },
  { key: "water_damage", label: "Water Damage" },
  { key: "employee_theft", label: "Employee Theft" },
  { key: "cyber_coverage", label: "Cyber Coverage" },
  { key: "utility_interruption", label: "Utility Interruption" },
  { key: "ordinance_law", label: "Ordinance & Law" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyPolicyForm(): PolicyForm {
  return {
    policy_type: "General Liability",
    carrier: "",
    policy_number: "",
    agent_name: "",
    agency_name: "",
    agent_email: "",
    agent_phone: "",
    effective_date: "",
    expiration_date: "",
    auto_renewal: false,
    annual_premium: "",
    monthly_premium: "",
    payment_frequency: "Annual",
    building_coverage: "",
    contents_coverage: "",
    equipment_coverage: "",
    replacement_cost: false,
    liability_per_occurrence: "",
    liability_aggregate: "",
    business_interruption: false,
    business_interruption_amount: "",
    flood_coverage: false,
    flood_amount: "",
    equipment_breakdown: false,
    equipment_breakdown_amount: "",
    sewer_backup: false,
    water_damage: false,
    employee_theft: false,
    cyber_coverage: false,
    utility_interruption: false,
    ordinance_law: false,
    property_deductible: "",
    wind_deductible: "",
    flood_deductible: "",
    equipment_deductible: "",
    notes: "",
  };
}

function policyToForm(policy: InsurancePolicy): PolicyForm {
  return {
    policy_type: policy.policy_type ?? "General Liability",
    carrier: policy.carrier ?? "",
    policy_number: policy.policy_number ?? "",
    agent_name: policy.agent_name ?? "",
    agency_name: policy.agency_name ?? "",
    agent_email: policy.agent_email ?? "",
    agent_phone: policy.agent_phone ?? "",
    effective_date: policy.effective_date?.split("T")[0] ?? "",
    expiration_date: policy.expiration_date?.split("T")[0] ?? "",
    auto_renewal: policy.auto_renewal ?? false,
    annual_premium: policy.annual_premium != null ? String(policy.annual_premium) : "",
    monthly_premium: policy.monthly_premium != null ? String(policy.monthly_premium) : "",
    payment_frequency: policy.payment_frequency ?? "Annual",
    building_coverage: policy.building_coverage != null ? String(policy.building_coverage) : "",
    contents_coverage: policy.contents_coverage != null ? String(policy.contents_coverage) : "",
    equipment_coverage: policy.equipment_coverage != null ? String(policy.equipment_coverage) : "",
    replacement_cost: policy.replacement_cost ?? false,
    liability_per_occurrence:
      policy.liability_per_occurrence != null ? String(policy.liability_per_occurrence) : "",
    liability_aggregate:
      policy.liability_aggregate != null ? String(policy.liability_aggregate) : "",
    business_interruption: policy.business_interruption ?? false,
    business_interruption_amount:
      policy.business_interruption_amount != null
        ? String(policy.business_interruption_amount)
        : "",
    flood_coverage: policy.flood_coverage ?? false,
    flood_amount: policy.flood_amount != null ? String(policy.flood_amount) : "",
    equipment_breakdown: policy.equipment_breakdown ?? false,
    equipment_breakdown_amount:
      policy.equipment_breakdown_amount != null
        ? String(policy.equipment_breakdown_amount)
        : "",
    sewer_backup: policy.sewer_backup ?? false,
    water_damage: policy.water_damage ?? false,
    employee_theft: policy.employee_theft ?? false,
    cyber_coverage: policy.cyber_coverage ?? false,
    utility_interruption: policy.utility_interruption ?? false,
    ordinance_law: policy.ordinance_law ?? false,
    property_deductible:
      policy.property_deductible != null ? String(policy.property_deductible) : "",
    wind_deductible: policy.wind_deductible != null ? String(policy.wind_deductible) : "",
    flood_deductible: policy.flood_deductible != null ? String(policy.flood_deductible) : "",
    equipment_deductible:
      policy.equipment_deductible != null ? String(policy.equipment_deductible) : "",
    notes: policy.notes ?? "",
  };
}

function parseNum(value: string): number | null {
  if (!value.trim()) return null;
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function calcDaysRemaining(expirationDate: string | null): number | null {
  const exp = parseDate(expirationDate);
  if (!exp) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expNorm = new Date(exp);
  expNorm.setHours(0, 0, 0, 0);
  return Math.round((expNorm.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function daysColor(days: number | null): string {
  if (days == null) return "text-slate-400";
  if (days < 0) return "text-red-400";
  if (days < 60) return "text-red-400";
  if (days < 90) return "text-amber-400";
  return "text-green-400";
}

function claimStatusBadge(status: string | null): string {
  switch (status) {
    case "Approved":
    case "Closed":
      return "badge-green";
    case "Denied":
      return "badge-red";
    case "In Review":
      return "badge-amber";
    default:
      return "badge-blue";
  }
}

function calcRiskScore(policies: InsurancePolicy[]): {
  score: number;
  label: string;
  color: string;
  ringColor: string;
} {
  let score = 100;
  const hasBI = policies.some((p) => p.business_interruption);
  const hasEB = policies.some((p) => p.equipment_breakdown);
  const hasFlood = policies.some((p) => p.flood_coverage);
  const totalLiability = policies.reduce((s, p) => s + (p.liability_per_occurrence ?? 0), 0);

  if (!hasBI) score -= 20;
  if (!hasEB) score -= 15;
  if (!hasFlood) score -= 10;
  if (policies.some((p) => (calcDaysRemaining(p.expiration_date) ?? 1) < 0)) score -= 20;
  if (
    policies.some((p) => {
      const d = calcDaysRemaining(p.expiration_date);
      return d != null && d >= 0 && d <= 30;
    })
  )
    score -= 15;
  if (totalLiability < 1_000_000) score -= 10;

  score = Math.max(0, score);

  if (score >= 90) return { score, label: "Low Risk", color: "text-green-400", ringColor: "#22c55e" };
  if (score >= 70)
    return { score, label: "Moderate Risk", color: "text-amber-400", ringColor: "#f59e0b" };
  return { score, label: "Elevated Risk", color: "text-red-400", ringColor: "#ef4444" };
}

function calcCoverageStatus(policies: InsurancePolicy[]): {
  label: string;
  badgeColor: "green" | "amber" | "red";
} {
  const hasExpired = policies.some((p) => (calcDaysRemaining(p.expiration_date) ?? 1) < 0);
  const hasExpiringSoon = policies.some((p) => {
    const d = calcDaysRemaining(p.expiration_date);
    return d != null && d >= 0 && d <= 30;
  });
  if (hasExpired) return { label: "Expired", badgeColor: "red" };
  if (hasExpiringSoon) return { label: "Expiring Soon", badgeColor: "amber" };
  return { label: "Active", badgeColor: "green" };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[13px] font-semibold text-slate-200 border-b border-white/[0.06] pb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="metric-label mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-slate-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={clsx(
          "relative w-10 h-5 rounded-full transition-colors",
          value ? "bg-blue-600" : "bg-[#243347]"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
            value ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

function AlertCard({
  severity,
  message,
}: {
  severity: "red" | "amber";
  message: string;
}) {
  const styles =
    severity === "red"
      ? "bg-red-500/8 border-red-500/20 text-red-400"
      : "bg-amber-500/8 border-amber-500/20 text-amber-400";
  return (
    <div className={clsx("rounded-lg border p-3 text-[12px] flex items-start gap-2", styles)}>
      <span className="flex-shrink-0">{severity === "red" ? "⚠" : "◆"}</span>
      <span>{message}</span>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function InsurancePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [store, setStore] = useState<Store | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);

  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState<PolicyForm>(emptyPolicyForm);

  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState<ClaimForm>({
    policy_id: "",
    claim_date: "",
    claim_type: "Property Damage",
    description: "",
    amount: "",
    status: "Open",
  });
  const [viewClaimsPolicyId, setViewClaimsPolicyId] = useState<string | null>(null);

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
    setUserId(user.id);

    const savedId = localStorage.getItem("selectedStoreId");
    let storeQuery = supabase.from("stores").select("id, name, address").eq("user_id", user.id);
    if (savedId) {
      storeQuery = storeQuery.eq("id", savedId);
    } else {
      storeQuery = storeQuery.limit(1);
    }
    const { data: storeData, error: storeError } = await storeQuery.single();

    if (storeError || !storeData) {
      setError(storeError?.message ?? "No store found. Complete onboarding first.");
      setLoading(false);
      return;
    }
    setStore(storeData);

    const { data: policyData, error: policyError } = await supabase
      .from("insurance_policies")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("expiration_date", { ascending: true });

    if (policyError) {
      setError(policyError.message);
      setLoading(false);
      return;
    }

    const activePolicies = (policyData ?? []) as InsurancePolicy[];
    setPolicies(activePolicies);

    if (activePolicies.length > 0) {
      const policyIds = activePolicies.map((p) => p.id);
      const { data: claimData, error: claimError } = await supabase
        .from("insurance_claims")
        .select("*")
        .in("policy_id", policyIds)
        .order("claim_date", { ascending: false });

      if (claimError) {
        setError(claimError.message);
      } else {
        setClaims((claimData ?? []) as InsuranceClaim[]);
      }
    } else {
      setClaims([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const metrics = useMemo(() => {
    const totalPremium = policies.reduce((s, p) => s + (p.annual_premium ?? 0), 0);
    const totalCoverage = policies.reduce(
      (s, p) =>
        s + (p.building_coverage ?? 0) + (p.contents_coverage ?? 0) + (p.equipment_coverage ?? 0),
      0
    );
    const earliest = policies
      .map((p) => parseDate(p.expiration_date))
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const earliestPolicy = policies.find((p) => {
      const d = parseDate(p.expiration_date);
      return d && earliest && d.getTime() === earliest.getTime();
    });
    const daysUntilRenewal = earliestPolicy
      ? calcDaysRemaining(earliestPolicy.expiration_date)
      : null;
    const coverageStatus = calcCoverageStatus(policies);
    const risk = calcRiskScore(policies);
    const totalLiability = policies.reduce((s, p) => s + (p.liability_per_occurrence ?? 0), 0);

    return {
      totalPremium,
      totalCoverage,
      activeCount: policies.length,
      earliestExpiration: earliestPolicy?.expiration_date ?? null,
      daysUntilRenewal,
      coverageStatus,
      risk,
      totalLiability,
      hasBI: policies.some((p) => p.business_interruption),
      hasFlood: policies.some((p) => p.flood_coverage),
      hasEB: policies.some((p) => p.equipment_breakdown),
    };
  }, [policies]);

  const alerts = useMemo(() => {
    const items: { severity: "red" | "amber"; message: string }[] = [];
    if (policies.length > 0 && !metrics.hasBI) {
      items.push({ severity: "red", message: "Missing Business Interruption Coverage" });
    }
    if (policies.length > 0 && !metrics.hasFlood) {
      items.push({
        severity: "amber",
        message: "Missing Flood Coverage - Consider if in flood zone",
      });
    }
    if (policies.length > 0 && !metrics.hasEB) {
      items.push({ severity: "amber", message: "Missing Equipment Breakdown Coverage" });
    }
    policies.forEach((p) => {
      const days = calcDaysRemaining(p.expiration_date);
      if (days != null && days >= 0 && days <= 60) {
        const label = p.policy_type ?? "Policy";
        const carrier = p.carrier ? ` (${p.carrier})` : "";
        items.push({
          severity: "red",
          message: `${label}${carrier} expires in ${days} day${days === 1 ? "" : "s"}`,
        });
      }
    });
    if (policies.length > 0 && metrics.totalLiability < 1_000_000) {
      items.push({
        severity: "red",
        message: "General Liability coverage may be insufficient",
      });
    }
    return items;
  }, [policies, metrics]);

  const claimsByPolicy = useMemo(() => {
    const map = new Map<string, InsuranceClaim[]>();
    claims.forEach((c) => {
      const existing = map.get(c.policy_id) ?? [];
      existing.push(c);
      map.set(c.policy_id, existing);
    });
    return map;
  }, [claims]);

  function openAddPolicy() {
    setEditingPolicyId(null);
    setPolicyForm(emptyPolicyForm());
    setShowPolicyForm(true);
  }

  function openEditPolicy(policy: InsurancePolicy) {
    setEditingPolicyId(policy.id);
    setPolicyForm(policyToForm(policy));
    setShowPolicyForm(true);
  }

  function closePolicyForm() {
    setShowPolicyForm(false);
    setEditingPolicyId(null);
    setPolicyForm(emptyPolicyForm());
  }

  async function handleSavePolicy() {
    if (!store || !userId) return;
    setSaving(true);
    setError("");

    const payload = {
      user_id: userId,
      store_id: store.id,
      is_active: true,
      policy_type: policyForm.policy_type || null,
      carrier: policyForm.carrier || null,
      policy_number: policyForm.policy_number || null,
      agent_name: policyForm.agent_name || null,
      agency_name: policyForm.agency_name || null,
      agent_email: policyForm.agent_email || null,
      agent_phone: policyForm.agent_phone || null,
      effective_date: policyForm.effective_date || null,
      expiration_date: policyForm.expiration_date || null,
      auto_renewal: policyForm.auto_renewal,
      annual_premium: parseNum(policyForm.annual_premium),
      monthly_premium: parseNum(policyForm.monthly_premium),
      payment_frequency: policyForm.payment_frequency || null,
      building_coverage: parseNum(policyForm.building_coverage),
      contents_coverage: parseNum(policyForm.contents_coverage),
      equipment_coverage: parseNum(policyForm.equipment_coverage),
      replacement_cost: policyForm.replacement_cost,
      liability_per_occurrence: parseNum(policyForm.liability_per_occurrence),
      liability_aggregate: parseNum(policyForm.liability_aggregate),
      business_interruption: policyForm.business_interruption,
      business_interruption_amount: parseNum(policyForm.business_interruption_amount),
      flood_coverage: policyForm.flood_coverage,
      flood_amount: parseNum(policyForm.flood_amount),
      equipment_breakdown: policyForm.equipment_breakdown,
      equipment_breakdown_amount: parseNum(policyForm.equipment_breakdown_amount),
      sewer_backup: policyForm.sewer_backup,
      water_damage: policyForm.water_damage,
      employee_theft: policyForm.employee_theft,
      cyber_coverage: policyForm.cyber_coverage,
      utility_interruption: policyForm.utility_interruption,
      ordinance_law: policyForm.ordinance_law,
      property_deductible: parseNum(policyForm.property_deductible),
      wind_deductible: parseNum(policyForm.wind_deductible),
      flood_deductible: parseNum(policyForm.flood_deductible),
      equipment_deductible: parseNum(policyForm.equipment_deductible),
      notes: policyForm.notes || null,
    };

    if (editingPolicyId) {
      const { error: updateError } = await supabase
        .from("insurance_policies")
        .update(payload)
        .eq("id", editingPolicyId);
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("insurance_policies").insert(payload);
      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    }

    closePolicyForm();
    await loadData();
    setSaving(false);
  }

  function openAddClaim(policyId?: string) {
    setClaimForm({
      policy_id: policyId ?? policies[0]?.id ?? "",
      claim_date: new Date().toISOString().split("T")[0],
      claim_type: "Property Damage",
      description: "",
      amount: "",
      status: "Open",
    });
    setShowClaimForm(true);
  }

  async function handleSaveClaim() {
    if (!claimForm.policy_id) {
      setError("Select a policy for this claim.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      policy_id: claimForm.policy_id,
      claim_date: claimForm.claim_date || null,
      claim_type: claimForm.claim_type || null,
      description: claimForm.description || null,
      amount: parseNum(claimForm.amount),
      status: claimForm.status || "Open",
    };

    const { error: insertError } = await supabase.from("insurance_claims").insert(payload);
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setShowClaimForm(false);
    await loadData();
    setSaving(false);
  }

  function updatePolicyForm<K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) {
    setPolicyForm((f) => ({ ...f, [key]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500 text-[13px]">Loading insurance data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">Insurance Management</h1>
          <p className="text-slate-500 text-[13px] mt-0.5">
            {store?.name ?? "Store"} · {store?.address ?? "Address not set"}
          </p>
        </div>
        <button type="button" onClick={openAddPolicy} className="btn-primary">
          + Add Policy
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {/* Dashboard Summary */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          label="Total Annual Premium"
          value={formatCurrency(metrics.totalPremium)}
          sub={`${metrics.activeCount} active polic${metrics.activeCount === 1 ? "y" : "ies"}`}
        />
        <MetricCard
          label="Total Coverage Amount"
          value={formatCurrency(metrics.totalCoverage)}
          sub="Building + contents + equipment"
        />
        <MetricCard label="Active Policies" value={String(metrics.activeCount)} />
        <MetricCard
          label="Next Renewal Date"
          value={metrics.earliestExpiration ? formatDate(metrics.earliestExpiration) : "—"}
        />
        <MetricCard
          label="Days Until Renewal"
          value={
            metrics.daysUntilRenewal != null
              ? metrics.daysUntilRenewal < 0
                ? `${Math.abs(metrics.daysUntilRenewal)} days overdue`
                : `${metrics.daysUntilRenewal} days`
              : "—"
          }
          subColor={
            metrics.daysUntilRenewal != null && metrics.daysUntilRenewal < 60 ? "warning" : "muted"
          }
        />
        <MetricCard
          label="Coverage Status"
          value={metrics.coverageStatus.label}
          badge={metrics.coverageStatus.label}
          badgeColor={metrics.coverageStatus.badgeColor}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coverage Alerts */}
        <div className="card lg:col-span-2">
          <div className="section-title">Coverage Alerts</div>
          {alerts.length === 0 ? (
            <div className="bg-green-500/8 border border-green-500/20 rounded-lg p-3 text-[12px] text-green-400">
              No coverage gaps detected. Your insurance portfolio looks well-structured.
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <AlertCard key={i} severity={a.severity} message={a.message} />
              ))}
            </div>
          )}
        </div>

        {/* Risk Score */}
        <div className="card">
          <div className="section-title">Insurance Risk Score</div>
          <div className="flex items-center gap-5">
            <ScoreRing
              score={metrics.risk.score}
              size={90}
              strokeWidth={10}
              color={metrics.risk.ringColor}
            />
            <div>
              <div className={clsx("text-[18px] font-bold", metrics.risk.color)}>
                {metrics.risk.label}
              </div>
              <div className="text-[12px] text-slate-500 mt-1">Score: {metrics.risk.score}/100</div>
              <div className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                Based on coverage completeness, renewal timing, and liability limits.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Policy Form Modal */}
      {showPolicyForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto py-8 px-4">
          <div className="card w-full max-w-3xl">
            <div className="flex items-center justify-between mb-5">
              <div className="section-title mb-0">
                {editingPolicyId ? "Edit Policy" : "Add Policy"}
              </div>
              <button type="button" onClick={closePolicyForm} className="btn-outline">
                Cancel
              </button>
            </div>

            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
              <FormSection title="Policy Information">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Policy Type" className="col-span-2">
                    <select
                      className={INPUT_CLASS}
                      value={policyForm.policy_type}
                      onChange={(e) => updatePolicyForm("policy_type", e.target.value)}
                    >
                      {POLICY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Carrier">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.carrier}
                      onChange={(e) => updatePolicyForm("carrier", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Policy Number">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.policy_number}
                      onChange={(e) => updatePolicyForm("policy_number", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Agent Name">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.agent_name}
                      onChange={(e) => updatePolicyForm("agent_name", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Agency Name">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.agency_name}
                      onChange={(e) => updatePolicyForm("agency_name", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Agent Email">
                    <input
                      type="email"
                      className={INPUT_CLASS}
                      value={policyForm.agent_email}
                      onChange={(e) => updatePolicyForm("agent_email", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Agent Phone">
                    <input
                      type="tel"
                      className={INPUT_CLASS}
                      value={policyForm.agent_phone}
                      onChange={(e) => updatePolicyForm("agent_phone", e.target.value)}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title="Policy Dates">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Effective Date">
                    <input
                      type="date"
                      className={INPUT_CLASS}
                      value={policyForm.effective_date}
                      onChange={(e) => updatePolicyForm("effective_date", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Expiration Date">
                    <input
                      type="date"
                      className={INPUT_CLASS}
                      value={policyForm.expiration_date}
                      onChange={(e) => updatePolicyForm("expiration_date", e.target.value)}
                    />
                  </FormField>
                  <div className="col-span-2">
                    <ToggleField
                      label="Auto-Renewal"
                      value={policyForm.auto_renewal}
                      onChange={(v) => updatePolicyForm("auto_renewal", v)}
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection title="Premium">
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Annual Premium">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.annual_premium}
                      onChange={(e) => updatePolicyForm("annual_premium", e.target.value)}
                      placeholder="0"
                    />
                  </FormField>
                  <FormField label="Monthly Premium">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.monthly_premium}
                      onChange={(e) => updatePolicyForm("monthly_premium", e.target.value)}
                      placeholder="0"
                    />
                  </FormField>
                  <FormField label="Payment Frequency">
                    <select
                      className={INPUT_CLASS}
                      value={policyForm.payment_frequency}
                      onChange={(e) => updatePolicyForm("payment_frequency", e.target.value)}
                    >
                      {PAYMENT_FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
              </FormSection>

              <FormSection title="Coverage Details">
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Building Coverage">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.building_coverage}
                      onChange={(e) => updatePolicyForm("building_coverage", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Contents Coverage">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.contents_coverage}
                      onChange={(e) => updatePolicyForm("contents_coverage", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Equipment Coverage">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.equipment_coverage}
                      onChange={(e) => updatePolicyForm("equipment_coverage", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Liability Per Occurrence">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.liability_per_occurrence}
                      onChange={(e) => updatePolicyForm("liability_per_occurrence", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Liability Aggregate">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.liability_aggregate}
                      onChange={(e) => updatePolicyForm("liability_aggregate", e.target.value)}
                    />
                  </FormField>
                  <div className="flex items-end pb-1">
                    <ToggleField
                      label="Replacement Cost"
                      value={policyForm.replacement_cost}
                      onChange={(v) => updatePolicyForm("replacement_cost", v)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  <div className="card2">
                    <ToggleField
                      label="Business Interruption"
                      value={policyForm.business_interruption}
                      onChange={(v) => updatePolicyForm("business_interruption", v)}
                    />
                    {policyForm.business_interruption && (
                      <FormField label="BI Amount">
                        <input
                          className={INPUT_CLASS}
                          value={policyForm.business_interruption_amount}
                          onChange={(e) =>
                            updatePolicyForm("business_interruption_amount", e.target.value)
                          }
                        />
                      </FormField>
                    )}
                  </div>
                  <div className="card2">
                    <ToggleField
                      label="Flood Coverage"
                      value={policyForm.flood_coverage}
                      onChange={(v) => updatePolicyForm("flood_coverage", v)}
                    />
                    {policyForm.flood_coverage && (
                      <FormField label="Flood Amount">
                        <input
                          className={INPUT_CLASS}
                          value={policyForm.flood_amount}
                          onChange={(e) => updatePolicyForm("flood_amount", e.target.value)}
                        />
                      </FormField>
                    )}
                  </div>
                  <div className="card2">
                    <ToggleField
                      label="Equipment Breakdown"
                      value={policyForm.equipment_breakdown}
                      onChange={(v) => updatePolicyForm("equipment_breakdown", v)}
                    />
                    {policyForm.equipment_breakdown && (
                      <FormField label="EB Amount">
                        <input
                          className={INPUT_CLASS}
                          value={policyForm.equipment_breakdown_amount}
                          onChange={(e) =>
                            updatePolicyForm("equipment_breakdown_amount", e.target.value)
                          }
                        />
                      </FormField>
                    )}
                  </div>
                </div>
              </FormSection>

              <FormSection title="Additional Coverage">
                <div className="grid grid-cols-2 gap-2">
                  {ADDITIONAL_COVERAGE_FIELDS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-[13px] text-slate-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={policyForm[key] as boolean}
                        onChange={(e) => updatePolicyForm(key, e.target.checked as PolicyForm[typeof key])}
                        className="rounded border-white/20 bg-[#1e2a3a] text-blue-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </FormSection>

              <FormSection title="Deductibles">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Property Deductible">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.property_deductible}
                      onChange={(e) => updatePolicyForm("property_deductible", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Wind Deductible">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.wind_deductible}
                      onChange={(e) => updatePolicyForm("wind_deductible", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Flood Deductible">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.flood_deductible}
                      onChange={(e) => updatePolicyForm("flood_deductible", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Equipment Deductible">
                    <input
                      className={INPUT_CLASS}
                      value={policyForm.equipment_deductible}
                      onChange={(e) => updatePolicyForm("equipment_deductible", e.target.value)}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title="Notes">
                <textarea
                  className={clsx(INPUT_CLASS, "min-h-[80px] resize-y")}
                  value={policyForm.notes}
                  onChange={(e) => updatePolicyForm("notes", e.target.value)}
                  placeholder="Policy notes, endorsements, special conditions..."
                />
              </FormSection>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-white/[0.06]">
              <button type="button" onClick={closePolicyForm} className="btn-outline">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePolicy}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? "Saving..." : editingPolicyId ? "Update Policy" : "Save Policy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Policies */}
      <div className="card">
        <div className="section-title">Policies</div>
        {policies.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-slate-400 text-[13px]">No active insurance policies on file.</div>
            <button type="button" onClick={openAddPolicy} className="btn-primary mt-4">
              Add Your First Policy
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {policies.map((policy) => {
              const days = calcDaysRemaining(policy.expiration_date);
              const typeColor =
                POLICY_TYPE_COLORS[policy.policy_type ?? ""] ?? "badge-blue";
              const policyClaims = claimsByPolicy.get(policy.id) ?? [];

              return (
                <div key={policy.id} className="card2">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className={clsx("badge", typeColor)}>
                        {policy.policy_type ?? "Policy"}
                      </span>
                      <div className="text-[13px] font-semibold text-slate-100 mt-2">
                        {policy.carrier ?? "Unknown Carrier"}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        #{policy.policy_number ?? "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="metric-label">Days Remaining</div>
                      <div className={clsx("text-[18px] font-bold", daysColor(days))}>
                        {days != null ? (days < 0 ? `${Math.abs(days)} overdue` : days) : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-[12px] border-t border-white/[0.04] pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Effective</span>
                      <span className="text-slate-200">{formatDate(policy.effective_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Expiration</span>
                      <span className="text-slate-200">{formatDate(policy.expiration_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Annual Premium</span>
                      <span className="text-slate-100 font-semibold">
                        {formatCurrency(policy.annual_premium)}
                      </span>
                    </div>
                    {(policy.building_coverage || policy.contents_coverage || policy.equipment_coverage) && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Property Coverage</span>
                        <span className="text-slate-200">
                          {formatCurrency(
                            (policy.building_coverage ?? 0) +
                              (policy.contents_coverage ?? 0) +
                              (policy.equipment_coverage ?? 0)
                          )}
                        </span>
                      </div>
                    )}
                    {policy.liability_per_occurrence != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Liability / Occurrence</span>
                        <span className="text-slate-200">
                          {formatCurrency(policy.liability_per_occurrence)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => openEditPolicy(policy)}
                      className="btn-outline flex-1"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setViewClaimsPolicyId(
                          viewClaimsPolicyId === policy.id ? null : policy.id
                        )
                      }
                      className="btn-outline flex-1"
                    >
                      View Claims ({policyClaims.length})
                    </button>
                  </div>

                  {viewClaimsPolicyId === policy.id && policyClaims.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2">
                      {policyClaims.map((c) => (
                        <div key={c.id} className="text-[11px] flex justify-between items-center">
                          <span className="text-slate-400">
                            {formatDate(c.claim_date)} · {c.claim_type}
                          </span>
                          <span className={clsx("badge", claimStatusBadge(c.status))}>
                            {c.status ?? "Open"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Claims History */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="section-title mb-0">Claims History</div>
          {policies.length > 0 && (
            <button type="button" onClick={() => openAddClaim()} className="btn-primary">
              + Add Claim
            </button>
          )}
        </div>

        {showClaimForm && (
          <div className="card2 mb-4 space-y-3">
            <div className="text-[13px] font-semibold text-slate-200">New Claim</div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <FormField label="Policy">
                <select
                  className={INPUT_CLASS}
                  value={claimForm.policy_id}
                  onChange={(e) => setClaimForm((f) => ({ ...f, policy_id: e.target.value }))}
                >
                  <option value="">Select policy</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.policy_type} — {p.carrier}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Claim Date">
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={claimForm.claim_date}
                  onChange={(e) => setClaimForm((f) => ({ ...f, claim_date: e.target.value }))}
                />
              </FormField>
              <FormField label="Claim Type">
                <select
                  className={INPUT_CLASS}
                  value={claimForm.claim_type}
                  onChange={(e) => setClaimForm((f) => ({ ...f, claim_type: e.target.value }))}
                >
                  {CLAIM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Amount">
                <input
                  className={INPUT_CLASS}
                  value={claimForm.amount}
                  onChange={(e) => setClaimForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </FormField>
              <FormField label="Status">
                <select
                  className={INPUT_CLASS}
                  value={claimForm.status}
                  onChange={(e) => setClaimForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {CLAIM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Description" className="col-span-2 lg:col-span-3">
                <input
                  className={INPUT_CLASS}
                  value={claimForm.description}
                  onChange={(e) => setClaimForm((f) => ({ ...f, description: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowClaimForm(false)}
                className="btn-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveClaim}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? "Saving..." : "Save Claim"}
              </button>
            </div>
          </div>
        )}

        {claims.length === 0 ? (
          <div className="text-slate-500 text-[13px] py-4">No claims on file.</div>
        ) : (
          <div className="space-y-5">
            {policies.map((policy) => {
              const policyClaims = claimsByPolicy.get(policy.id);
              if (!policyClaims || policyClaims.length === 0) return null;
              return (
                <div key={policy.id}>
                  <div className="text-[12px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                    {policy.policy_type} — {policy.carrier}
                  </div>
                  <div className="space-y-2">
                    {policyClaims.map((claim) => (
                      <div
                        key={claim.id}
                        className="card2 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] text-slate-200">
                            {formatDate(claim.claim_date)} · {claim.claim_type}
                          </div>
                          <div className="text-[12px] text-slate-500 truncate">
                            {claim.description ?? "No description"}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-[13px] font-semibold text-slate-100">
                            {formatCurrency(claim.amount)}
                          </span>
                          <span className={clsx("badge", claimStatusBadge(claim.status))}>
                            {claim.status ?? "Open"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="card">
        <div className="section-title">Documents</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Policy Documents", icon: "📋" },
            { label: "Declarations Pages", icon: "📄" },
            { label: "Certificates of Insurance", icon: "📜" },
            { label: "Renewal Proposals", icon: "📨" },
          ].map((doc) => (
            <div
              key={doc.label}
              className="card2 text-center py-6 border-dashed border-white/[0.12] relative overflow-hidden"
            >
              <div className="text-2xl mb-2 opacity-40">{doc.icon}</div>
              <div className="text-[12px] font-semibold text-slate-400">{doc.label}</div>
              <div className="mt-2">
                <span className="badge badge-amber">Coming Soon</span>
              </div>
              <button
                type="button"
                disabled
                className="btn-outline mt-3 opacity-50 cursor-not-allowed"
              >
                Upload
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
