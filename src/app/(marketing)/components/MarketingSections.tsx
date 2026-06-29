"use client";

import Link from "next/link";
import { useState } from "react";

/* ── Shared helpers ── */

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-14 max-w-3xl mx-auto">
      <h2 className="text-[28px] lg:text-[40px] font-bold text-white tracking-tight leading-tight mb-4">
        {title}
      </h2>
      {subtitle && <p className="text-[16px] lg:text-[18px] text-gray-700 dark:text-slate-400 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function IconCheck({ className = "text-emerald-400" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconX({ className = "text-red-400" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}

/* ── Section 1: Integrations ── */

const integrations = [
  { name: "QuickBooks", abbr: "QB", color: "#2CA01C", active: true },
  { name: "FasCard", abbr: "FC", color: "#2563eb", active: true },
  { name: "Bank Accounts", abbr: "🏦", color: "#60a5fa", active: true, isEmoji: true },
  { name: "CSV Import", abbr: "CSV", color: '#374151', active: true },
];

const comingSoon = ["Laundry POS", "Coin Laundry Pro", "CSC Pay"];

function IntegrationsStrip() {
  return (
    <section className="py-24 bg-[#0f1e3d] border-t border-slate-800/60">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeading
          title="Works With The Tools You Already Use"
          subtitle="Connect or import data from the systems laundromat owners already rely on."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
          {integrations.map((item) => (
            <div
              key={item.name}
              className="group relative rounded-xl p-5 flex flex-col items-center justify-center text-center transition-all duration-300"
              style={{
                background: "rgba(15,30,60,0.5)",
                border: "1px solid rgba(59,130,246,0.15)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(59,130,246,0.45)";
                e.currentTarget.style.boxShadow = "0 0 32px rgba(37,99,235,0.2), inset 0 1px 0 rgba(96,165,250,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(59,130,246,0.15)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-[14px] font-bold mb-3"
                style={{
                  background: `${item.color}18`,
                  border: `1px solid ${item.color}40`,
                  color: item.isEmoji ? undefined : item.color,
                }}
              >
                {item.abbr}
              </div>
              <span className="text-[13px] font-semibold text-slate-200">{item.name}</span>
            </div>
          ))}
          {comingSoon.map((name) => (
            <div
              key={name}
              className="rounded-xl p-5 flex flex-col items-center justify-center text-center opacity-50"
              style={{
                background: "rgba(30,41,59,0.3)",
                border: "1px solid rgba(71,85,105,0.3)",
              }}
            >
              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-[11px] font-bold mb-3 bg-slate-800/50 border border-slate-700 text-slate-500">
                ···
              </div>
              <span className="text-[13px] font-medium text-slate-500">{name}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-600 mt-1.5 font-medium">Coming Soon</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 2: Feature Pillars ── */

function MiniBarChartSvg({ heights, color = "#3b82f6" }: { heights: number[]; color?: string }) {
  const w = 200;
  const h = 48;
  const barW = w / heights.length - 3;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12">
      {heights.map((pct, i) => {
        const barH = (pct / 100) * h;
        return (
          <rect
            key={i}
            x={i * (barW + 3)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={2}
            fill={color}
            opacity={0.5 + (i / heights.length) * 0.5}
          />
        );
      })}
    </svg>
  );
}

function TrackBusinessMockup() {
  const utilities = [
    { label: "Water", pct: "14%", color: "#3b82f6" },
    { label: "Gas", pct: "8%", color: "#60a5fa" },
    { label: "Electric", pct: "6%", color: "#93c5fd" },
  ];
  return (
    <div
      className="rounded-xl p-4 mt-6"
      style={{ background: "rgba(2,11,31,0.6)", border: "1px solid rgba(59,130,246,0.15)" }}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Revenue Breakdown</div>
      <div className="space-y-2 mb-4">
        {[
          { label: "Self-Service", value: "$18,200" },
          { label: "Wash Dry Fold", value: "$7,500" },
          { label: "Vending", value: "$400" },
        ].map((row) => (
          <div key={row.label} className="flex justify-between text-[12px]">
            <span className="text-gray-700 dark:text-slate-400">{row.label}</span>
            <span className="text-white font-semibold tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Monthly Trend</div>
      <MiniBarChartSvg heights={[45, 52, 48, 58, 62, 68, 72, 75, 78, 82, 85, 88]} />
      <div className="grid grid-cols-3 gap-2 mt-4">
        {utilities.map((u) => (
          <div key={u.label} className="rounded-lg p-2 text-center" style={{ background: "rgba(30,41,59,0.5)" }}>
            <div className="text-[9px] text-slate-500">{u.label}</div>
            <div className="text-[14px] font-bold tabular-nums" style={{ color: u.color }}>
              {u.pct}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KnowValueMockup() {
  const equityPct = 61;
  return (
    <div
      className="rounded-xl p-4 mt-6"
      style={{ background: "rgba(2,11,31,0.6)", border: "1px solid rgba(59,130,246,0.15)" }}
    >
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: "Store Value", value: "$328,000", color: "#4ade80" },
          { label: "Debt", value: "$95,000", color: "#f87171" },
          { label: "Equity", value: "$233,000", color: "#60a5fa" },
          { label: "Multiple", value: "4.1×", color: "#f1f5f9" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg p-2.5" style={{ background: "rgba(30,41,59,0.5)" }}>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">{m.label}</div>
            <div className="text-[15px] font-bold tabular-nums" style={{ color: m.color }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">EBITDA</div>
      <div className="text-[18px] font-bold text-white tabular-nums mb-3">$80,000</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-2">Equity vs Debt</div>
      <div className="h-3 rounded-full overflow-hidden flex" style={{ background: "rgba(30,41,59,0.8)" }}>
        <div className="h-full rounded-l-full" style={{ width: `${equityPct}%`, background: "linear-gradient(90deg, #1d4ed8, #4ade80)" }} />
        <div className="h-full flex-1" style={{ background: "rgba(248,113,113,0.4)" }} />
      </div>
      <div className="flex justify-between text-[10px] mt-1.5">
        <span className="text-emerald-400">Equity {equityPct}%</span>
        <span className="text-red-400">Debt {100 - equityPct}%</span>
      </div>
    </div>
  );
}

function ManageDebtMockup() {
  const progress = 63 / 120;
  return (
    <div
      className="rounded-xl p-4 mt-6"
      style={{ background: "rgba(2,11,31,0.6)", border: "1px solid rgba(59,130,246,0.15)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-bold text-white">SBA Loan</span>
        <span className="badge badge-blue text-[10px]">Active</span>
      </div>
      <div className="space-y-2 mb-4">
        {[
          { label: "Balance", value: "$287,000" },
          { label: "Rate", value: "7.75%" },
          { label: "Payment", value: "$4,912/mo" },
          { label: "DSCR", value: "1.86×" },
          { label: "Remaining", value: "63 months" },
        ].map((row) => (
          <div key={row.label} className="flex justify-between text-[12px]">
            <span className="text-gray-700 dark:text-slate-400">{row.label}</span>
            <span className="text-white font-semibold tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-2">Amortization Progress</div>
      <svg viewBox="0 0 200 8" className="w-full h-2 rounded-full overflow-hidden">
        <rect x="0" y="0" width="200" height="8" rx="4" fill="rgba(30,41,59,0.8)" />
        <rect x="0" y="0" width={200 * progress} height="8" rx="4" fill="url(#amortGrad)" />
        <defs>
          <linearGradient id="amortGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>Origination</span>
        <span className="text-blue-400 font-medium">63 mo left</span>
        <span>Maturity</span>
      </div>
    </div>
  );
}

function GrowPortfolioMockup() {
  return (
    <div
      className="rounded-xl p-4 mt-6"
      style={{ background: "rgba(2,11,31,0.6)", border: "1px solid rgba(59,130,246,0.15)" }}
    >
      <div className="space-y-2 mb-4">
        {[
          { name: "Waterbury Laundromat", value: "$374k", dscr: "1.62×" },
          { name: "Mountain View Laundry", value: "$612k", dscr: "1.84×" },
        ].map((store) => (
          <div
            key={store.name}
            className="rounded-lg p-3 flex items-center justify-between"
            style={{ background: "rgba(30,41,59,0.5)", border: "1px solid rgba(59,130,246,0.1)" }}
          >
            <div>
              <div className="text-[12px] font-semibold text-white">{store.name}</div>
              <div className="text-[11px] text-slate-500">DSCR {store.dscr}</div>
            </div>
            <div className="text-[14px] font-bold text-emerald-400 tabular-nums">{store.value}</div>
          </div>
        ))}
      </div>
      <div
        className="rounded-lg p-3 grid grid-cols-3 gap-2 text-center"
        style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
      >
        {[
          { label: "Value", value: "$986k" },
          { label: "Equity", value: "$591k" },
          { label: "Global DSCR", value: "1.74×" },
        ].map((t) => (
          <div key={t.label}>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">{t.label}</div>
            <div className="text-[13px] font-bold text-white tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const pillars = [
  {
    id: "track-business",
    title: "Track Your Business",
    bullets: ["Revenue Analytics", "Utility Tracking", "Monthly P&L", "Equipment Management"],
    mockup: <TrackBusinessMockup />,
  },
  {
    id: "know-value",
    title: "Know Your Value",
    bullets: ["Store Valuation", "Equity Tracking", "Lease Analysis", "Portfolio Value"],
    mockup: <KnowValueMockup />,
  },
  {
    id: "manage-debt",
    title: "Manage Debt",
    bullets: ["Loan Tracking", "DSCR Analysis", "Amortization Schedules", "Debt Alerts"],
    mockup: <ManageDebtMockup />,
  },
  {
    id: "grow-portfolio",
    title: "Grow Your Portfolio",
    bullets: ["Multi-Store Analytics", "Benchmarking", "Bank Reports", "Investor Reporting"],
    mockup: <GrowPortfolioMockup />,
  },
];

function FeaturePillars() {
  return (
    <section id="features" className="py-28 bg-[#0a1628]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          {pillars.map((pillar) => (
            <div
              key={pillar.id}
              id={pillar.id}
              className="rounded-2xl p-6 lg:p-8 scroll-mt-24"
              style={{
                background: "linear-gradient(160deg, rgba(15,30,60,0.6) 0%, rgba(2,11,31,0.8) 100%)",
                border: "1px solid rgba(59,130,246,0.2)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
              }}
            >
              <h3 className="text-[22px] lg:text-[26px] font-bold text-white mb-4">{pillar.title}</h3>
              <ul className="space-y-2 mb-2">
                {pillar.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-[14px] text-gray-700 dark:text-slate-400">
                    <IconCheck className="text-blue-400 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              {pillar.mockup}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 3: Comparison Table ── */

const comparisonRows = [
  { qb: "Generic accounting", fc: "Revenue only", lc: "Complete operating system" },
  { qb: "No valuation", fc: "No debt tracking", lc: "Store value and equity" },
  { qb: "No lease analysis", fc: "No portfolio view", lc: "Portfolio analytics" },
  { qb: "No DSCR", fc: "No lender reports", lc: "Bank-ready reports" },
  { qb: "No equipment analytics", fc: "No benchmarking", lc: "Industry-specific insights" },
];

function ComparisonTable() {
  return (
    <section className="py-28 bg-[#020B1F]">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeading title="Built For Laundromats. Not Generic Accounting." />
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(59,130,246,0.15)" }}>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr style={{ background: "rgba(15,30,60,0.5)" }}>
                {["QuickBooks", "FasCard", "LaundroCFO"].map((col, i) => (
                  <th
                    key={col}
                    className="px-5 py-4 text-left text-[13px] font-semibold uppercase tracking-wider"
                    style={
                      i === 2
                        ? {
                            color: "#60a5fa",
                            background: "rgba(37,99,235,0.12)",
                            borderLeft: "2px solid #3b82f6",
                            borderRight: "2px solid #3b82f6",
                          }
                        : { color: '#374151' }
                    }
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, ri) => (
                <tr key={ri} style={{ borderTop: "1px solid rgba(59,130,246,0.08)" }}>
                  <td className="px-5 py-4 text-[14px] text-gray-700 dark:text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <IconX className="text-slate-500 shrink-0" />
                      {row.qb}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[14px] text-gray-700 dark:text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <IconX className="text-slate-500 shrink-0" />
                      {row.fc}
                    </span>
                  </td>
                  <td
                    className="px-5 py-4 text-[14px] text-white font-medium"
                    style={{ background: "rgba(37,99,235,0.08)", borderLeft: "2px solid #3b82f6", borderRight: "2px solid #3b82f6" }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <IconCheck />
                      {row.lc}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── Section 4: Portfolio Snapshot ── */

function EquityDebtDonut() {
  const equityPct = 55;
  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32 mx-auto">
      <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(248,113,113,0.35)" strokeWidth="14" />
      <circle
        cx="60"
        cy="60"
        r="48"
        fill="none"
        stroke="#4ade80"
        strokeWidth="14"
        strokeDasharray={`${(equityPct / 100) * 301.6} 301.6`}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="56" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="500">
        EQUITY
      </text>
      <text x="60" y="72" textAnchor="middle" fill="#4ade80" fontSize="16" fontWeight="700">
        55%
      </text>
    </svg>
  );
}

function PortfolioSnapshot() {
  const kpis = [
    { label: "Portfolio Value", value: "$2.9M" },
    { label: "Cash Position", value: "$109,000" },
    { label: "Debt", value: "$1.3M" },
    { label: "Equity", value: "$1.6M" },
    { label: "Global DSCR", value: "1.86×" },
    { label: "TTM EBITDA", value: "$450k" },
  ];
  return (
    <section className="py-28 bg-[#0f1e3d]">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading title="Your Entire Portfolio. One Dashboard." />
        <div
          className="rounded-2xl p-8 lg:p-12"
          style={{
            background: "linear-gradient(160deg, rgba(15,30,60,0.7) 0%, rgba(2,11,31,0.9) 100%)",
            border: "1px solid rgba(59,130,246,0.25)",
            boxShadow: "0 0 80px rgba(37,99,235,0.1), 0 32px 80px rgba(0,0,0,0.4)",
          }}
        >
          <div className="grid lg:grid-cols-[1fr_auto] gap-10 items-center">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 lg:gap-8">
              {kpis.map((kpi) => (
                <div key={kpi.label}>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500 mb-2">{kpi.label}</div>
                  <div className="text-[28px] lg:text-[36px] font-bold text-white tabular-nums tracking-tight leading-none">
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center">
              <EquityDebtDonut />
              <div className="flex gap-4 mt-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Equity
                </span>
                <span className="flex items-center gap-1.5 text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-400/60" /> Debt
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Section 5: Bank Reports ── */

const reports = [
  { title: "Executive Summary", rows: ["Portfolio Overview", "Key Metrics", "Risk Summary"] },
  { title: "Profit & Loss", rows: ["Revenue: $26,100", "Expenses: $11,450", "EBITDA: $14,650"] },
  { title: "DSCR Analysis", rows: ["Global DSCR: 1.86×", "Min Required: 1.25×", "Status: Strong"] },
  { title: "Global Cash Flow", rows: ["Operating CF: $42k", "Debt Service: $22k", "Net CF: $20k"] },
  { title: "Lease Summary", rows: ["Expiration: 2037", "Years Left: 11", "Rent/Sales: 13%"] },
  { title: "Equipment Summary", rows: ["Washers: 32", "Avg Age: 7 yrs", "Grade: A"] },
];

function BankReportsPreview() {
  return (
    <section className="py-28 bg-[#0a1628]">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeading
          title="Bank-Ready Reporting"
          subtitle="Generate professional reports your lender actually wants to see."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {reports.map((report) => (
            <div
              key={report.title}
              className="rounded-xl p-5 transition-all duration-300 hover:shadow-lg"
              style={{
                background: "rgba(15,30,60,0.5)",
                border: "1px solid rgba(59,130,246,0.15)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(59,130,246,0.35)";
                e.currentTarget.style.boxShadow = "0 8px 32px rgba(37,99,235,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(59,130,246,0.15)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700/50">
                <div className="w-8 h-10 rounded bg-white/5 border border-slate-600/30 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <span className="text-[14px] font-semibold text-white">{report.title}</span>
              </div>
              <div className="space-y-2">
                {report.rows.map((row) => (
                  <div key={row} className="flex items-center justify-between text-[12px]">
                    <span className="text-slate-500">{row.split(":")[0]}</span>
                    {row.includes(":") && (
                      <span className="text-gray-700 dark:text-slate-300 font-medium tabular-nums">{row.split(":")[1]?.trim()}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 h-1 rounded-full overflow-hidden flex gap-0.5">
                {[60, 80, 45].map((w, i) => (
                  <div key={i} className="h-full rounded-full bg-blue-500/20" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 6: Benchmarking ── */

const benchmarks = [
  { name: "Water %", value: "14.2%", status: "Healthy", badge: "badge-green" as const, store: 72, industry: 55 },
  { name: "Gas %", value: "8.1%", status: "Watch", badge: "badge-amber" as const, store: 58, industry: 45 },
  { name: "Electric %", value: "6.3%", status: "Healthy", badge: "badge-green" as const, store: 48, industry: 50 },
  { name: "Rent %", value: "11.5%", status: "Healthy", badge: "badge-green" as const, store: 42, industry: 48 },
  { name: "Payroll %", value: "15.3%", status: "High", badge: "badge-red" as const, store: 78, industry: 50 },
  { name: "Utilities %", value: "28.6%", status: "Watch", badge: "badge-amber" as const, store: 65, industry: 52 },
  { name: "Revenue Per Sq Ft", value: "$7.25", status: "Healthy", badge: "badge-green" as const, store: 70, industry: 55 },
  { name: "DSCR", value: "1.86×", status: "Healthy", badge: "badge-green" as const, store: 82, industry: 60 },
];

function BenchmarkBar({ store, industry }: { store: number; industry: number }) {
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-slate-500 w-14 shrink-0">Store</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(30,41,59,0.8)" }}>
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${store}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-slate-500 w-14 shrink-0">Industry</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(30,41,59,0.8)" }}>
          <div className="h-full rounded-full bg-slate-500" style={{ width: `${industry}%` }} />
        </div>
      </div>
    </div>
  );
}

function BenchmarkingSection() {
  return (
    <section className="py-28 bg-[#020B1F]">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeading title="Compare Your Store Against Industry Metrics" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {benchmarks.map((b) => (
            <div
              key={b.name}
              className="card rounded-xl !p-4"
              style={{ background: "rgba(15,30,60,0.5)", borderColor: "rgba(59,130,246,0.12)" }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[12px] font-medium text-gray-700 dark:text-slate-400 leading-tight">{b.name}</span>
                <span className={`badge ${b.badge} shrink-0`}>{b.status}</span>
              </div>
              <div className="text-[20px] font-bold text-white tabular-nums">{b.value}</div>
              <BenchmarkBar store={b.store} industry={b.industry} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 7: Lease Analytics ── */

function LeaseAnalytics() {
  const totalYears = 15;
  const elapsed = 4;
  const positionPct = (elapsed / totalYears) * 100;
  return (
    <section className="py-28 bg-[#0f1e3d]">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeading title="Know Your Lease Position" />
        <div
          className="rounded-2xl p-8"
          style={{
            background: "linear-gradient(160deg, rgba(15,30,60,0.6) 0%, rgba(2,11,31,0.85) 100%)",
            border: "1px solid rgba(59,130,246,0.2)",
          }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
            {[
              { label: "Lease Expiration", value: "2037" },
              { label: "Years Remaining", value: "11" },
              { label: "Rent-to-Sales Ratio", value: "13%" },
              { label: "Options Remaining", value: "2" },
            ].map((m) => (
              <div key={m.label}>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{m.label}</div>
                <div className="text-[28px] font-bold text-white tabular-nums">{m.value}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Lease Timeline</div>
          <div className="relative pt-6 pb-2">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(30,41,59,0.8)" }}>
              <div
                className="h-full rounded-full relative"
                style={{
                  width: `${100 - positionPct}%`,
                  marginLeft: `${positionPct}%`,
                  background: "linear-gradient(90deg, #1d4ed8, #60a5fa)",
                }}
              />
            </div>
            <div
              className="absolute top-0 flex flex-col items-center"
              style={{ left: `${positionPct}%`, transform: "translateX(-50%)" }}
            >
              <div
                className="w-3 h-3 rounded-full border-2 border-white"
                style={{ background: "#3b82f6", boxShadow: "0 0 12px rgba(59,130,246,0.6)" }}
              />
              <span className="text-[10px] text-blue-400 font-medium mt-1 whitespace-nowrap">Today</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-2">
              <span>2023 Start</span>
              <span>2037 Expiration</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Section 8: Equipment Analytics ── */

const ageBrackets = [
  { label: "0–3 yrs", count: 8, color: "#4ade80" },
  { label: "4–7 yrs", count: 18, color: "#60a5fa" },
  { label: "8–12 yrs", count: 28, color: "#fbbf24" },
  { label: "12+ yrs", count: 12, color: "#f87171" },
];

function EquipmentAnalytics() {
  const maxCount = Math.max(...ageBrackets.map((b) => b.count));
  return (
    <section className="py-28 bg-[#0a1628]">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeading title="Track Every Machine" />
        <div
          className="rounded-2xl p-8"
          style={{
            background: "linear-gradient(160deg, rgba(15,30,60,0.6) 0%, rgba(2,11,31,0.85) 100%)",
            border: "1px solid rgba(59,130,246,0.2)",
          }}
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
            {[
              { label: "Washers", value: "32" },
              { label: "Dryers", value: "34" },
              { label: "Average Age", value: "7 Years" },
              { label: "200G Machines", value: "100%" },
              { label: "Est. Replacement", value: "$410,000" },
            ].map((m) => (
              <div key={m.label} className="text-center md:text-left">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{m.label}</div>
                <div className="text-[22px] font-bold text-white tabular-nums">{m.value}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-4">Age Distribution</div>
          <div className="flex items-end gap-3 h-32">
            {ageBrackets.map((b) => (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${(b.count / maxCount) * 100}%`,
                    minHeight: "20%",
                    background: `linear-gradient(to top, ${b.color}88, ${b.color})`,
                  }}
                />
                <span className="text-[10px] text-slate-500 text-center">{b.label}</span>
                <span className="text-[12px] font-semibold text-white">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Section 9: Sample P&L ── */

function SamplePL() {
  const revenue = [
    { label: "Self-Service", value: "$18,200" },
    { label: "Wash Dry Fold", value: "$7,500" },
    { label: "Vending", value: "$400" },
  ];
  const expenses = [
    { label: "Water", value: "$2,100" },
    { label: "Gas", value: "$1,250" },
    { label: "Electric", value: "$850" },
    { label: "Rent", value: "$3,000" },
    { label: "Payroll", value: "$4,000" },
    { label: "Insurance", value: "$250" },
  ];
  return (
    <section className="py-28 bg-[#020B1F]">
      <div className="max-w-2xl mx-auto px-6">
        <SectionHeading title="Beautiful Monthly Financials" />
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(59,130,246,0.2)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
        >
          <div className="px-6 py-4 border-b border-slate-700/50" style={{ background: "rgba(15,30,60,0.8)" }}>
            <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Monthly P&L</div>
            <div className="text-[18px] font-bold text-white mt-1">March 2025</div>
          </div>
          <div className="px-6 py-5" style={{ background: "rgba(2,11,31,0.6)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-3">Revenue</div>
            {revenue.map((row, i) => (
              <div
                key={row.label}
                className="flex justify-between py-2.5 text-[14px]"
                style={{ background: i % 2 === 0 ? "rgba(30,41,59,0.25)" : "transparent", margin: "0 -12px", padding: "10px 12px" }}
              >
                <span className="text-gray-700 dark:text-slate-400">{row.label}</span>
                <span className="text-white font-medium tabular-nums">{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between py-3 text-[14px] font-semibold border-t border-slate-700/40 mt-1">
              <span className="text-gray-700 dark:text-slate-300">Total Revenue</span>
              <span className="text-white tabular-nums">$26,100</span>
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-3 mt-6">Expenses</div>
            {expenses.map((row, i) => (
              <div
                key={row.label}
                className="flex justify-between py-2.5 text-[14px]"
                style={{ background: i % 2 === 0 ? "rgba(30,41,59,0.25)" : "transparent", margin: "0 -12px", padding: "10px 12px" }}
              >
                <span className="text-gray-700 dark:text-slate-400">{row.label}</span>
                <span className="text-white font-medium tabular-nums">{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between py-3 text-[14px] font-semibold border-t border-slate-700/40 mt-1">
              <span className="text-gray-700 dark:text-slate-300">Total Expenses</span>
              <span className="text-white tabular-nums">$11,450</span>
            </div>

            <div
              className="flex justify-between items-center py-5 px-4 -mx-2 mt-6 rounded-xl"
              style={{
                background: "linear-gradient(135deg, rgba(37,99,235,0.15) 0%, rgba(74,222,128,0.08) 100%)",
                border: "1px solid rgba(74,222,128,0.25)",
              }}
            >
              <div>
                <div className="text-[11px] uppercase tracking-wider text-emerald-400 mb-1">EBITDA</div>
                <div className="text-[28px] font-bold text-white tabular-nums">$14,650</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Margin</div>
                <div className="text-[28px] font-bold text-emerald-400 tabular-nums">56%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Section 10: Trust Badges ── */

const trustItems = [
  { label: "Secure Cloud Infrastructure", icon: "shield" },
  { label: "Automatic Backups", icon: "backup" },
  { label: "Multi-Store Support", icon: "stores" },
  { label: "Mobile Friendly", icon: "mobile" },
  { label: "Bank-Ready Reports", icon: "report" },
  { label: "Private Owner Data", icon: "lock" },
];

function TrustIconSvg({ type }: { type: string }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "#60a5fa", strokeWidth: 1.5 };
  switch (type) {
    case "shield":
      return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case "backup":
      return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
    case "stores":
      return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    case "mobile":
      return <svg {...props}><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>;
    case "report":
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
    case "lock":
      return <svg {...props}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    default:
      return null;
  }
}

function TrustBadgesSection() {
  return (
    <section className="py-28 bg-[#0f1e3d]">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeading title="Built For Serious Operators" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trustItems.map((item) => (
            <div
              key={item.label}
              className="inline-flex items-center gap-3 px-4 py-4 rounded-xl"
              style={{
                background: "rgba(30,41,59,0.5)",
                border: "1px solid rgba(59,130,246,0.15)",
              }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}
              >
                <TrustIconSvg type={item.icon} />
              </div>
              <div className="flex items-center gap-2">
                <IconCheck className="text-emerald-400 shrink-0" />
                <span className="text-[14px] text-gray-700 dark:text-slate-300 font-medium">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 11: FAQ ── */

const faqs = [
  {
    q: "Who is LaundroCFO for?",
    a: "Single-store owners, multi-store operators, buyers, investors, and lenders.",
  },
  {
    q: "Does it replace QuickBooks?",
    a: "No. It complements QuickBooks with operational and valuation insights.",
  },
  { q: "Can I manage multiple stores?", a: "Yes." },
  { q: "Can I track debt and DSCR?", a: "Yes." },
  { q: "Can I generate lender reports?", a: "Yes." },
  { q: "Is it mobile friendly?", a: "Yes." },
];

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section className="py-28 bg-[#0a1628]">
      <div className="max-w-2xl mx-auto px-6">
        <SectionHeading title="Frequently Asked Questions" />
        <div className="space-y-2">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={faq.q}
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid rgba(59,130,246,0.12)", background: "rgba(15,30,60,0.4)" }}
              >
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                >
                  <span className="text-[15px] font-semibold text-white pr-4">{faq.q}</span>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-[14px] text-gray-700 dark:text-slate-400 leading-relaxed border-t border-slate-700/30 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Section 12: Final CTA ── */

function FinalCTA() {
  return (
    <section className="py-28 bg-[#020B1F] border-t border-slate-800/60">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-[32px] lg:text-[44px] font-bold text-white tracking-tight leading-tight mb-4">
          Know Your Value. Manage Your Debt. Grow Your Portfolio.
        </h2>
        <p className="text-[18px] text-gray-700 dark:text-slate-400 mb-10">
          The operating system built specifically for laundromat owners.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-[14px] font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            style={{ boxShadow: "0 0 24px rgba(37,99,235,0.4)" }}
          >
            Start Free Trial →
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-[14px] font-semibold border border-white/30 text-white hover:border-white/50 hover:bg-white/5 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Export ── */

export default function MarketingSections() {
  return (
    <>
      <IntegrationsStrip />
      <FeaturePillars />
      <ComparisonTable />
      <PortfolioSnapshot />
      <BankReportsPreview />
      <BenchmarkingSection />
      <LeaseAnalytics />
      <EquipmentAnalytics />
      <SamplePL />
      <TrustBadgesSection />
      <FAQSection />
      <FinalCTA />
    </>
  );
}
