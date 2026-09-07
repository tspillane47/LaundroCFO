"use client";

import type { ReactNode } from "react";
import { Landmark } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { LiveFromBankBadge } from "@/components/ui/CashPositionIndicator";
import { KpiCard } from "@/components/ui/KpiCard";

export const MANUAL_CASH_SUBTEXT = "Operating + reserve + petty (entered)";

type BankBalancesPanelProps = {
  cashOnHand: number;
  creditCardDebt?: number;
  cashSub: string;
  creditSub?: string;
  className?: string;
  isLiveFromBank?: boolean;
  hasFinancialData?: boolean;
  children?: ReactNode;
};

const bankCardStyle = {
  background: "rgba(15, 23, 42, 0.35)",
  border: "1px solid rgba(56, 189, 248, 0.18)",
};

export function BankBalancesPanel({
  cashOnHand,
  creditCardDebt,
  cashSub,
  creditSub,
  className,
  isLiveFromBank = true,
  hasFinancialData = true,
  children,
}: BankBalancesPanelProps) {
  const showCredit = typeof creditCardDebt === "number" && Boolean(creditSub);
  const cashLabel = isLiveFromBank ? "Cash on Hand" : "Cash Position";

  return (
    <div
      className={className}
      data-testid="dashboard-bank-balances"
      style={{
        background: "rgba(56, 189, 248, 0.06)",
        border: "1px solid rgba(56, 189, 248, 0.22)",
        borderRadius: "12px",
        padding: "16px",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Landmark size={16} style={{ color: "#38bdf8" }} aria-hidden />
        <div className="section-title mb-0">Bank Balances</div>
      </div>
      <div className="metric-grid">
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={bankCardStyle}
          label={
            <span className="inline-flex flex-wrap items-center gap-2">
              {cashLabel}
              {isLiveFromBank && <LiveFromBankBadge />}
            </span>
          }
          value={
            hasFinancialData ? (
              <AnimatedNumber value={cashOnHand} prefix="$" duration={1000} />
            ) : (
              "—"
            )
          }
          sub={cashSub}
        />
        {showCredit && (
          <KpiCard
            className="kpi-fade-in kpi-glow-card"
            style={bankCardStyle}
            label={
              <span className="inline-flex flex-wrap items-center gap-2">
                Credit Card Debt
                <LiveFromBankBadge />
              </span>
            }
            value={<AnimatedNumber value={creditCardDebt} prefix="$" duration={1000} />}
            sub={creditSub}
          />
        )}
      </div>
      {children}
    </div>
  );
}
