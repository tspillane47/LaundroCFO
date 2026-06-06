"use client";
import { useState } from "react";
import { scenarios } from "@/lib/data";
import clsx from "clsx";

export default function ScenariosPage() {
  const [selected, setSelected] = useState(scenarios[0]);

  const isNeg = selected.valueImpact < 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-slate-100">
          Scenario Planner{" "}
          <span className="text-[12px] text-slate-500 font-normal ml-2">
            Model valuation changes in real time
          </span>
        </h1>
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-5">
        {/* Scenario grid */}
        <div className="grid grid-cols-2 gap-3">
          {scenarios.map((sc) => {
            const neg = sc.valueImpact < 0;
            return (
              <button
                key={sc.id}
                onClick={() => setSelected(sc)}
                className={clsx(
                  "card text-left transition-all hover:border-blue-500/50",
                  selected.id === sc.id && "border-blue-500 bg-blue-500/5"
                )}
              >
                <div className="text-[13px] font-semibold text-slate-100">
                  {sc.emoji} {sc.title}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">{sc.description}</div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.05]">
                  <div>
                    <div className="text-[10px] text-slate-600 uppercase tracking-wider">Value Impact</div>
                    <div className={`text-[16px] font-bold mt-0.5 ${neg ? "text-red-400" : "text-green-400"}`}>
                      {neg ? "−" : "+"}${Math.abs(sc.valueImpact).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-600 uppercase tracking-wider">
                      {sc.id === "revenue" ? "New EBITDA" : sc.id === "retool" ? "Multiple" : "% Change"}
                    </div>
                    <div className="text-[16px] font-bold text-blue-300 mt-0.5">
                      {sc.id === "revenue"
                        ? `$${(sc.newEbitda / 1000).toFixed(0)}k`
                        : sc.id === "retool"
                        ? `${sc.newMultiple}x`
                        : `${neg ? "−" : "+"}${Math.abs(sc.pctChange).toFixed(1)}%`}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="card sticky top-0">
          <div className="text-[13px] font-bold text-slate-100 mb-4">
            {selected.emoji} {selected.title}
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="card2">
              <div className="metric-label">Current Value</div>
              <div className="text-[16px] font-bold text-slate-100">$825,000</div>
            </div>
            <div className={clsx("card2", isNeg ? "border-red-500/20" : "border-green-500/20")}>
              <div className="metric-label">Scenario Value</div>
              <div className={`text-[16px] font-bold ${isNeg ? "text-red-400" : "text-green-400"}`}>
                ${selected.newValue.toLocaleString()}
              </div>
            </div>
            <div className="card2">
              <div className="metric-label">Value Change</div>
              <div className={`text-[16px] font-bold ${isNeg ? "text-red-400" : "text-green-400"}`}>
                {isNeg ? "−" : "+"}${Math.abs(selected.valueImpact).toLocaleString()}
              </div>
            </div>
            <div className="card2">
              <div className="metric-label">% Change</div>
              <div className={`text-[16px] font-bold ${isNeg ? "text-red-400" : "text-green-400"}`}>
                {isNeg ? "−" : "+"}{Math.abs(selected.pctChange).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Detail fields */}
          <div className="text-[11px] text-slate-600 uppercase tracking-wider mb-2">Key Outputs</div>
          <div className="divide-y divide-white/[0.04] mb-4">
            {Object.entries(selected.detail).map(([k, v]) => {
              const label = k
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (s) => s.toUpperCase());
              return (
                <div key={k} className="flex items-center justify-between py-2 text-[12px]">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-100">{v}</span>
                </div>
              );
            })}
          </div>

          <div
            className={clsx(
              "p-3 rounded-lg text-[12px]",
              isNeg
                ? "bg-red-500/8 border border-red-500/20 text-red-400"
                : "bg-green-500/8 border border-green-500/20 text-green-400"
            )}
          >
            {selected.note}
          </div>
        </div>
      </div>
    </div>
  );
}
