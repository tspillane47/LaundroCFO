import clsx from "clsx";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";

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
  muted: "text-[var(--text-muted)]",
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
    <div className={clsx("card", highlight && "border-blue-500/30")}>
      <div className="metric-label">
        <DisclaimerLabel>{label}</DisclaimerLabel>
      </div>
      <div className="flex items-center gap-2">
        <div className="metric-value">{value}</div>
        {badge && <span className={clsx("badge", badgeClasses[badgeColor])}>{badge}</span>}
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

export function SmallMetric({ label, value, color = "text-slate-900" }: {
  label: string; value: string; color?: string;
}) {
  return (
    <div className="card2">
      <div className="metric-label">
        <DisclaimerLabel>{label}</DisclaimerLabel>
      </div>
      <div className={clsx("text-lg font-bold", color)}>{value}</div>
    </div>
  );
}
