"use client";

export default function ReportsPage() {
  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-slate-100">Underwriting Report Preview</h1>
        <div className="flex gap-2.5">
          <button className="btn-outline">Download PDF</button>
          <button className="btn-primary">Share with Lender</button>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="card">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 pb-2.5 border-b border-white/[0.06]">
          Executive Summary
        </div>
        <p className="text-[13px] text-slate-300 leading-relaxed">
          Sunnyvale Super Wash is a strong-performing laundromat located in Sunnyvale, CA with 4,450 SF and 60 machines.
          The store generates <strong className="text-slate-100">$831,000</strong> in annual revenue with a{" "}
          <strong className="text-slate-100">28.6% EBITDA margin</strong>, significantly above the industry median of ~22%.
          The LaundroCFO Score of <strong className="text-green-400">89/100</strong> reflects strong financeability, low
          operational risk, and a well-structured lease with 17.3 years of total site control.
        </p>
      </div>

      {/* Three-column summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 pb-2.5 border-b border-white/[0.06]">
            Valuation
          </div>
          <div className="divide-y divide-white/[0.04] text-[13px]">
            <div className="flex justify-between py-2"><span className="text-slate-400">EBITDA</span><span className="text-slate-100 font-semibold">$237,666</span></div>
            <div className="flex justify-between py-2"><span className="text-slate-400">Multiple Applied</span><span className="text-blue-300 font-semibold">3.47x</span></div>
            <div className="flex justify-between py-2"><span className="text-slate-400">Est. Store Value</span><span className="text-green-400 text-[15px] font-bold">$825,000</span></div>
          </div>
        </div>
        <div className="card">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 pb-2.5 border-b border-white/[0.06]">
            Financeability
          </div>
          <div className="divide-y divide-white/[0.04] text-[13px]">
            <div className="flex justify-between py-2"><span className="text-slate-400">DSCR</span><span className="text-green-400 font-semibold">2.14x ✓</span></div>
            <div className="flex justify-between py-2"><span className="text-slate-400">Global DSCR</span><span className="text-green-400 font-semibold">1.78x ✓</span></div>
            <div className="flex justify-between py-2"><span className="text-slate-400">Rating</span><span className="text-green-400 font-semibold">Strong</span></div>
          </div>
        </div>
        <div className="card">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 pb-2.5 border-b border-white/[0.06]">
            Key Risks
          </div>
          <div className="divide-y divide-white/[0.04] text-[13px]">
            <div className="py-2 text-amber-400">⚠ Utility ratio 17.8%</div>
            <div className="py-2 text-slate-300">✅ Lease — 17.3yr control</div>
            <div className="py-2 text-slate-300">✅ Equipment — 6.1yr avg</div>
          </div>
        </div>
      </div>

      {/* Lease + Equipment */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 pb-2.5 border-b border-white/[0.06]">
            Lease Summary
          </div>
          <div className="text-[13px] text-slate-400 space-y-2">
            <div>Expires: <span className="text-slate-100">Nov 2031 — 7.3 years remaining</span></div>
            <div>Renewals: <span className="text-slate-100">2 × 5-year options (total 17.3yr)</span></div>
            <div>Monthly Rent: <span className="text-slate-100">$6,200 + CAM/taxes/ins</span></div>
            <div>Occupancy Cost: <span className="text-slate-100">$91,450/yr (11.0%)</span></div>
            <div>Lease Score: <span className="text-green-400 font-semibold">94/100 — Excellent</span></div>
          </div>
        </div>
        <div className="card">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 pb-2.5 border-b border-white/[0.06]">
            Equipment Summary
          </div>
          <div className="text-[13px] text-slate-400 space-y-2">
            <div>Total Machines: <span className="text-slate-100">60 (28 washers, 32 dryers)</span></div>
            <div>Average Age: <span className="text-slate-100">6.1 years — Good</span></div>
            <div>Fleet Under 10yr: <span className="text-slate-100">87% of machines</span></div>
            <div>Replacement Estimate: <span className="text-slate-100">$612,500</span></div>
            <div>Equipment Score: <span className="text-green-400 font-semibold">88/100 — Good</span></div>
          </div>
        </div>
      </div>

      {/* Financial Ratios */}
      <div className="card">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 pb-2.5 border-b border-white/[0.06]">
          Financial Ratios
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            ["DSCR", "2.14x", "text-green-400"],
            ["Global DSCR", "1.78x", "text-green-400"],
            ["EBITDA Margin", "28.6%", "text-green-400"],
            ["Rent / Revenue", "12.3%", "text-green-400"],
            ["Utility / Revenue", "17.8%", "text-amber-400"],
            ["Revenue / SF", "$185.40", "text-slate-100"],
            ["EBITDA / SF", "$53.41", "text-slate-100"],
            ["Debt Yield", "18.2%", "text-green-400"],
          ].map(([label, val, color]) => (
            <div key={label} className="card2">
              <div className="metric-label">{label}</div>
              <div className={`text-[16px] font-bold ${color}`}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Underwriter Notes */}
      <div className="card">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 pb-2.5 border-b border-white/[0.06]">
          Underwriter Notes
        </div>
        <p className="text-[13px] text-slate-300 leading-relaxed">
          Store demonstrates consistent revenue performance with above-median margins. Utility costs are elevated and should
          be monitored — any reduction in the utility ratio to 15% would add approximately{" "}
          <span className="text-green-400 font-semibold">$57,000</span> in estimated store value. Recommend a standard SBA
          7(a) or conventional commercial loan structure. Lease structure is lender-friendly with long-term site control.
          Equipment is in good shape with minimal near-term replacement risk. Global DSCR of 1.78x comfortably exceeds
          minimum 1.25x threshold. This store is a strong candidate for financing or acquisition.
        </p>
      </div>

      <div className="text-[11px] text-slate-600 pb-4">
        Report generated by LaundroCFO — Sunnyvale Super Wash — {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
}
