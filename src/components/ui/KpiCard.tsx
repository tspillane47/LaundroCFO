import { ReactNode } from "react";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";

function renderKpiLabel(label: ReactNode) {
  if (typeof label === "string") {
    return <DisclaimerLabel>{label}</DisclaimerLabel>;
  }
  return label;
}

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
        {renderKpiLabel(label)}
      </div>
      <div
        className="text-[18px] sm:text-[22px] font-bold tracking-tight"
        style={{
          letterSpacing: "-0.02em",
          color: valueColor ?? "var(--text-primary)",
          lineHeight: 1.2,
          overflow: "visible",
          whiteSpace: "normal",
          wordBreak: "break-word",
          minWidth: 0,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[14px] mt-2" style={{ color: "var(--text-muted)" }}>{sub}</div>
      )}
    </div>
  );
}
