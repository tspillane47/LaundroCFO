"use client";

import { LoanCalculator, type LoanCalculatorProps } from "@/components/debt/LoanCalculator";

/**
 * Sticky desktop panel for the loan calculator.
 *
 * Height budget (desktop): 100vh − header (3rem) − page padding top/bottom (3rem) − sticky offset (1rem) = 7rem
 * Overflow lives on the inner wrapper — never on the sticky element itself (breaks independent scroll).
 */
export function LoanCalculatorPanel(props: LoanCalculatorProps) {
  return (
    <aside
      className="hidden xl:block xl:sticky xl:top-4 xl:self-start xl:h-[calc(100vh-7rem)]"
      aria-label="Loan calculator"
    >
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <LoanCalculator {...props} displayMode="panel" />
      </div>
    </aside>
  );
}
