"use client";
import { benchmarks } from "@/lib/data";

function BenchmarkRow({
  metric, store, unit, median, top25, bottom25, lowerIsBetter,
}: {
  metric: string; store: number; unit: string;
  median: number; top25: number; bottom25: number; lowerIsBetter: boolean;
}) {
  // Normalize store position to 0–100 on the track
  const min = lowerIsBetter ? top25 : bottom25;
  const max = lowerIsBetter ? bottom25 : top25;
  const pct = Math.min(100, Math.max(0, ((store - min) / (max - min)) * 100));

  const isGood = lowerIsBetter ? store <= top25 : store >= top25;
  const isWarn = lowerIsBetter ? store >= bottom25 * 0.85 : store <= bottom25 * 1.15;
  const valColor = isGood ? "text-green-400" : isWarn ? "text-red-400" : "text-amber-400";

  const fmtVal = (v: number) =>
    unit === "$" ? `$${v.toLocaleString()}` : unit === "x" ? `${v}x` : `${v}${unit}`;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/[0.05]">
      <div className="text-[13px] text-slate-400 w-44 flex-shrink-0">{metric}</div>
      <div className="flex-1 relative">
        {/* Track */}
        <div className="h-2 rounded-full overflow-hidden" style={{
          background: lowerIsBetter
            ? "linear-gradient(90deg, rgba(34,197,94,0.35) 0%, rgba(245,158,11,0.35) 50%, rgba(239,68,68,0.35) 100%)"
            : "linear-gradient(90deg, rgba(239,68,68,0.35) 0%, rgba(245,158,11,0.35) 50%, rgba(34,197,94,0.35) 100%)"
        }} />
        {/* Store marker */}
        <div
          className="absolute top-[-3px] w-[3px] h-[14px] bg-white rounded-sm"
          style={{ left: `calc(${pct}% - 1.5px)` }}
        />
        {/* Labels */}
        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>{lowerIsBetter ? "Best" : "Worst"} 25% — {fmtVal(lowerIsBetter ? top25 : bottom25)}</span>
          <span>Median — {fmtVal(median)}</span>
          <span>{lowerIsBetter ? "Worst" : "Best"} 25% — {fmtVal(lowerIsBetter ? bottom25 : top25)}</span>
        </div>
      </div>
      <div className={`text-[13px] font-bold w-20 text-right ${valColor}`}>
        {fmtVal(store)}
      </div>
    </div>
  );
}

export default function BenchmarkingPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-slate-100">
          Industry Benchmarking{" "}
          <span className="text-[12px] text-slate-500 font-normal ml-2">
            vs. Laundromat Industry — U.S. 2024 Data
          </span>
        </h1>
      </div>

      {/* Overall performance summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <div className="metric-label">Performance Rating</div>
          <div className="metric-value text-green-400">Top 30%</div>
          <div className="text-[12px] text-slate-500 mt-1">vs. laundromats nationally</div>
        </div>
        <div className="card">
          <div className="metric-label">Metrics Above Median</div>
          <div className="metric-value">5 / 7</div>
          <div className="text-[12px] text-slate-500 mt-1">71% of tracked metrics</div>
        </div>
        <div className="card">
          <div className="metric-label">Financeability Rating</div>
          <div className="metric-value text-green-400">Strong</div>
          <div className="text-[12px] text-slate-500 mt-1">Meets all SBA 7(a) benchmarks</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          Store vs. Industry Benchmarks
          <span className="text-[11px] text-slate-600 font-normal ml-auto">
            White bar = Sunnyvale Super Wash position
          </span>
        </div>
        {benchmarks.map((b) => (
          <BenchmarkRow key={b.metric} {...b} />
        ))}
        <div className="text-[11px] text-slate-600 mt-4 pt-3 border-t border-white/[0.05]">
          Industry benchmark data sourced from Coin Laundry Association, LaundroCFO peer database (2024).
          The white marker shows this store&apos;s position on each metric.
        </div>
      </div>

      {/* Callout cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card border-green-500/20">
          <div className="text-[12px] text-green-400 font-semibold mb-2">💪 Strengths</div>
          <div className="space-y-1.5 text-[12px] text-slate-400">
            <div>✅ DSCR 2.14x — top quartile</div>
            <div>✅ Revenue/SF $185 — top 30%</div>
            <div>✅ EBITDA margin 28.6%</div>
            <div>✅ Equipment age 6.1yr</div>
          </div>
        </div>
        <div className="card border-amber-500/20">
          <div className="text-[12px] text-amber-400 font-semibold mb-2">⚠️ Watch</div>
          <div className="space-y-1.5 text-[12px] text-slate-400">
            <div>⚠ Utility ratio 17.8% — near median</div>
            <div>⚠ Revenue/machine could be higher</div>
          </div>
        </div>
        <div className="card border-blue-500/20">
          <div className="text-[12px] text-blue-400 font-semibold mb-2">🎯 Opportunities</div>
          <div className="space-y-1.5 text-[12px] text-slate-400">
            <div>→ Reduce utility ratio to sub-15%</div>
            <div>→ Add WDF to boost Rev/machine</div>
            <div>→ Launch P&D to reach top 10%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
