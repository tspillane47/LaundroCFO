"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  formatNetworkScoreHint,
  formatPotentialScoreNote,
  scoreArcColor,
  type LaundroCfoScoreMetric,
  type LaundroCfoScoreResult,
} from "@/lib/laundroCfoScore";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";

type ArcGaugeProps = {
  score: number;
  grade: string;
  size?: number;
  potentialScore?: number | null;
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function LaundroCfoScoreGauge({ score, grade, size = 200, potentialScore = null }: ArcGaugeProps) {
  const strokeWidth = 14;
  const cx = size / 2;
  const cy = size * 0.58;
  const radius = size * 0.38;
  const arcPath = describeArc(cx, cy, radius, 0, 180);
  const arcLength = Math.PI * radius;
  const clampedScore = Math.min(100, Math.max(0, score));
  const fillOffset = arcLength - (clampedScore / 100) * arcLength;
  const color = scoreArcColor(score);
  const needleAngle = (clampedScore / 100) * 180;
  const needleRotation = needleAngle - 180;
  const needleLength = radius * 0.92;
  const [mounted, setMounted] = useState(false);
  const [animatedRotation, setAnimatedRotation] = useState(-180);

  useEffect(() => {
    setMounted(false);
    setAnimatedRotation(-180);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMounted(true);
        setAnimatedRotation(needleRotation);
      });
    });
    return () => cancelAnimationFrame(t);
  }, [needleRotation]);

  const potentialNote = formatPotentialScoreNote(
    potentialScore != null && potentialScore > score ? potentialScore : null
  );

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg
        width={size}
        height={size * 0.62}
        viewBox={`0 0 ${size} ${size * 0.62}`}
        aria-hidden
      >
        <path
          d={arcPath}
          fill="none"
          stroke="rgba(148, 163, 184, 0.15)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={fillOffset}
          style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.3s ease" }}
        />
        <g
          style={{
            transform: `rotate(${animatedRotation}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: mounted ? "transform 1.2s cubic-bezier(0.34, 1.2, 0.64, 1)" : "none",
          }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={cx + needleLength}
            y2={cy}
            strokeWidth={2.5}
            strokeLinecap="round"
            stroke="var(--text-primary, #0f172a)"
            style={{ filter: "drop-shadow(0 0 3px rgba(148,163,184,0.5))" }}
          />
          <circle cx={cx} cy={cy} r={5} fill="var(--text-primary, #0f172a)" />
        </g>
      </svg>
      <div
        className="flex flex-col items-center"
        style={{ marginTop: -(size * 0.22) }}
      >
        <div
          className="font-bold text-adaptive-primary leading-none"
          style={{ fontSize: size * 0.22 }}
        >
          {score}
        </div>
        <div
          className="font-semibold mt-1"
          style={{ fontSize: size * 0.11, color }}
        >
          {grade}
        </div>
        {potentialNote ? (
          <p className="text-[10px] text-adaptive-muted mt-1.5 text-center max-w-[160px] leading-snug">
            {potentialNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type LaundroCfoScoreCardProps = {
  result: LaundroCfoScoreResult;
  className?: string;
  compact?: boolean;
};

export function LaundroCfoScoreCard({ result, className = "", compact = false }: LaundroCfoScoreCardProps) {
  const supabase = createClient();
  const [contributorCount, setContributorCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadContributorCount() {
      const { data, error } = await supabase.rpc("get_network_benchmark_contributor_count");
      if (!cancelled && !error && typeof data === "number") {
        setContributorCount(data);
      }
    }

    loadContributorCount();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const gaugeSize = compact ? 160 : 200;
  const metricRows = Object.values(result.metrics) as LaundroCfoScoreMetric[];

  return (
    <div className={`card ${className}`}>
      <div className="metric-label mb-3">
        <DisclaimerLabel>LaundroCFO Score</DisclaimerLabel>
      </div>

      <div className="flex flex-col items-center">
        <LaundroCfoScoreGauge
          score={result.total}
          grade={result.grade}
          size={gaugeSize}
          potentialScore={result.potentialScore}
        />

        <p className="text-[11px] text-adaptive-muted mt-1 mb-4">
          {formatNetworkScoreHint(contributorCount)}
          {result.metricsIncluded < result.metricsTotal
            ? ` · ${result.metricsIncluded}/${result.metricsTotal} metrics scored`
            : null}
        </p>
      </div>

      <div className="space-y-2.5">
        {metricRows.map((metric) => {
          const pct = metric.included && metric.points != null ? metric.points : 0;
          const weightPct = Math.round(metric.weight * 100);
          return (
            <div key={metric.label}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-adaptive-muted">{metric.label}</span>
                <span className="text-adaptive-secondary font-medium">
                  {metric.included && metric.points != null
                    ? `${metric.points} pts · ${weightPct}%`
                    : "—"}
                </span>
              </div>
              <div className="progress-bar" style={{ marginTop: 0 }}>
                <div
                  className="h-full rounded-full bg-blue-500/70 transition-all duration-500"
                  style={{ width: `${pct}%`, opacity: metric.included ? 1 : 0.25 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {result.improvementTips.length > 0 ? (
        <ul className="mt-4 pt-3 border-t border-white/[0.05] space-y-1.5">
          {result.improvementTips.map((tip) => (
            <li key={tip} className="text-[11px] text-adaptive-muted flex gap-2">
              <span className="text-adaptive-muted shrink-0">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
