"use client";

import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

/* ── Mini charts (div-only) ── */

function MiniBarChart() {
  const heights = [38, 52, 45, 58, 68, 74, 82, 78, 88, 92, 85, 95];
  return (
    <div className="flex items-end gap-[3px] h-9 mt-1.5">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-[2px]"
          style={{
            height: `${h}%`,
            background: "linear-gradient(to top, #1d4ed8, #60a5fa)",
            opacity: 0.85 + (i / heights.length) * 0.15,
          }}
        />
      ))}
    </div>
  );
}

function MiniLineChart() {
  const points = [72, 58, 65, 48, 55, 38, 42, 30, 35, 22, 28, 18];
  return (
    <div className="relative h-9 mt-1.5">
      {points.map((top, i) => (
        <div
          key={i}
          className="absolute w-[5px] h-[5px] rounded-full bg-emerald-400"
          style={{
            left: `${(i / (points.length - 1)) * 100}%`,
            top: `${top}%`,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 4px rgba(74, 222, 128, 0.6)",
          }}
        />
      ))}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(74,222,128,0.15) 20%, rgba(74,222,128,0.3) 50%, rgba(74,222,128,0.15) 80%, transparent 100%)",
          clipPath:
            "polygon(0% 28%, 9% 42%, 18% 35%, 27% 52%, 36% 45%, 45% 62%, 55% 58%, 64% 70%, 73% 65%, 82% 78%, 91% 72%, 100% 82%, 100% 100%, 0% 100%)",
        }}
      />
    </div>
  );
}

function EquipmentDonut() {
  return (
    <div className="relative w-11 h-11 mx-auto">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "conic-gradient(from 135deg, #22c55e 0deg, #4ade80 270deg, rgba(30,41,59,0.8) 270deg)",
          padding: "3px",
        }}
      >
        <div
          className="w-full h-full rounded-full flex items-center justify-center"
          style={{ background: "rgba(15,23,42,0.95)" }}
        >
          <span className="text-[15px] font-bold text-emerald-400">A</span>
        </div>
      </div>
    </div>
  );
}

/* ── Washing-machine gauge (div-only) ── */

function WashingMachineGauge() {
  return (
    <div className="hero-gauge-wrapper relative mx-auto w-[200px] h-[200px] lg:w-[250px] lg:h-[250px]">
      {/* Outer metallic rim */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(145deg, rgba(59,130,246,0.5) 0%, rgba(15,23,42,0.9) 30%, rgba(30,58,138,0.6) 70%, rgba(59,130,246,0.4) 100%)",
          boxShadow:
            "inset 0 2px 8px rgba(96,165,250,0.3), inset 0 -4px 12px rgba(0,0,0,0.5), 0 0 40px rgba(37,99,235,0.25), 0 0 80px rgba(37,99,235,0.1)",
        }}
      />

      {/* Blue rim highlight (top-left) */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(96,165,250,0.35) 0%, transparent 40%, transparent 100%)",
        }}
      />

      {/* Progress arc ring */}
      <div
        className="absolute inset-[6px] lg:inset-[8px] rounded-full"
        style={{
          background:
            "conic-gradient(from 200deg, #3b82f6 0deg, #22c55e 55deg, #4ade80 110deg, transparent 110deg, transparent 360deg)",
          padding: "10px",
        }}
      >
        <div
          className="w-full h-full rounded-full"
          style={{
            background: "radial-gradient(circle at 50% 45%, rgba(2,11,31,0.95) 0%, rgba(2,11,31,1) 70%)",
            boxShadow: "inset 0 0 30px rgba(0,0,0,0.6), inset 0 0 60px rgba(37,99,235,0.08)",
          }}
        />
      </div>

      {/* Inner glass door */}
      <div
        className="absolute inset-[22px] lg:inset-[28px] rounded-full flex flex-col items-center justify-center text-center"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(15,30,60,0.6) 0%, rgba(2,11,31,0.95) 80%)",
          border: "1px solid rgba(59,130,246,0.15)",
          boxShadow: "inset 0 2px 20px rgba(96,165,250,0.1)",
        }}
      >
        <span className="text-[8px] lg:text-[9px] uppercase tracking-[0.18em] text-slate-500 mb-0.5">
          Store Value
        </span>
        <span
          className="hero-gauge-value text-[22px] lg:text-[30px] font-bold tabular-nums leading-none mb-1.5"
          style={{ color: "#4ade80", textShadow: "0 0 20px rgba(74,222,128,0.4)" }}
        >
          <AnimatedNumber value={374000} prefix="$" duration={1500} />
        </span>
        <span className="text-[7px] lg:text-[8px] uppercase tracking-[0.12em] text-slate-500 mb-0.5">
          Current Multiple
        </span>
        <span className="text-[16px] lg:text-[20px] font-bold text-white tabular-nums mb-2">4.7x</span>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] lg:text-[9px] font-medium"
          style={{
            background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(74,222,128,0.25)",
            color: "#4ade80",
          }}
        >
          ↑ +12% vs 90 Days Ago
        </span>
      </div>

      {/* Door handle / latch (right side) */}
      <div
        className="absolute right-[-2px] top-1/2 -translate-y-1/2 w-[10px] h-[28px] lg:w-[12px] lg:h-[34px] rounded-r-md"
        style={{
          background: "linear-gradient(90deg, rgba(59,130,246,0.3), rgba(96,165,250,0.6))",
          boxShadow: "2px 0 8px rgba(37,99,235,0.3), inset -1px 0 4px rgba(0,0,0,0.3)",
        }}
      />
      <div
        className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full"
        style={{
          background: "radial-gradient(circle, #93c5fd 30%, #3b82f6 100%)",
          boxShadow: "0 0 6px rgba(96,165,250,0.8)",
        }}
      />

      {/* Arc endpoint glow dot */}
      <div
        className="absolute w-[10px] h-[10px] rounded-full hero-gauge-dot"
        style={{
          top: "14%",
          right: "22%",
          background: "radial-gradient(circle, #93c5fd 20%, #60a5fa 100%)",
          boxShadow: "0 0 10px rgba(96,165,250,0.9), 0 0 20px rgba(59,130,246,0.5)",
        }}
      />
    </div>
  );
}

