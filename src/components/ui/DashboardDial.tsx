"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

export type ColorZone = { start: number; end: number; color: string; darkGlow: string };

export type LetterGrade = "A" | "B" | "C" | "D";

export const GRADE_COLORS: Record<LetterGrade, { bg: string; text: string; darkBg: string }> = {
  A: { bg: "bg-emerald-500", text: "text-white", darkBg: "dark:bg-emerald-400" },
  B: { bg: "bg-blue-500", text: "text-white", darkBg: "dark:bg-blue-400" },
  C: { bg: "bg-amber-500", text: "text-white", darkBg: "dark:bg-amber-400" },
  D: { bg: "bg-red-500", text: "text-white", darkBg: "dark:bg-red-400" },
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function valueToAngle(value: number, min: number, max: number): number {
  const pct = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  return pct * 180;
}

export function zoneLetterGrade(
  value: number,
  redEnd: number,
  yellowEnd: number,
  max: number
): LetterGrade {
  if (value >= yellowEnd) {
    const span = max - yellowEnd;
    const pos = span > 0 ? (value - yellowEnd) / span : 1;
    return pos >= 0.5 ? "A" : "B";
  }
  if (value >= redEnd) return "C";
  return "D";
}

function getZoneColor(value: number, zones: ColorZone[]): { color: string; glow: string } {
  for (const z of zones) {
    if (value >= z.start && value <= z.end) return { color: z.color, glow: z.darkGlow };
  }
  const last = zones[zones.length - 1];
  return { color: last?.color ?? "#22c55e", glow: last?.darkGlow ?? "rgba(34,197,94,0.6)" };
}

export type DashboardDialProps = {
  label: React.ReactNode;
  value: number | null;
  displayValue: string;
  min: number;
  max: number;
  zones: ColorZone[];
  grade?: LetterGrade | string | null;
  worstLabel: string;
  medianLabel: string;
  bestLabel: string;
  redEnd: number;
  yellowEnd: number;
  compact?: boolean;
  potentialScore?: number | null;
};

export function DashboardDial({
  label,
  value,
  displayValue,
  min,
  max,
  zones,
  grade,
  worstLabel,
  medianLabel,
  bestLabel,
  redEnd,
  yellowEnd,
  compact = false,
  potentialScore = null,
}: DashboardDialProps) {
  const size = compact ? 200 : 260;
  const cx = size / 2;
  const cy = size * 0.58;
  const radius = size * 0.38;
  const strokeWidth = compact ? 12 : 16;
  const hasData = value != null;
  const targetAngle = hasData ? valueToAngle(value, min, max) : 0;
  const [needleAngle, setNeedleAngle] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(false);
    setNeedleAngle(0);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMounted(true);
        setNeedleAngle(targetAngle);
      });
    });
    return () => cancelAnimationFrame(t);
  }, [targetAngle]);

  const needleLength = radius * 0.92;
  const zoneGlow = hasData ? getZoneColor(value, zones) : { color: "#64748b", glow: "rgba(100,116,139,0.4)" };
  const displayGrade =
    grade ?? (hasData ? zoneLetterGrade(value!, redEnd, yellowEnd, max) : null);
  const needleRotation = needleAngle - 180;

  const zoneArcs = zones.map((z) => {
    const startAngle = valueToAngle(z.start, min, max);
    const endAngle = valueToAngle(z.end, min, max);
    if (endAngle <= startAngle) return null;
    return (
      <path
        key={`${z.start}-${z.end}`}
        d={describeArc(cx, cy, radius, startAngle, endAngle)}
        fill="none"
        stroke={hasData ? z.color : "#cbd5e1"}
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        className={clsx(hasData && "dark:[filter:drop-shadow(0_0_6px_currentColor)]")}
        style={{ opacity: hasData ? 1 : 0.35 }}
      />
    );
  });

  return (
    <div
      className={clsx(
        "rounded-2xl border flex flex-col items-center transition-colors",
        compact ? "p-3" : "p-5",
        "bg-white border-slate-200",
        "dark:bg-[#111827] dark:border-slate-700/60",
        !hasData && "opacity-60"
      )}
    >
      <div className="text-[13px] font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400 mb-1 text-center whitespace-nowrap">
        {label}
      </div>

      <div className="relative w-full flex justify-center" style={{ height: size * 0.62 }}>
        <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`} aria-hidden>
          <path
            d={describeArc(cx, cy, radius, 0, 180)}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-100 dark:text-slate-800/80"
            strokeLinecap="round"
          />
          {zoneArcs}
          {hasData && (
            <g
              style={{
                transform: `rotate(${needleRotation}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
                transition: mounted ? "transform 1.2s cubic-bezier(0.34, 1.2, 0.64, 1)" : "none",
              }}
            >
              <line
                x1={cx}
                y1={cy}
                x2={cx + needleLength}
                y2={cy}
                strokeWidth={3}
                strokeLinecap="round"
                className="stroke-slate-800 dark:stroke-white"
                style={{ filter: `drop-shadow(0 0 4px ${zoneGlow.glow})` }}
              />
              <circle cx={cx} cy={cy} r={6} className="fill-slate-800 dark:fill-white" />
            </g>
          )}
        </svg>

        <div
          className="absolute flex flex-col items-center"
          style={{ bottom: size * 0.08, left: "50%", transform: "translateX(-50%)" }}
        >
          {hasData ? (
            <>
              <div
                className={clsx(
                  "font-bold leading-none text-slate-900 dark:text-white tabular-nums whitespace-nowrap",
                  compact ? "text-[24px]" : "text-[32px]"
                )}
              >
                {displayValue}
              </div>
              {displayGrade && (
                <div
                  className={clsx(
                    "mt-2 rounded-full flex items-center justify-center font-bold",
                    compact ? "w-7 h-7 text-[13px]" : "w-9 h-9 text-[15px]",
                    displayGrade in GRADE_COLORS
                      ? [
                          GRADE_COLORS[displayGrade as LetterGrade].bg,
                          GRADE_COLORS[displayGrade as LetterGrade].darkBg,
                          GRADE_COLORS[displayGrade as LetterGrade].text,
                        ]
                      : ["bg-slate-600", "dark:bg-slate-500", "text-white"]
                  )}
                >
                  {displayGrade}
                </div>
              )}
              {potentialScore != null && potentialScore > (value ?? 0) && (
                <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 text-center max-w-[140px] leading-snug">
                  Your score could reach {potentialScore} with complete data
                </p>
              )}
            </>
          ) : (
            <div className="text-[14px] font-medium text-slate-400 dark:text-slate-500 italic">Add data</div>
          )}
        </div>
      </div>

      <div className="w-full flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1">
        <span className="text-left max-w-[80px] leading-tight">{worstLabel}</span>
        <span className="text-center">{medianLabel}</span>
        <span className="text-right max-w-[80px] leading-tight">{bestLabel}</span>
      </div>
    </div>
  );
}
