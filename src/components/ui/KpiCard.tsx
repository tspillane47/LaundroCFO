import { ReactNode } from "react";
import { MetricValue } from "@/components/ui/MetricValue";

type KpiCardProps = {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  valueColor?: string;
  className?: string;
  style?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
};

export function KpiCard({ label, value, sub, valueColor, className, style, labelStyle }: KpiCardProps) {
  return (
    <div
      className={className ? `card overflow-hidden min-w-[140px] ${className}` : "card overflow-hidden min-w-[140px]"}
      style={{ padding: "24px", minHeight: "110px", ...style }}
    >
      <div
        className="metric-label"
        style={{ fontSize: "11px", whiteSpace: "normal", marginBottom: "8px", ...labelStyle }}
      >
        {label}
      </div>
      <MetricValue color={valueColor}>{value}</MetricValue>
      {sub && (
        <div style={{ fontSize: "12px", marginTop: "8px", color: "var(--text-muted)" }}>{sub}</div>
      )}
    </div>
  );
}
