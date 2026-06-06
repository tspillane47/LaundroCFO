"use client";
import { financials, monthlyData } from "@/lib/data";
import { MetricCard, SmallMetric } from "@/components/ui/MetricCard";
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

const expenses = [
  { label: "Monthly Rent", value: "$74,400 / yr", sub: "$6,200/mo" },
  { label: "CAM / Taxes / Insurance", value: "$17,050 / yr", sub: "Est." },
  { label: "Total Occupancy Cost", value: "$91,450 / yr", sub: "11.0% of revenue", highlight: true },
  { label: "Utilities", value: "$147,918 / yr", sub: "17.8% of revenue — watch", color: "text-amber-400" },
  { label: "Payroll", value: "$103,800 / yr", sub: null },
  { label: "Supplies / Misc", value: "$51,166 / yr", sub: null },
  { label: "Total Expenses", value: "$593,334 / yr", sub: null, color: "text-red-400 text-[15px]" },
];

const ratios = [
  { label: "Occupancy Cost Ratio", value: "11.0%", color: "text-green-400", sub: "Well below 20% alert", subColor: "text-green-400" },
  { label: "Utility Ratio", value: "17.8%", color: "text-amber-400", sub: "⚠ Watch — near 20%", subColor: "text-amber-400" },
  { label: "Rent / Revenue", value: "12.3%", color: "text-green-400", sub: "Healthy", subColor: "text-green-400" },
  { label: "Revenue / SF", value: "$185.40", color: "text-slate-100", sub: "Top quartile", subColor: "text-slate-500" },
  { label: "EBITDA / SF", value: "$53.41", color: "text-slate-100", sub: "Strong", subColor: "text-slate-500" },
  { label: "Revenue / Machine", value: "$13,850", color: "text-slate-100", sub: "Avg 60 machines", subColor: "text-slate-500" },
  { label: "Debt Yield", value: "18.2%", color: "text-green-400", sub: "Strong lending metric", subColor: "text-green-400" },
  { label: "Cap Rate", value: "27.5%", color: "text-slate-100", sub: "NOI / Est. Value", subColor: "text-slate-500" },
];

export default function FinancialsPage() {
  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Annual Revenue" value="$831,000" sub="▲ +4.2% YoY" subColor="positive" />
        <MetricCard label="EBITDA" value="$237,666" sub="Margin: 28.6%" subColor="muted" />
        <MetricCard label="NOI" value="$226,800" sub="After rent & ops" subColor="muted" />
        <MetricCard label="Annual Debt Service" value="$100,000" sub="DSCR: 2.14x" subColor="positive" />
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
            {expenses.map((e) => (
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
