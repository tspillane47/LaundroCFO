"use client";

import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";
import { DSCR_NO_DEBT_LABEL, getDscrSubtext, getDscrValueColor } from "@/lib/dscr";

type DSCRCardProps = {
  dscr: number | null;
  scheduledAnnualDebtService: number;
  hasFinancialData?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Financials metric row uses plain `.card` without KPI padding. */
  compact?: boolean;
  animate?: boolean;
};

export function DSCRCard({
  dscr,
  scheduledAnnualDebtService,
  hasFinancialData = true,
  className,
  style,
  compact = false,
  animate = true,
}: DSCRCardProps) {
  const hasDebt = scheduledAnnualDebtService > 0;
  const displayOpts = { hasFinancialData, scheduledAnnualDebtService };
  const valueColor = getDscrValueColor(dscr, displayOpts);
  const sub = getDscrSubtext(dscr, displayOpts);

  const valueContent =
    !hasFinancialData ? (
      "—"
    ) : hasDebt && dscr != null ? (
      animate ? (
        <AnimatedNumber value={dscr} decimals={2} suffix="x" duration={1000} />
      ) : (
        `${dscr.toFixed(2)}x`
      )
    ) : (
      <span className="text-green-400">{DSCR_NO_DEBT_LABEL}</span>
    );

  return (
    <div
      className={className ? `card ${className}` : "card"}
      style={
        compact
          ? style
          : { padding: "24px", minHeight: "110px", minWidth: 0, ...style }
      }
    >
      <div
        className="metric-label"
        style={
          compact
            ? undefined
            : { fontSize: "11px", whiteSpace: "normal", marginBottom: "8px" }
        }
      >
        <DisclaimerLabel>DSCR</DisclaimerLabel>
      </div>
      <div
        className={compact ? "metric-value text-[18px] sm:text-[22px] font-bold tracking-tight" : "text-[18px] sm:text-[22px] font-bold tracking-tight"}
        style={{
          letterSpacing: "-0.02em",
          color: valueColor,
          lineHeight: 1.2,
          overflow: "visible",
          whiteSpace: "normal",
          wordBreak: "break-word",
          minWidth: 0,
        }}
      >
        {valueContent}
      </div>
      {sub ? (
        <div
          className={compact ? "text-[12px] mt-1" : "text-[14px] mt-2"}
          style={{ color: "var(--text-muted)" }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}
