"use client";

import { LoanCalculator, type LoanCalculatorProps } from "@/components/debt/LoanCalculator";

export function LoanCalculatorPanel(props: LoanCalculatorProps) {
  return (
    <aside
      className="hidden xl:block xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:overscroll-contain"
      aria-label="Loan calculator"
    >
      <LoanCalculator {...props} displayMode="panel" />
    </aside>
  );
}
