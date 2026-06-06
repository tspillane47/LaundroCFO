"use client";
import { equipment } from "@/lib/data";
import { MetricCard, SmallMetric } from "@/components/ui/MetricCard";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { calcAverageEquipmentAge } from "@/lib/calculations";

const currentYear = 2025;

const ageDistribution = [
  { label: "Under 5 years", pct: 40, count: 24, color: "bg-green-500", textColor: "text-green-400" },
  { label: "5–10 years", pct: 47, count: 28, color: "bg-blue-500", textColor: "text-blue-400" },
  { label: "10–15 years", pct: 10, count: 6, color: "bg-amber-500", textColor: "text-amber-400" },
  { label: "15+ years", pct: 3, count: 2, color: "bg-red-500", textColor: "text-red-400" },
];

const multipleAdj = [
  { label: "Base Multiple", value: "4.5x", color: "text-slate-100" },
  { label: "Equipment Adj.", value: "+0.3x", color: "text-green-400", sub: "87% under 10yr" },
  { label: "Replacement Risk Adj.", value: "−0.1x", color: "text-amber-400", sub: "3% over 15yr" },
  { label: "Applied Multiple", value: "4.7x", color: "text-blue-300", highlight: true },
];

export default function EquipmentPage() {
  const avgAge = calcAverageEquipmentAge(equipment, currentYear);

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total Machines" value="60" sub="28 washers, 32 dryers" subColor="muted" />
        <MetricCard label="Avg Equipment Age" value="6.1 yrs" sub="▲ Good — under 10 yrs" subColor="positive" />
        <MetricCard label="Replacement Cost Est." value="$612,500" sub="Full fleet replacement" subColor="muted" />
        <MetricCard label="Equipment Score" value="88/100" sub="▲ Good condition" subColor="positive" progress={88} progressColor="bg-green-500" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Age distribution */}
        <div className="card">
          <div className="section-title">Age Distribution</div>
          <div className="divide-y divide-white/[0.04]">
            {ageDistribution.map((d) => (
              <div key={d.label} className="flex items-center gap-3 py-3">
                <div className="text-[12px] text-slate-400 w-28 flex-shrink-0">{d.label}</div>
                <div className="flex-1 h-1.5 bg-[#243347] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.pct * 2}%` }} />
                </div>
                <div className={`text-[12px] font-semibold w-36 text-right ${d.textColor}`}>
                  {d.pct}% ({d.count} machines)
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-green-500/8 border border-green-500/20 text-[12px] text-green-400">
            87% of machines under 10 years. Fleet in solid shape — adds ~+0.3x to valuation multiple.
          </div>
        </div>

        {/* Inventory table */}
        <div className="card">
          <div className="section-title">Equipment Inventory</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.06]">
                  <th className="text-left pb-2 font-medium">Type</th>
                  <th className="text-left pb-2 font-medium">Qty</th>
                  <th className="text-left pb-2 font-medium">Brand</th>
                  <th className="text-left pb-2 font-medium">Installed</th>
                  <th className="text-right pb-2 font-medium">Repl. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {equipment.map((e) => {
                  const age = currentYear - e.installed;
                  const ageColor = age < 5 ? "text-green-400" : age < 10 ? "text-blue-400" : age < 15 ? "text-amber-400" : "text-red-400";
                  return (
                    <tr key={e.type}>
                      <td className="py-2.5 text-slate-300">{e.type}</td>
                      <td className="py-2.5 text-slate-400">{e.qty}</td>
                      <td className="py-2.5 text-slate-400">{e.brand}</td>
                      <td className={`py-2.5 font-semibold ${ageColor}`}>{e.installed} <span className="text-slate-600 font-normal">({age}yr)</span></td>
                      <td className="py-2.5 text-right text-slate-100">${e.replacementCost.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/[0.08]">
                  <td className="pt-3 text-slate-400 font-semibold" colSpan={4}>Total Replacement Cost</td>
                  <td className="pt-3 text-right text-slate-100 font-bold">
                    ${equipment.reduce((s, e) => s + e.replacementCost, 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Valuation multiple impact */}
      <div className="card">
        <div className="section-title">Equipment Impact on Valuation Multiple</div>
        <div className="grid grid-cols-4 gap-3">
          {multipleAdj.map((m) => (
            <div key={m.label} className={`card2 ${m.highlight ? "border-blue-500/30" : ""}`}>
              <div className="metric-label">{m.label}</div>
              <div className={`text-[20px] font-bold ${m.color}`}>{m.value}</div>
              {m.sub && <div className="text-[11px] text-slate-500 mt-1">{m.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Score risk framework */}
      <div className="card">
        <div className="section-title">Equipment Risk Framework</div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { range: "< 5 years avg", status: "Excellent", color: "text-green-400", bg: "bg-green-500/10", scoreRange: "95–100" },
            { range: "5–10 years avg", status: "Good", color: "text-blue-400", bg: "bg-blue-500/10", scoreRange: "80–94", current: true },
            { range: "10–15 years avg", status: "Aging", color: "text-amber-400", bg: "bg-amber-500/10", scoreRange: "55–79" },
            { range: "15+ years avg", status: "High Risk", color: "text-red-400", bg: "bg-red-500/10", scoreRange: "0–54" },
          ].map((r) => (
            <div key={r.range} className={`card2 ${r.current ? "border-blue-500/30" : ""}`}>
              <div className={`text-[11px] font-semibold ${r.color} ${r.bg} inline-flex px-2 py-0.5 rounded-full mb-2`}>
                {r.status}
              </div>
              <div className="text-[13px] text-slate-300">{r.range}</div>
              <div className="text-[11px] text-slate-500 mt-1">Score: {r.scoreRange}</div>
              {r.current && <div className="text-[11px] text-blue-400 mt-1">← Current: 6.1yr avg</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
