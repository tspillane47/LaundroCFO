"use client";
import { lease, financials } from "@/lib/data";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { SmallMetric } from "@/components/ui/MetricCard";
import clsx from "clsx";

const leaseTerms = [
  { label: "Lease Start", value: "January 1, 2020" },
  { label: "Lease Expiration", value: "November 30, 2031" },
  { label: "Years Remaining", value: "7.3 years", badge: "badge-blue" },
  { label: "Renewal Options", value: "2 × 5-year options" },
  { label: "Total Site Control", value: "17.3 years", badge: "badge-green" },
  { label: "Annual Escalation", value: "3.0%" },
  { label: "CAM Charges", value: "$850/mo" },
  { label: "Taxes & Insurance", value: "$595/mo" },
  { label: "Assignment Allowed?", value: "With Consent", badge: "badge-amber" },
  { label: "Exclusive Use Clause?", value: "Yes", badge: "badge-green" },
  { label: "Relocation Clause?", value: "No", badge: "badge-green" },
  { label: "Personal Guarantee?", value: "Yes" },
];

const scoreChecks = [
  { text: "7.3 years base remaining", ok: true },
  { text: "Two 5-year renewals available", ok: true },
  { text: "Exclusive use clause", ok: true },
  { text: "No relocation clause", ok: true },
  { text: "Assignment requires landlord consent", ok: false },
];

export default function LeasePage() {
  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <div className="metric-label">Monthly Rent</div>
          <div className="metric-value">${(financials.monthlyRent).toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="metric-label">Annual Rent</div>
          <div className="metric-value">${financials.annualRent.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="metric-label">Annual Occupancy Cost</div>
          <div className="metric-value">${financials.annualOccupancyCost.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="metric-label">Occupancy Cost Ratio</div>
          <div className="metric-value text-green-400">11.0%</div>
          <div className="text-[12px] text-green-400 mt-1">▲ Well below 20% alert</div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-3 gap-4">
        {/* Lease terms */}
        <div className="card col-span-2">
          <div className="section-title">Lease Terms</div>
          <div className="divide-y divide-white/[0.04]">
            {leaseTerms.map((t) => (
              <div key={t.label} className="flex items-center justify-between py-2.5 text-[13px]">
                <span className="text-slate-400">{t.label}</span>
                {t.badge ? (
                  <span className={`badge ${t.badge}`}>{t.value}</span>
                ) : (
                  <span className="font-semibold text-slate-100">{t.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Score panel */}
        <div className="card">
          <div className="section-title">Lease Risk Score</div>
          <div className="flex flex-col items-center py-4">
            <ScoreRing score={94} size={110} color="#22c55e" />
            <div className="text-[14px] font-semibold text-green-400 mt-3">Excellent</div>
          </div>
          <div className="space-y-2 mt-2">
            {scoreChecks.map((c) => (
              <div key={c.text} className={`text-[12px] flex items-start gap-2 ${c.ok ? "text-slate-300" : "text-amber-400"}`}>
                <span>{c.ok ? "✅" : "⚠️"}</span>
                <span>{c.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-green-500/8 border border-green-500/20 text-[12px] text-green-400">
            Strong lease. 17.3 years total control with renewals — well above lender 5-year minimum.
          </div>
        </div>
      </div>

      {/* Rent escalation */}
      <div className="card">
        <div className="section-title">Rent Escalation Projection (3%/yr)</div>
        <div className="grid grid-cols-7 gap-3">
          {lease.rentEscalation.map((row) => (
            <div key={row.year} className="card2 text-center">
              <div className="metric-label text-center">{row.year}</div>
              <div className="text-[15px] font-bold text-slate-100">${row.monthly.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">/ mo</div>
            </div>
          ))}
        </div>
      </div>

      {/* Lease risk context */}
      <div className="card">
        <div className="section-title">Lease Risk Framework</div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { range: "10+ years", status: "Excellent", color: "text-green-400", bg: "bg-green-500/10", current: false },
            { range: "5–10 years", status: "Good", color: "text-blue-400", bg: "bg-blue-500/10", current: true },
            { range: "3–5 years", status: "Moderate Risk", color: "text-amber-400", bg: "bg-amber-500/10", current: false },
            { range: "< 3 years", status: "High Risk", color: "text-red-400", bg: "bg-red-500/10", current: false },
          ].map((r) => (
            <div
              key={r.range}
              className={`card2 ${r.current ? "border-blue-500/30" : ""}`}
            >
              <div className={`text-[11px] font-semibold ${r.color} ${r.bg} inline-flex px-2 py-0.5 rounded-full mb-2`}>
                {r.status}
              </div>
              <div className="text-[13px] text-slate-300">{r.range} remaining</div>
              {r.current && (
                <div className="text-[11px] text-blue-400 mt-1">← Current: 7.3 years</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
