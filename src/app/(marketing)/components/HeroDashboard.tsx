import type { ReactNode } from "react";

function MiniBarChart() {
  const heights = [40, 55, 48, 62, 70, 85];
  return (
    <div className="flex items-end gap-1 h-10 mt-2">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-gradient-to-t from-blue-600 to-blue-400"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function MiniLineChart() {
  return (
    <svg viewBox="0 0 80 32" className="w-full h-10 mt-2" preserveAspectRatio="none">
      <polyline
        points="0,8 16,14 32,10 48,18 64,12 80,22"
        fill="none"
        stroke="#4ade80"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ValuationGauge() {
  const size = 280;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillPercent = 0.75;
  const dashOffset = circumference * (1 - fillPercent);

  const dotAngle = -Math.PI / 2 + 2 * Math.PI * fillPercent;
  const dotX = size / 2 + radius * Math.cos(dotAngle);
  const dotY = size / 2 + radius * Math.sin(dotAngle);

  return (
    <div className="hero-gauge-wrapper relative mx-auto">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="hero-gauge-svg w-[220px] h-[220px] lg:w-[280px] lg:h-[280px]"
        aria-hidden
      >
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <filter id="gaugeDotGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="rgba(2,11,31,0.8)"
          stroke="rgba(59,130,246,0.1)"
          strokeWidth={strokeWidth}
        />

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="hero-gauge-arc"
        />

        <circle
          cx={dotX}
          cy={dotY}
          r={6}
          fill="#60a5fa"
          filter="url(#gaugeDotGlow)"
          className="hero-gauge-dot"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="text-[10px] uppercase tracking-[0.15em] text-slate-400 mb-1">Store Value</span>
        <span className="hero-gauge-value text-[32px] lg:text-[48px] font-bold text-white tabular-nums leading-none mb-2">
          $824,817
        </span>
        <span className="text-[10px] text-slate-400 mb-0.5">Current Multiple</span>
        <span className="text-[22px] lg:text-[28px] font-bold text-blue-400 tabular-nums mb-3">4.7x</span>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
          ↗ +12% vs 90 Days Ago
        </span>
      </div>
    </div>
  );
}


function FloatingBadge({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`hero-floating-badge absolute text-[11px] text-slate-300 whitespace-nowrap ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

export default function HeroDashboard() {
  const kpis = [
    { label: "Store Value", value: "$824,817", sub: "↗ 12.2%", delay: 0.1 },
    { label: "EBITDA", value: "$237,843", sub: "↗ 8.7%", delay: 0.2 },
    { label: "DSCR", value: "2.18x", sub: "↗ 0.18x", delay: 0.3 },
    { label: "Store Score", value: "89/100", sub: "Excellent", delay: 0.4 },
  ];

  return (
    <div className="hero-dashboard relative w-full overflow-hidden">
      <FloatingBadge className="-top-2 left-0 lg:-top-3 lg:left-2" delay={0}>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
            <path d="M3 3v18h18" />
            <path d="m7 16 4-4 4 4 4-4" />
          </svg>
          Store Value Growth +12%
        </span>
      </FloatingBadge>

      <FloatingBadge className="top-[28%] -left-1 lg:-left-4 hide-mobile" delay={0.5}>
        DSCR 2.18x · Strong
      </FloatingBadge>

      <FloatingBadge className="bottom-[38%] -left-1 lg:-left-3 hide-mobile" delay={1}>
        Store Score 89/100 · Excellent
      </FloatingBadge>

      <FloatingBadge className="-top-1 right-0 lg:-top-2 lg:right-2" delay={0.3}>
        Equipment Grade A · Well Maintained
      </FloatingBadge>

      <FloatingBadge className="top-[32%] -right-1 lg:-right-3 hide-mobile" delay={0.8}>
        Lease Score 94/100 · Low Risk
      </FloatingBadge>

      <FloatingBadge className="bottom-[36%] right-0 lg:right-1" delay={1.2}>
        Lender Ready ✓ Reports Ready
      </FloatingBadge>

      <FloatingBadge className="bottom-0 -right-1 lg:-right-2 hide-mobile" delay={1.5}>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-green-600 text-[8px] font-bold text-white">
            QB
          </span>
          QuickBooks Connected
        </span>
      </FloatingBadge>

      <div
        className="relative rounded-[20px] p-4 lg:p-6 mt-8 lg:mt-10"
        style={{
          background: "rgba(15,23,42,0.6)",
          border: "1px solid rgba(59,130,246,0.2)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 0 60px rgba(37,99,235,0.15), 0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[15px] font-bold text-blue-400">LaundroCFO</span>
          <div className="flex items-center gap-2">
            <span className="hero-live-dot w-2 h-2 rounded-full bg-green-400" />
            <span className="text-[11px] text-green-400 font-medium">Live Data</span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3 mb-5">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="hero-kpi-card rounded-[10px] p-3"
              style={{
                background: "rgba(30,41,59,0.5)",
                border: "1px solid rgba(59,130,246,0.15)",
                animationDelay: `${kpi.delay}s`,
              }}
            >
              <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">{kpi.label}</div>
              <div className="text-[14px] lg:text-[16px] font-bold text-white tabular-nums leading-tight">
                {kpi.value}
              </div>
              <div className="text-[10px] text-green-400 mt-0.5">{kpi.sub}</div>
            </div>
          ))}
        </div>

        <div className="relative flex justify-center py-4 lg:py-6 mb-5">
          <ValuationGauge />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3 mb-4">
          <div
            className="rounded-[10px] p-3"
            style={{ background: "rgba(30,41,59,0.5)", border: "1px solid rgba(59,130,246,0.15)" }}
          >
            <div className="text-[8px] uppercase tracking-wider text-slate-400 leading-tight">
              Revenue Trend (12 Mo)
            </div>
            <MiniBarChart />
            <div className="text-[10px] text-green-400 mt-1">↗ 9.3%</div>
          </div>

          <div
            className="rounded-[10px] p-3"
            style={{ background: "rgba(30,41,59,0.5)", border: "1px solid rgba(59,130,246,0.15)" }}
          >
            <div className="text-[8px] uppercase tracking-wider text-slate-400 leading-tight">
              Utility Expense (12 Mo)
            </div>
            <MiniLineChart />
            <div className="text-[10px] text-green-400 mt-1">↘ -4.1%</div>
          </div>

          <div
            className="rounded-[10px] p-3 flex flex-col items-center"
            style={{ background: "rgba(30,41,59,0.5)", border: "1px solid rgba(59,130,246,0.15)" }}
          >
            <div className="text-[8px] uppercase tracking-wider text-slate-400 self-start mb-2">
              Equipment Age Score
            </div>
            <div className="w-10 h-10 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
              <span className="text-lg font-bold text-green-400">A</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-2 text-center">Excellent: 8.2/10</div>
          </div>

          <div
            className="rounded-[10px] p-3"
            style={{ background: "rgba(30,41,59,0.5)", border: "1px solid rgba(59,130,246,0.15)" }}
          >
            <div className="text-[8px] uppercase tracking-wider text-slate-400 mb-1">Lease Timeline</div>
            <div className="text-[13px] font-bold text-white mb-2">4.6 Years Remaining</div>
            <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
              <div className="h-full w-[75%] rounded-full bg-blue-500" />
            </div>
            <div className="text-[10px] text-slate-400 mt-1.5">Lease Score: 94/100</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 pt-2 border-t border-slate-700/50">
          <span>📍 Location: Dense Urban</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span>Washers: 32</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span>Dryers: 32</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span>Store Size: 3,600 SF</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span>Vintage: 2019</span>
        </div>
      </div>
    </div>
  );
}