/* ── Floating side cards ── */

function FloatCard({
  icon,
  iconColor,
  label,
  value,
  valueColor = "text-white",
  className = "",
  delay = 0,
  connector = "left",
}: {
  icon: ReactNode;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
  className?: string;
  delay?: number;
  connector?: "left" | "right";
}) {
  return (
    <div
      className={`hero-floating-badge absolute ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {connector === "left" && <div className="hero-connector hero-connector-left" />}
      {connector === "right" && <div className="hero-connector hero-connector-right" />}
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}30` }}
        >
          {icon}
        </div>
        <div>
          <div className="text-[8px] text-slate-500 leading-tight">{label}</div>
          <div className={`text-[10px] font-semibold leading-tight ${valueColor}`}>{value}</div>
        </div>
      </div>
    </div>
  );
}

function FloatIcon({ type }: { type: "chart" | "dollar" | "star" | "washer" | "lease" | "lender" | "qb" }) {
  const base = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", strokeWidth: 2 };

  switch (type) {
    case "chart":
      return (
        <svg {...base} stroke="#60a5fa">
          <path d="M3 3v18h18" />
          <rect x="7" y="10" width="3" height="8" rx="0.5" fill="#60a5fa" stroke="none" />
          <rect x="13" y="6" width="3" height="12" rx="0.5" fill="#60a5fa" stroke="none" />
          <rect x="19" y="8" width="3" height="10" rx="0.5" fill="#60a5fa" stroke="none" />
        </svg>
      );
    case "dollar":
      return (
        <svg {...base} stroke="#4ade80">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 6v12M9 9.5h4.5a2 2 0 0 1 0 4H9.5M9 14.5h5a2 2 0 0 0 0-4H9" />
        </svg>
      );
    case "star":
      return (
        <svg {...base} stroke="#60a5fa" fill="#60a5fa">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
        </svg>
      );
    case "washer":
      return (
        <svg {...base} stroke="#4ade80">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="#4ade80" />
        </svg>
      );
    case "lease":
      return (
        <svg {...base} stroke="#60a5fa">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      );
    case "lender":
      return (
        <svg {...base} stroke="#a78bfa">
          <rect x="3" y="8" width="18" height="13" rx="2" />
          <path d="M9 8V5a3 3 0 0 1 6 0v3" />
          <path d="M12 12v4" />
        </svg>
      );
    case "qb":
      return (
        <span className="text-[9px] font-bold text-emerald-400 leading-none">QB</span>
      );
  }
}

/* ── Main dashboard ── */

