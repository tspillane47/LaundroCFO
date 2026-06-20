import clsx from "clsx";
import { metricValueStyle } from "@/lib/metricStyles";

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  subColor?: "positive" | "negative" | "warning" | "muted";
  progress?: number;
  progressColor?: string;
  badge?: string;
  badgeColor?: "green" | "red" | "amber" | "blue";
  highlight?: boolean;
}

const badgeClasses = {
  green: "badge-green",
  red: "badge-red",
  amber: "badge-amber",
  blue: "badge-blue",
};

const subColors = {
  positive: "text-green-400",
  negative: "text-red-400",
  warning: "text-amber-400",
  muted: "text-slate-500",
};

export function MetricCard({
  label,
  value,
  sub,
  subColor = "muted",
  progress,
  progressColor = "bg-blue-500",
  badge,
  badgeColor = "green",
  highlight = false,
}: MetricCardProps) {
  return (
    <div className={clsx("card overflow-hidden min-w-[140px]", highlight && "border-blue-500/30")}>
      <div className="metric-label">{label}</div>
      <div className="flex items-center gap-2 min-w-0">
        <div className="metric-value min-w-0" style={metricValueStyle(value)} title={value}>
          {value}
        </div>
        {badge && <span className={clsx("badge shrink-0", badgeClasses[badgeColor])}>{badge}</span>}
      </div>
      {sub && <div className={clsx("text-[12px] mt-1", subColors[subColor])}>{sub}</div>}
      {progress !== undefined && (
        <div className="progress-bar">
          <div
            className={clsx("h-full rounded-full", progressColor)}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function SmallMetric({ label, value, color = "text-slate-100" }: {
  label: string; value: string; color?: string;
}) {
  return (
    <div className="card2 overflow-hidden min-w-[120px]">
      <div className="metric-label">{label}</div>
      <div className={clsx(color)} style={metricValueStyle(value, { base: 18, compact: 15, xs: 13 })} title={value}>
        {value}
      </div>
    </div>
  );
}
