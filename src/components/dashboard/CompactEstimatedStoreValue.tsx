"use client";

import Link from "next/link";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ValueChangeIndicator } from "@/components/ui/ValueChangeIndicator";
import { FinancialDataConfidenceNote } from "@/components/ui/FinancialDataConfidenceNote";
import { MissingMarketRentPrompt } from "@/components/valuation/MissingMarketRentPrompt";

export type CompactEstimatedStoreValueProps = {
  canShowValuation: boolean;
  estimatedValue: number;
  finalMultiple: number;
  ttmMonthsUsed: number;
  missingMarketRent: boolean;
  monthlyChange: number | null;
  yearChangePct: number | null;
};

export function CompactEstimatedStoreValue({
  canShowValuation,
  estimatedValue,
  finalMultiple,
  ttmMonthsUsed,
  missingMarketRent,
  monthlyChange,
  yearChangePct,
}: CompactEstimatedStoreValueProps) {
  return (
    <div className="card" data-testid="dashboard-compact-store-value" style={{ padding: "16px 20px" }}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="metric-label mb-0">Estimated Store Value</div>
        <Link href="/valuation" className="text-[11px] hover:underline" style={{ color: "var(--accent)" }}>
          View →
        </Link>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        {canShowValuation ? (
          <>
            <AnimatedNumber
              value={estimatedValue}
              prefix="$"
              className="text-[22px] font-bold tabular-nums"
              duration={1000}
            />
            <ValueChangeIndicator value={estimatedValue} />
          </>
        ) : (
          <span className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
            —
          </span>
        )}
      </div>
      {canShowValuation && (monthlyChange != null || yearChangePct != null) && (
        <div className="flex flex-wrap gap-2 mt-1.5">
          {monthlyChange != null && (
            <span
              className="text-[11px] font-semibold"
              style={{ color: monthlyChange >= 0 ? "var(--text-success)" : "var(--text-danger)" }}
            >
              {monthlyChange >= 0 ? "+" : ""}
              {fmtDollar(monthlyChange)} this month
            </span>
          )}
          {yearChangePct != null && (
            <span
              className="text-[11px] font-semibold"
              style={{ color: yearChangePct >= 0 ? "var(--text-success)" : "var(--text-danger)" }}
            >
              {yearChangePct >= 0 ? "+" : ""}
              {yearChangePct.toFixed(1)}% vs last year
            </span>
          )}
        </div>
      )}
      <div className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
        {canShowValuation
          ? `${fmtMultiple(finalMultiple)} EBITDA multiple`
          : missingMarketRent
            ? null
            : "Add monthly financials to estimate store value."}
      </div>
      <FinancialDataConfidenceNote monthsUsed={ttmMonthsUsed} variant="compact" className="mt-1" />
      {missingMarketRent && <MissingMarketRentPrompt variant="inline" className="mt-1" />}
    </div>
  );
}
