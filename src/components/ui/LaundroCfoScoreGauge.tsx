"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  formatNetworkScoreHint,
  scoreArcColor,
  type LaundroCfoScoreResult,
} from "@/lib/laundroCfoScore";

const CATEGORY_LABELS: Record<keyof LaundroCfoScoreResult["categories"], string> = {
  financialPerformance: "Financial Performance",
  debtCoverage: "Debt & Coverage",
  assetQuality: "Asset Quality",
  profileCompleteness: "Profile Completeness",
};

type ArcGaugeProps = {
  score: number;
  grade: string;
  size?: number;
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

export function LaundroCfoScoreGauge({ score, grade, size = 200 }: ArcGaugeProps) {
  const strokeWidth = 14;
  const cx = size / 2;
  const cy = size * 0.58;
  const radius = size * 0.38;
  const arcPath = describeArc(cx, cy, radius, 0, 180);
  const arcLength = Math.PI * radius;
  const fillOffset = arcLength - (Math.min(100, Math.max(0, score)) / 100) * arcLength;
  const color = scoreArcColor(score);

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
      </svg>
      <div
        className="flex flex-col items-center"
        style={{ marginTop: -(size * 0.22) }}
      >
        <div
          className="font-bold text-slate-100 leading-none"
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

  return (
    <div className={`card ${className}`}>
      <div className="metric-label mb-3">LaundroCFO Score</div>

      <div className="flex flex-col items-center">
        <LaundroCfoScoreGauge score={result.total} grade={result.grade} size={gaugeSize} />

        <p className="text-[11px] text-slate-600 mt-1 mb-4">
          {formatNetworkScoreHint(contributorCount)}
        </p>
      </div>

      <div className="space-y-2.5">
        {(Object.entries(result.categories) as [keyof LaundroCfoScoreResult["categories"], LaundroCfoScoreResult["categories"][keyof LaundroCfoScoreResult["categories"]]][]).map(
          ([key, cat]) => {
            const pct = cat.max > 0 ? (cat.score / cat.max) * 100 : 0;
            return (
              <div key={key}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">{CATEGORY_LABELS[key]}</span>
                  <span className="text-slate-300 font-medium">
                    {cat.score}/{cat.max}
                  </span>
                </div>
                <div className="progress-bar" style={{ marginTop: 0 }}>
                  <div
                    className="h-full rounded-full bg-blue-500/70 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          }
        )}
      </div>

      {result.improvementTips.length > 0 ? (
        <ul className="mt-4 pt-3 border-t border-white/[0.05] space-y-1.5">
          {result.improvementTips.map((tip) => (
            <li key={tip} className="text-[11px] text-slate-500 flex gap-2">
              <span className="text-slate-600 shrink-0">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
