"use client";
import { alerts } from "@/lib/data";
import Link from "next/link";
import clsx from "clsx";

const severityStyles: Record<string, { icon: string; bg: string; border: string }> = {
  warning: { icon: "bg-amber-500/15", bg: "", border: "border-amber-500/20" },
  info: { icon: "bg-blue-500/15", bg: "", border: "border-blue-500/20" },
  success: { icon: "bg-green-500/15", bg: "", border: "" },
};

const tagStyles: Record<string, string> = {
  warning: "badge-amber",
  info: "badge-blue",
  success: "badge-green",
};

export default function AlertsPage() {
  const active = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) => a.resolved);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold text-slate-100">Active Alerts</h1>
        <span className="badge badge-red">{active.length} Active</span>
      </div>

      <div className="space-y-3">
        {active.map((alert) => {
          const style = severityStyles[alert.severity];
          return (
            <div
              key={alert.id}
              className={clsx("card flex items-start gap-4", style.border && `border ${style.border}`)}
            >
              <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center text-[18px] flex-shrink-0", style.icon)}>
                {alert.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-100">{alert.title}</div>
                <div className="text-[12px] text-slate-400 mt-1 leading-relaxed">{alert.body}</div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {alert.tags.map((tag) => (
                    <span key={tag} className={`badge ${tagStyles[alert.severity]}`}>{tag}</span>
                  ))}
                </div>
              </div>
              {alert.action && (
                <Link
                  href={`/${alert.action}`}
                  className="btn-outline flex-shrink-0 text-[11px] whitespace-nowrap"
                >
                  {alert.actionLabel} →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Resolved */}
      <div className="mt-6">
        <h2 className="text-[13px] font-semibold text-slate-500 mb-3">Resolved</h2>
        <div className="space-y-3">
          {resolved.map((alert) => (
            <div key={alert.id} className="card opacity-50 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] flex-shrink-0 bg-white/5">
                {alert.emoji}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-slate-400">{alert.title}</div>
                <div className="text-[12px] text-slate-600 mt-1">{alert.body}</div>
              </div>
              <span className="badge badge-green flex-shrink-0">Healthy</span>
            </div>
          ))}
        </div>
      </div>

      {/* Alert config */}
      <div className="card mt-6">
        <div className="section-title">Alert Thresholds</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["DSCR Minimum", "1.25x"],
            ["Global DSCR Minimum", "1.25x"],
            ["Utility Alert", "> 20%"],
            ["Occupancy Cost Alert", "> 20%"],
            ["Lease Warning", "< 5 years"],
            ["Equip. Age Warning", "> 12 years"],
          ].map(([label, val]) => (
            <div key={label} className="card2">
              <div className="metric-label">{label}</div>
              <div className="text-[14px] font-semibold text-slate-200">{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
