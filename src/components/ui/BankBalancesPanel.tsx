"use client";

import { Landmark } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { KpiCard } from "@/components/ui/KpiCard";

export const MANUAL_CASH_SUBTEXT = "Operating + reserve + petty (entered)";

function LiveFromBankBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: "rgba(56, 189, 248, 0.18)",
        color: "#38bdf8",
        border: "1px solid rgba(56, 189, 248, 0.35)",
      }}
    >
      Live from Bank
    </span>
  );
}

type BankBalancesPanelProps = {
  cashOnHand: number;
  creditCardDebt: number;
  cashSub: string;
  creditSub: string;
  className?: string;
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
}: BankBalancesPanelProps) {
  return (
    <div
      className={className}
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
              Cash on Hand
              <LiveFromBankBadge />
            </span>
          }
          value={<AnimatedNumber value={cashOnHand} prefix="$" duration={1000} />}
          sub={cashSub}
        />
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
      </div>
    </div>
  );
}
