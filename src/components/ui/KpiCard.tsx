import { ReactNode } from "react";

type KpiCardProps = {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  valueColor?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function KpiCard({ label, value, sub, valueColor, className, style }: KpiCardProps) {
  return (
    <div className={className ? `card ${className}` : "card"} style={{ padding: "24px", minHeight: "110px", ...style }}>
      <div className="metric-label" style={{ marginBottom: "8px" }}>
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
