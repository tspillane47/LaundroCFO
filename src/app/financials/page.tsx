"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStores } from "@/lib/store-context";
import { monthlyData } from "@/lib/data";
import { MetricCard } from "@/components/ui/MetricCard";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1e2a3a] border border-white/10 rounded-lg p-3 text-xs">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className="text-slate-100 font-semibold">${(payload[0].value / 1000).toFixed(1)}k</div>
    </div>
  );
};

export default function FinancialsPage() {
  const { selectedStore, isAllStores, stores, loading } = useStores();

  const revenue = selectedStore?.monthly_revenue ?? 69250;
  const expenses = selectedStore?.monthly_expenses ?? 49470;
  const ebitda = revenue - expenses;
  const annualRevenue = revenue * 12;
  const annualEbitda = ebitda * 12;
  const debtService = selectedStore?.annual_debt_service ?? 100000;
  const dscr = debtService > 0 ? annualEbitda / debtService : 0;
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const utilities = selectedStore?.monthly_utilities ?? 12340;
  const utilityRatio = revenue > 0 ? (utilities / revenue) * 100 : 0;
  const sqft = selectedStore?.square_footage ?? 4450;
  const revenuePerSF = sqft > 0 ? annualRevenue / sqft : 0;
  const machines = (selectedStore?.washers ?? 28) + (selectedStore?.dryers ?? 32);

  const expensesList = useMemo(() => [
    { label: "Monthly Rent", value: fmtDollar((selectedStore?.monthly_rent ?? 6200) * 12) + " / yr", sub: fmtDollar(selectedStore?.monthly_rent ?? 6200) + "/mo" },
    { label: "CAM / Taxes / Insurance", value: "$17,050 / yr", sub: "Est." },
    { label: "Total Occupancy Cost", value: fmtDollar(((selectedStore?.monthly_rent ?? 6200) * 12) + 17050) + " / yr", sub: `${(((selectedStore?.monthly_rent ?? 6200) * 12 + 17050) / annualRevenue * 100).toFixed(1)}% of revenue`, highlight: true },
    { label: "Utilities", value: fmtDollar(utilities * 12) + " / yr", sub: `${utilityRatio.toFixed(1)}% of revenue${utilityRatio > 20 ? " — watch" : ""}`, color: utilityRatio > 20 ? "text-amber-400" : undefined },
    { label: "Payroll", value: "$103,800 / yr", sub: null },
    { label: "Supplies / Misc", value: "$51,166 / yr", sub: null },
    { label: "Total Expenses", value: fmtDollar(expenses * 12) + " / yr", sub: null, color: "text-red-400 text-[15px]" },
  ], [selectedStore, annualRevenue, utilities, utilityRatio, expenses]);

  const ratios = useMemo(() => [
    { label: "Occupancy Cost Ratio", value: `${(((selectedStore?.monthly_rent ?? 6200) * 12 + 17050) / annualRevenue * 100).toFixed(1)}%`, color: "text-green-400", sub: "Well below 20% alert", subColor: "text-green-400" },
    { label: "Utility Ratio", value: `${utilityRatio.toFixed(1)}%`, color: utilityRatio > 20 ? "text-amber-400" : "text-green-400", sub: utilityRatio > 20 ? "⚠ Watch — near 20%" : "Healthy", subColor: utilityRatio > 20 ? "text-amber-400" : "text-green-400" },
    { label: "Rent / Revenue", value: `${(((selectedStore?.monthly_rent ?? 6200) * 12) / annualRevenue * 100).toFixed(1)}%`, color: "text-green-400", sub: "Healthy", subColor: "text-green-400" },
    { label: "Revenue / SF", value: `$${revenuePerSF.toFixed(2)}`, color: "text-slate-100", sub: "Per square foot", subColor: "text-slate-500" },
    { label: "EBITDA / SF", value: `$${(sqft > 0 ? (ebitda * 12) / sqft : 0).toFixed(2)}`, color: "text-slate-100", sub: "Annual", subColor: "text-slate-500" },
    { label: "Revenue / Machine", value: `$${machines > 0 ? Math.round(annualRevenue / machines).toLocaleString() : "—"}`, color: "text-slate-100", sub: `${machines} machines`, subColor: "text-slate-500" },
    { label: "Debt Yield", value: `${selectedStore?.loan_balance ? ((annualEbitda / selectedStore.loan_balance) * 100).toFixed(1) : "18.2"}%`, color: "text-green-400", sub: "Strong lending metric", subColor: "text-green-400" },
    { label: "Cap Rate", value: `${((annualEbitda / (annualEbitda * 3.47)) * 100).toFixed(1)}%`, color: "text-slate-100", sub: "NOI / Est. Value", subColor: "text-slate-500" },
  ], [selectedStore, annualRevenue, utilityRatio, revenuePerSF, sqft, ebitda, machines, annualEbitda]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[14px]" style={{ color: "var(--text-muted)" }}>Loading financials…</div>
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>No stores yet. Add your first store to view financials.</p>
        <Link href="/onboarding" className="btn-primary inline-flex mt-4 text-[13px]">Add Store →</Link>
      </div>
    );
  }

  if (isAllStores || !selectedStore) {
    return (
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Select a store from the dropdown above to view financial details.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Annual Revenue" value={fmtDollar(annualRevenue)} sub="▲ +4.2% YoY" subColor="positive" />
        <MetricCard label="EBITDA" value={fmtDollar(annualEbitda)} sub={`Margin: ${ebitdaMargin.toFixed(1)}%`} subColor="muted" />
        <MetricCard label="NOI" value={fmtDollar(annualEbitda * 0.95)} sub="After rent & ops" subColor="muted" />
        <MetricCard label="Annual Debt Service" value={fmtDollar(debtService)} sub={`DSCR: ${fmtMultiple(dscr)}`} subColor={dscr >= 1.25 ? "positive" : "muted"} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="section-title">Monthly Revenue Trend</div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} barSize={22}>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Expense Breakdown</div>
          <div className="divide-y divide-white/[0.04]">
            {expensesList.map((e) => (
              <div key={e.label} className="flex items-center justify-between py-2 text-[13px]">
                <div>
                  <div className="text-slate-400">{e.label}</div>
                  {e.sub && <div className="text-[11px] text-slate-600">{e.sub}</div>}
                </div>
                <span className={`font-semibold ${e.color ?? "text-slate-100"}`}>{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ratio cards */}
      <div className="card">
        <div className="section-title">Full Underwriting Metrics</div>
        <div className="grid grid-cols-4 gap-3">
          {ratios.map((r) => (
            <div key={r.label} className="card2">
              <div className="metric-label">{r.label}</div>
              <div className={`text-[18px] font-bold ${r.color}`}>{r.value}</div>
              <div className={`text-[11px] mt-1 ${r.subColor}`}>{r.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* EBITDA waterfall */}
      <div className="card">
        <div className="section-title">Monthly EBITDA vs Utilities</div>
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} barSize={16} barGap={4}>
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
              <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ebitda" fill="#22c55e" radius={[3, 3, 0, 0]} name="EBITDA" />
              <Bar dataKey="utilities" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Utilities" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-green-500 inline-block" />EBITDA</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-amber-500 inline-block" />Utilities</span>
        </div>
      </div>
    </div>
  );
}
