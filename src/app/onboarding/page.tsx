"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  const inputClass =
    "w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500";

  async function handleSubmit() {
    setLoading(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { error } = await supabase.from("stores").insert({
      user_id: user.id,
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
    });

    if (error) setError(error.message);
    else router.push("/dashboard");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0d1520] flex items-center justify-center py-10">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="text-[22px] font-bold text-blue-300 mb-1">LaundroCFO</div>
          <div className="text-slate-500 text-[13px]">Set up your store</div>
        </div>
        <div className="card space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
              {error}
            </div>
          )}
          <div>
            <div className="metric-label mb-1.5">Store Name</div>
            <input
              type="text"
              value={form.name}
              onChange={e => set("name", e.target.value)}
              className={inputClass}
              placeholder="Sunnyvale Super Wash"
            />
          </div>
          <div>
            <div className="metric-label mb-1.5">Address</div>
            <input
              type="text"
              value={form.address}
              onChange={e => set("address", e.target.value)}
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
                onChange={e => set("square_footage", e.target.value)}
                className={inputClass}
                placeholder="4450"
              />
            </div>
            <div>
              <div className="metric-label mb-1.5">Lease Expiration</div>
              <input
                type="date"
                value={form.lease_expiration}
                onChange={e => set("lease_expiration", e.target.value)}
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
                onChange={e => set("monthly_revenue", e.target.value)}
                className={inputClass}
                placeholder="69250"
              />
            </div>
            <div>
              <div className="metric-label mb-1.5">Monthly Expenses</div>
              <input
                type="number"
                value={form.monthly_expenses}
                onChange={e => set("monthly_expenses", e.target.value)}
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
                onChange={e => set("monthly_rent", e.target.value)}
                className={inputClass}
                placeholder="6200"
              />
            </div>
            <div>
              <div className="metric-label mb-1.5">Annual Debt Service</div>
              <input
                type="number"
                value={form.annual_debt_service}
                onChange={e => set("annual_debt_service", e.target.value)}
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
              onChange={e => set("loan_balance", e.target.value)}
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
                onChange={e => set("washers", e.target.value)}
                className={inputClass}
                placeholder="28"
              />
            </div>
            <div>
              <div className="metric-label mb-1.5">Dryers</div>
              <input
                type="number"
                value={form.dryers}
                onChange={e => set("dryers", e.target.value)}
                className={inputClass}
                placeholder="32"
              />
            </div>
            <div>
              <div className="metric-label mb-1.5">Avg Machine Age</div>
              <input
                type="number"
                value={form.avg_machine_age}
                onChange={e => set("avg_machine_age", e.target.value)}
                className={inputClass}
                placeholder="6"
              />
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full py-2.5 text-[13px]"
          >
            {loading ? "Saving..." : "Go to Dashboard →"}
          </button>
        </div>
      </div>
    </div>
  );
}
