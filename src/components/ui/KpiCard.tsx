import { ReactNode } from "react";

type KpiCardProps = {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  valueColor?: string;
};

export function KpiCard({ label, value, sub, valueColor }: KpiCardProps) {
  return (
    <div className="card" style={{ padding: "24px", minHeight: "110px" }}>
      <div className="metric-label" style={{ marginBottom: "8px" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: valueColor ?? "var(--text-primary)",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
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
