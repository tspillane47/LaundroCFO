import { ReactNode } from "react";

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
      className={className ? `card ${className}` : "card"}
      style={{ padding: "24px", minHeight: "110px", minWidth: 0, ...style }}
    >
      <div
        className="metric-label"
        style={{ fontSize: "11px", whiteSpace: "normal", marginBottom: "8px", ...labelStyle }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "22px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: valueColor ?? "var(--text-primary)",
          lineHeight: 1.2,
          overflow: "visible",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "12px", marginTop: "8px", color: "var(--text-muted)" }}>{sub}</div>
      )}
    </div>
  );
}