export default function HeroDashboard() {
  const kpis = [
    { label: "Store Value", numericValue: 374000, prefix: "$", decimals: 0, suffix: "", sub: "↗ 8.4%", valueColor: "#4ade80", delay: 0.1 },
    { label: "EBITDA", numericValue: 80000, prefix: "$", decimals: 0, suffix: "", sub: "↗ 6.2%", valueColor: "#f1f5f9", delay: 0.2 },
    { label: "DSCR", numericValue: 1.62, prefix: "", decimals: 2, suffix: "x", sub: "↗ 0.12x", valueColor: "#f1f5f9", delay: 0.3 },
    { label: "Store Score", numericValue: 89, prefix: "", decimals: 0, suffix: "/100", sub: "Excellent", valueColor: "#f1f5f9", delay: 0.4 },
  ];

  return (
    <div className="hero-dashboard relative w-full px-2 sm:px-6 lg:px-10">
      {/* Left floating cards */}
      <FloatCard
        icon={<FloatIcon type="chart" />}
        iconColor="#60a5fa"
        label="Store Value Growth"
        value="+12%"
        valueColor="text-blue-400"
        className="top-[22%] left-0 lg:-left-2 xl:-left-4 z-20"
        delay={0}
        connector="right"
      />
      <FloatCard
        icon={<FloatIcon type="dollar" />}
        iconColor="#4ade80"
        label="DSCR"
        value="1.62x Strong"
        valueColor="text-emerald-400"
        className="top-[38%] -left-1 lg:-left-6 xl:-left-10 z-20 hide-mobile"
        delay={0.5}
        connector="right"
      />
      <FloatCard
        icon={<FloatIcon type="star" />}
        iconColor="#60a5fa"
        label="Store Score"
        value="89/100 Excellent"
        valueColor="text-emerald-400"
        className="top-[54%] left-0 lg:-left-4 xl:-left-8 z-20 hide-mobile"
        delay={1}
        connector="right"
      />

      {/* Right floating cards */}
      <FloatCard
        icon={<FloatIcon type="washer" />}
        iconColor="#4ade80"
        label="Equipment Grade"
        value="A Well Maintained"
        valueColor="text-emerald-400"
        className="top-[18%] right-0 lg:-right-4 xl:-right-10 z-20"
        delay={0.3}
        connector="left"
      />
      <FloatCard
        icon={<FloatIcon type="lease" />}
        iconColor="#60a5fa"
        label="Lease Score"
        value="94/100 Low Risk"
        valueColor="text-emerald-400"
        className="top-[34%] -right-1 lg:-right-8 xl:-right-14 z-20 hide-mobile"
        delay={0.8}
        connector="left"
      />
      <FloatCard
        icon={<FloatIcon type="lender" />}
        iconColor="#a78bfa"
        label="Lender Ready"
        value="✓ Reports Ready"
        valueColor="text-purple-300"
        className="top-[50%] right-0 lg:-right-2 xl:-right-6 z-20"
        delay={1.2}
        connector="left"
      />
      <FloatCard
        icon={<FloatIcon type="qb" />}
        iconColor="#22c55e"
        label="QuickBooks"
        value="Connected"
        valueColor="text-emerald-400"
        className="top-[66%] -right-1 lg:-right-6 xl:-right-12 z-20 hide-mobile"
        delay={1.5}
        connector="left"
      />

      {/* Main panel */}
      <div
        className="hero-panel relative rounded-[20px] lg:rounded-[24px] p-3.5 lg:p-5 mt-6 lg:mt-8"
        style={{
          background: "linear-gradient(160deg, rgba(15,30,60,0.7) 0%, rgba(2,11,31,0.85) 50%, rgba(10,20,45,0.9) 100%)",
          border: "1px solid rgba(59,130,246,0.25)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow:
            "inset 1px 1px 0 rgba(96,165,250,0.15), 0 0 60px rgba(37,99,235,0.18), 0 24px 64px rgba(0,0,0,0.45)",
        }}
      >
        {/* Top rim glow */}
        <div
          className="absolute top-0 left-4 right-4 h-[1px] rounded-full pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.6), transparent)" }}
        />
        <div
          className="absolute top-4 left-0 bottom-4 w-[1px] rounded-full pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(96,165,250,0.5), transparent 60%)" }}
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-3 lg:mb-4">
          <span className="text-[13px] lg:text-[15px] font-bold text-blue-400 tracking-tight">LaundroCFO</span>
          <div className="flex items-center gap-1.5">
            <span className="hero-live-dot w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-emerald-400" />
            <span className="text-[9px] lg:text-[11px] text-emerald-400 font-medium">Live Data</span>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-1.5 lg:gap-2.5 mb-3 lg:mb-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="hero-kpi-card rounded-[8px] lg:rounded-[10px] p-2 lg:p-2.5"
              style={{
                background: "rgba(30,41,59,0.45)",
                border: "1px solid rgba(59,130,246,0.12)",
                animationDelay: `${kpi.delay}s`,
              }}
            >
              <div className="text-[7px] lg:text-[8px] uppercase tracking-wider text-slate-500 mb-0.5 leading-tight">
                {kpi.label}
              </div>
              <div
                className="text-[11px] lg:text-[14px] font-bold tabular-nums leading-tight"
                style={{ color: kpi.valueColor }}
              >
                <AnimatedNumber
                  value={kpi.numericValue}
                  prefix={kpi.prefix}
                  suffix={kpi.suffix}
                  decimals={kpi.decimals}
                  duration={1500}
                />
              </div>
              <div className="text-[8px] lg:text-[9px] text-emerald-400 mt-0.5">{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Central gauge */}
        <div className="relative flex justify-center py-2 lg:py-4 mb-3 lg:mb-4">
          <WashingMachineGauge />
        </div>

        {/* Bottom charts row */}
        <div className="grid grid-cols-4 gap-1.5 lg:gap-2.5 mb-3">
          <div
            className="rounded-[8px] lg:rounded-[10px] p-2 lg:p-2.5"
            style={{ background: "rgba(30,41,59,0.45)", border: "1px solid rgba(59,130,246,0.12)" }}
          >
            <div className="text-[6px] lg:text-[7px] uppercase tracking-wider text-slate-500 leading-tight">
              Revenue Trend (12 Mo)
            </div>
            <MiniBarChart />
            <div className="text-[8px] lg:text-[9px] text-emerald-400 mt-0.5">↗ 9.3%</div>
          </div>

          <div
            className="rounded-[8px] lg:rounded-[10px] p-2 lg:p-2.5"
            style={{ background: "rgba(30,41,59,0.45)", border: "1px solid rgba(59,130,246,0.12)" }}
          >
            <div className="text-[6px] lg:text-[7px] uppercase tracking-wider text-slate-500 leading-tight">
              Utility Expense (12 Mo)
            </div>
            <MiniLineChart />
            <div className="text-[8px] lg:text-[9px] text-emerald-400 mt-0.5">↘ -4.1%</div>
          </div>

          <div
            className="rounded-[8px] lg:rounded-[10px] p-2 lg:p-2.5 flex flex-col"
            style={{ background: "rgba(30,41,59,0.45)", border: "1px solid rgba(59,130,246,0.12)" }}
          >
            <div className="text-[6px] lg:text-[7px] uppercase tracking-wider text-slate-500 mb-1 leading-tight">
              Equipment Age Score
            </div>
            <EquipmentDonut />
            <div className="text-[7px] lg:text-[8px] text-slate-400 mt-1 text-center leading-tight">
              Excellent: 8.2/10
            </div>
          </div>

          <div
            className="rounded-[8px] lg:rounded-[10px] p-2 lg:p-2.5"
            style={{ background: "rgba(30,41,59,0.45)", border: "1px solid rgba(59,130,246,0.12)" }}
          >
            <div className="text-[6px] lg:text-[7px] uppercase tracking-wider text-slate-500 mb-0.5 leading-tight">
              Lease Timeline
            </div>
            <div className="text-[10px] lg:text-[12px] font-bold text-white mb-1.5 leading-tight">
              4.6 Years Remaining
            </div>
            <div className="h-1 lg:h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(30,41,59,0.8)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: "76%",
                  background: "linear-gradient(90deg, #1d4ed8, #3b82f6)",
                  boxShadow: "0 0 8px rgba(59,130,246,0.5)",
                }}
              />
            </div>
            <div className="text-[7px] lg:text-[8px] text-slate-500 mt-1">Lease Score: 94/100</div>
          </div>
        </div>

        {/* Status bar */}
        <div
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[7px] lg:text-[9px] text-slate-500 pt-2"
          style={{ borderTop: "1px solid rgba(51,65,85,0.4)" }}
        >
          <span className="inline-flex items-center gap-1">
            <span className="text-slate-600">📍</span> Dense Urban
          </span>
          <span className="text-slate-700 hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-blue-500/20 text-[6px] flex items-center justify-center text-blue-400">
              W
            </span>
            Washers: 32
          </span>
          <span className="text-slate-700 hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-blue-500/20 text-[6px] flex items-center justify-center text-blue-400">
              D
            </span>
            Dryers: 32
          </span>
          <span className="text-slate-700 hidden sm:inline">·</span>
          <span>Store Size: 3,600 sq ft</span>
          <span className="text-slate-700 hidden sm:inline">·</span>
          <span>Vintage: 2019</span>
        </div>
      </div>
    </div>
  );
}
