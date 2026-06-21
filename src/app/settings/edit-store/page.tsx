"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { invalidateValuationCache } from "@/lib/getStoreValuation";
import { toNullableText } from "@/lib/formHelpers";
import { useRouter, useSearchParams } from "next/navigation";
import { FormBanner } from "@/components/ui/FormBanner";
import { preventEnterSubmit } from "@/components/occupancy/shared";

const MARKET_OPTIONS = [
  { value: "urban", label: "Dense Urban" },
  { value: "suburban", label: "Suburban" },
  { value: "average", label: "Small City" },
  { value: "rural", label: "Rural" },
];

const CONDITION_OPTIONS = ["excellent", "good", "fair", "poor"];
const TREND_OPTIONS = ["growing", "stable", "declining"];
const COMPETITION_OPTIONS = ["protected", "normal", "heavy"];

function labelize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function EditStoreForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    market_density: "suburban",
    store_condition: "fair",
    revenue_trend: "stable",
    competition_level: "normal",
  });

  const inputClass =
    "w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500";

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    if (!message || message.type !== "success") return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const paramStoreId = searchParams.get("store");
      let query = supabase.from("stores").select("*").eq("user_id", user.id);

      if (paramStoreId) {
        query = query.eq("id", paramStoreId);
      } else {
        query = query.limit(1);
      }

      const { data } = await query.single();

      if (data) {
        setStoreId(data.id);
        setForm({
          name: data.name ?? "",
          address: data.address ?? "",
          market_density: data.market_density ?? data.location_type ?? "suburban",
          store_condition: data.store_condition ?? "fair",
          revenue_trend: data.revenue_trend ?? "stable",
          competition_level: data.competition_level ?? "normal",
        });
      }
      setFetching(false);
    }
    load();
  }, [searchParams]);

  async function handleSubmit() {
    if (!storeId || saving || saveStatus === "success") return;
    setSaving(true);
    setSaveStatus("idle");
    setMessage(null);

    try {
      const { error: updateError } = await supabase
        .from("stores")
        .update({
          name: toNullableText(form.name),
          address: toNullableText(form.address),
          market_density: form.market_density,
          store_condition: form.store_condition,
          revenue_trend: form.revenue_trend,
          competition_level: form.competition_level,
        })
        .eq("id", storeId);

      if (updateError) {
        console.error("Store profile save error:", updateError);
        setSaveStatus("error");
        setMessage({ type: "error", text: "We couldn't save this. Please try again." });
        setSaving(false);
        return;
      }

      invalidateValuationCache(storeId);
      setSaveStatus("success");
      setMessage({ type: "success", text: "Saved successfully." });
      setSaving(false);
    } catch (err) {
      console.error("Unexpected store profile save error:", err);
      setSaveStatus("error");
      setMessage({ type: "error", text: "We couldn't save this. Please try again." });
      setSaving(false);
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-adaptive-muted text-[13px]">Loading store data...</div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6">
        <h1 className="text-[15px] font-semibold text-adaptive-primary">Edit Store</h1>
        <p className="text-adaptive-muted text-[13px] mt-1">Update your store identity and valuation profile</p>
      </div>

      <FormBanner message={message} />

      <div className="card space-y-4">
        <div>
          <div className="metric-label mb-1.5">Store Name</div>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
            placeholder="Sunnyvale Super Wash"
            onKeyDown={preventEnterSubmit}
          />
        </div>
        <div>
          <div className="metric-label mb-1.5">Address</div>
          <input
            type="text"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            className={inputClass}
            placeholder="445 W Olive Ave, Sunnyvale, CA"
            onKeyDown={preventEnterSubmit}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="metric-label mb-1.5">Market Density</div>
            <select
              value={form.market_density}
              onChange={(e) => set("market_density", e.target.value)}
              className={inputClass}
            >
              {MARKET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="metric-label mb-1.5">Store Condition</div>
            <select
              value={form.store_condition}
              onChange={(e) => set("store_condition", e.target.value)}
              className={inputClass}
            >
              {CONDITION_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {labelize(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="metric-label mb-1.5">Revenue Trend</div>
            <select
              value={form.revenue_trend}
              onChange={(e) => set("revenue_trend", e.target.value)}
              className={inputClass}
            >
              {TREND_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {labelize(t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="metric-label mb-1.5">Competition Level</div>
            <select
              value={form.competition_level}
              onChange={(e) => set("competition_level", e.target.value)}
              className={inputClass}
            >
              {COMPETITION_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {labelize(c)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving || saveStatus === "success"}
          className="btn-primary w-full py-2.5 text-[13px] disabled:opacity-40"
        >
          {saveStatus === "success" ? "Saved ✓" : saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <p className="text-[12px] text-adaptive-muted mt-5 leading-relaxed">
        Financial data is managed in{" "}
        <Link href="/financials" className="text-adaptive-info hover:underline">
          Financials
        </Link>
        . Equipment is managed in{" "}
        <Link href="/equipment" className="text-adaptive-info hover:underline">
          Equipment
        </Link>
        . Lease and rent data is managed in{" "}
        <Link href="/lease" className="text-adaptive-info hover:underline">
          Occupancy
        </Link>
        . Debt is managed in{" "}
        <Link href="/debt" className="text-adaptive-info hover:underline">
          Debt
        </Link>
        .
      </p>
    </div>
  );
}

export default function EditStorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="text-adaptive-muted text-[13px]">Loading store data...</div>
        </div>
      }
    >
      <EditStoreForm />
    </Suspense>
  );
}
