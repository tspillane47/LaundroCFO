"use client";
import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { invalidateValuationCache } from "@/lib/getStoreValuation";
import { useRouter, useSearchParams } from "next/navigation";
import { FormBanner } from "@/components/ui/FormBanner";

function EditStoreForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    square_footage: "",
    monthly_revenue: "",
    monthly_expenses: "",
    monthly_rent: "",
    annual_debt_service: "",
    loan_balance: "",
    lease_expiration: "",
    washers: "",
    dryers: "",
    avg_machine_age: "",
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
          square_footage: data.square_footage != null ? String(data.square_footage) : "",
          monthly_revenue: data.monthly_revenue != null ? String(data.monthly_revenue) : "",
          monthly_expenses: data.monthly_expenses != null ? String(data.monthly_expenses) : "",
          monthly_rent: data.monthly_rent != null ? String(data.monthly_rent) : "",
          annual_debt_service: data.annual_debt_service != null ? String(data.annual_debt_service) : "",
          loan_balance: data.loan_balance != null ? String(data.loan_balance) : "",
          lease_expiration: data.lease_expiration ? data.lease_expiration.split("T")[0] : "",
          washers: data.washers != null ? String(data.washers) : "",
          dryers: data.dryers != null ? String(data.dryers) : "",
          avg_machine_age: data.avg_machine_age != null ? String(data.avg_machine_age) : "",
        });
      }
      setFetching(false);
    }
    load();
  }, [searchParams]);

  async function handleSubmit() {
    if (!storeId || saving) return;
    setSaving(true);
    setMessage(null);

    const { error: updateError } = await supabase
      .from("stores")
      .update({
        name: form.name,
        address: form.address,
        square_footage: Number(form.square_footage),
        monthly_revenue: Number(form.monthly_revenue),
        monthly_expenses: Number(form.monthly_expenses),
        monthly_rent: Number(form.monthly_rent),
        annual_debt_service: Number(form.annual_debt_service),
        loan_balance: Number(form.loan_balance),
        lease_expiration: form.lease_expiration,
        washers: Number(form.washers),
        dryers: Number(form.dryers),
        avg_machine_age: Number(form.avg_machine_age),
      })
      .eq("id", storeId);

    if (updateError) {
      setMessage({ type: "error", text: "We couldn't save this. Please try again." });
    } else {
      invalidateValuationCache(storeId);
      setMessage({ type: "success", text: "Saved successfully." });
    }
    setSaving(false);
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500 text-[13px]">Loading store data...</div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6">
        <h1 className="text-[15px] font-semibold text-slate-100">Edit Store</h1>
        <p className="text-slate-500 text-[13px] mt-1">Update your store profile and financials</p>
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
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="metric-label mb-1.5">Square Footage</div>
            <input
              type="number"
              value={form.square_footage}
              onChange={(e) => set("square_footage", e.target.value)}
              className={inputClass}
              placeholder="4450"
            />
          </div>
          <div>
            <div className="metric-label mb-1.5">Lease Expiration</div>
            <input
              type="date"
              value={form.lease_expiration}
              onChange={(e) => set("lease_expiration", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="metric-label mb-1.5">Monthly Revenue</div>
            <input
              type="number"
              value={form.monthly_revenue}
              onChange={(e) => set("monthly_revenue", e.target.value)}
              className={inputClass}
              placeholder="69250"
            />
          </div>
          <div>
            <div className="metric-label mb-1.5">Monthly Expenses</div>
            <input
              type="number"
              value={form.monthly_expenses}
              onChange={(e) => set("monthly_expenses", e.target.value)}
              className={inputClass}
              placeholder="49430"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="metric-label mb-1.5">Monthly Rent</div>
            <input
              type="number"
              value={form.monthly_rent}
              onChange={(e) => set("monthly_rent", e.target.value)}
              className={inputClass}
              placeholder="6200"
            />
          </div>
          <div>
            <div className="metric-label mb-1.5">Annual Debt Service</div>
            <input
              type="number"
              value={form.annual_debt_service}
              onChange={(e) => set("annual_debt_service", e.target.value)}
              className={inputClass}
              placeholder="100000"
            />
          </div>
        </div>
        <div>
          <div className="metric-label mb-1.5">Loan Balance</div>
          <input
            type="number"
            value={form.loan_balance}
            onChange={(e) => set("loan_balance", e.target.value)}
            className={inputClass}
            placeholder="850000"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="metric-label mb-1.5">Washers</div>
            <input
              type="number"
              value={form.washers}
              onChange={(e) => set("washers", e.target.value)}
              className={inputClass}
              placeholder="28"
            />
          </div>
          <div>
            <div className="metric-label mb-1.5">Dryers</div>
            <input
              type="number"
              value={form.dryers}
              onChange={(e) => set("dryers", e.target.value)}
              className={inputClass}
              placeholder="32"
            />
          </div>
          <div>
            <div className="metric-label mb-1.5">Avg Machine Age</div>
            <input
              type="number"
              value={form.avg_machine_age}
              onChange={(e) => set("avg_machine_age", e.target.value)}
              className={inputClass}
              placeholder="6"
            />
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="btn-primary w-full py-2.5 text-[13px] disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

export default function EditStorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="text-slate-500 text-[13px]">Loading store data...</div>
        </div>
      }
    >
      <EditStoreForm />
    </Suspense>
  );
}
