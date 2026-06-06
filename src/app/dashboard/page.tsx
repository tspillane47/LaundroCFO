"use client";
import { financials, scores, monthlyData, valueTrend, store } from "@/lib/data";
import { MetricCard, SmallMetric } from "@/components/ui/MetricCard";
import { ScoreRing } from "@/components/ui/ScoreRing";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { fmtDollar, fmtMultiple, fmtPct, fmt } from "@/lib/calculations";

const CustomTooltip = ({ active, payload, label, prefix = "$" }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1e2a3a] border border-white/10 rounded-lg p-3 text-xs">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className="text-slate-100 font-semibold">{prefix}{fmt(payload[0].value)}</div>
    </div>
  );
};

const valueDrivers = [
  { label: "Revenue", amount: "+$8,400", pct: 88, color: "bg-green-500", positive: true },
  { label: "Lease Term", amount: "+$12,000", pct: 73, color: "bg-blue-500", positive: true },
  { label: "Equipment Age", amount: "+$6,600", pct: 82, color: "bg-green-400", positive: true },
  { label: "Utility Ratio", amount: "−$3,200", pct: 55, color: "bg-amber-500", positive: false },
  { label: "Debt Balance", amount: "−$1,800", pct: 40, color: "bg-red-500", positive: false },
];

const underwritingMetrics = [
  { label: "DSCR", value: "2.14x", badge: "badge-green" },
  { label: "Global DSCR", value: "1.78x", badge: "badge-green" },
  { label: "EBITDA Margin", value: "28.6%", badge: "badge-green" },
  { label: "Rent to Revenue", value: "12.3%", badge: "badge-green" },
  { label: "Utility to Revenue", value: "17.8%", badge: "badge-amber" },
  { label: "Revenue per SF", value: "$185.40", badge: null },
  { label: "EBITDA per SF", value: "$53.41", badge: null },
  { label: "Revenue per Machine", value: "$13,850", badge: null },
  { label: "Turns per Day", value: "6.4", badge: null },
  { label: "Debt Yield", value: "18.2%", badge: null },
];

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      {/* Row 1: Hero KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {/* Store Value */}
        <div className="card col-span-1">
          <div className="metric-label">Estimated Store Value</div>
          <div className="metric-value text-[28px]">{fmtDollar(financials.estimatedValue)}</div>
          <div className="text-[12px] text-green-400 mt-1">▲ +$22,000 &nbsp;+2.7% vs last month</div>
          <div className="mt-3 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={valueTrend.slice(-8)}>
                <defs>
                  <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#vg)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* LaundroCFO Score */}
        <div className="card col-span-1">
          <div className="metric-label">LaundroCFO Score</div>
          <div className="flex items-center gap-4 mt-1">
            <ScoreRing score={scores.laundrocfo} size={78} />
            <div>
              <div className="text-[16px] font-bold text-slate-100">Strong</div>
              <div className="text-[11px] text-slate-500 mt-1">
                Financeability: <span className="text-green-400">Strong</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Risk Level: <span className="text-green-400">Low</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Confidence: <span className="text-blue-400">High</span>
              </div>
            </div>
          </div>
        </div>

        {/* DSCR */}
        <MetricCard
          label="DSCR"
          value="2.14x"
          sub="▲ Above 1.25x threshold"
          subColor="positive"
          progress={85}
          progressColor="bg-green-500"
        />

        {/* EBITDA Margin */}
        <MetricCard
          label="EBITDA Margin"
          value="28.6%"
          sub="▲ Strong — top quartile"
          subColor="positive"
          progress={72}
          progressColor="bg-blue-500"
        />
      </div>

      {/* Row 2: Value Drivers + Underwriting Metrics */}
      <div className="grid grid-cols-2 gap-4">
        {/* Value Drivers */}
        <div className="card">
          <div className="section-title">
            Value Drivers
            <span className="text-[12px] text-slate-500 font-normal">Monthly movement</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {valueDrivers.map((d) => (
              <div key={d.label} className="flex items-center gap-3 py-2.5">
                <div className="text-[12px] text-slate-400 w-28 flex-shrink-0">{d.label}</div>
                <div className="flex-1 h-1.5 bg-[#243347] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
                </div>
                <div className={`text-[12px] font-semibold w-20 text-right ${d.positive ? "text-green-400" : "text-red-400"}`}>
                  {d.amount}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Underwriting Metrics */}
        <div className="card">
          <div className="section-title">Underwriting Metrics</div>
          <div className="divide-y divide-white/[0.04]">
            {underwritingMetrics.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-slate-400">{m.label}</span>
                {m.badge ? (
                  <span className={`badge ${m.badge}`}>{m.value}</span>
                ) : (
                  <span className="font-semibold text-slate-100">{m.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Lease, Equipment, Cash Flow */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <div className="metric-label">Lease Score</div>
          <div className="flex items-center gap-3 mt-1 mb-3">
            <span className="metric-value">94</span>
            <span className="badge badge-green">Excellent</span>
          </div>
          <div className="text-[12px] text-slate-400 space-y-1.5">
            <div>Years Remaining: <span className="text-slate-100 font-semibold">7.3 yrs</span></div>
            <div>Options: <span className="text-slate-100 font-semibold">2 × 5 years</span></div>
            <div>Total Control: <span className="text-slate-100 font-semibold">17.3 yrs</span></div>
            <div>Expires: <span className="text-slate-100 font-semibold">Nov 2031</span></div>
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Equipment Score</div>
          <div className="flex items-center gap-3 mt-1 mb-3">
            <span className="metric-value">88</span>
            <span className="badge badge-green">Good</span>
          </div>
          <div className="text-[12px] text-slate-400 space-y-1.5">
            <div>Avg Age: <span className="text-slate-100 font-semibold">6.1 years</span></div>
            <div>Total Machines: <span className="text-slate-100 font-semibold">60</span></div>
            <div>Replacement Est: <span className="text-slate-100 font-semibold">$612,500</span></div>
            <div>Status: <span className="text-green-400 font-semibold">Good — Under 10yr</span></div>
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Monthly Cash Flow</div>
          <div className="metric-value mt-1 mb-3">{fmtDollar(monthlyData[monthlyData.length - 1].cashFlow)}</div>
          <div className="text-[12px] text-slate-400 space-y-1.5">
            <div>Revenue: <span className="text-slate-100 font-semibold">$69,250</span></div>
            <div>EBITDA: <span className="text-green-400 font-semibold">$19,780</span></div>
            <div>Utilities: <span className="text-amber-400 font-semibold">$12,340</span></div>
            <div>Payroll: <span className="text-slate-100 font-semibold">$8,650</span></div>
          </div>
        </div>
      </div>

      {/* Row 4: Valuation Summary */}
      <div className="card">
        <div className="section-title">Valuation Summary</div>
        <div className="grid grid-cols-5 gap-3">
          <SmallMetric label="Annual Revenue" value="$831,000" />
          <SmallMetric label="EBITDA" value="$237,666" color="text-green-400" />
          <SmallMetric label="EBITDA Multiple" value="3.47x" color="text-blue-300" />
          <SmallMetric label="NOI" value="$226,800" />
          <SmallMetric label="Est. Store Value" value="$825,000" color="text-blue-300" />
        </div>
      </div>
    </div>
  );
}
