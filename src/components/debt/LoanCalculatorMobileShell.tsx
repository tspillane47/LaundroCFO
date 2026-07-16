"use client";

import { useState } from "react";
import clsx from "clsx";
import { Calculator, ChevronDown } from "lucide-react";
import { LoanCalculator, type LoanCalculatorProps } from "@/components/debt/LoanCalculator";

export function LoanCalculatorMobileShell(props: LoanCalculatorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="xl:hidden rounded-[var(--card-radius)] overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "0 0 0 1px rgba(56, 189, 248, 0.06), 0 8px 24px rgba(0, 0, 0, 0.18)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-4 min-h-[56px] text-left transition-colors hover:bg-[var(--bg-card2)]/40 active:bg-[var(--bg-card2)]/60"
        aria-expanded={expanded}
      >
        <span
          className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
          style={{
            background: "var(--bg-info-tint)",
            border: "1px solid rgba(56, 189, 248, 0.2)",
            color: "var(--accent-blue)",
          }}
        >
          <Calculator size={18} strokeWidth={2.25} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Loan Calculator
          </span>
          <span className="block text-[12px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
            {expanded ? "Model a new loan against your store's financials" : "Tap to model a new loan"}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={clsx(
            "flex-shrink-0 transition-transform duration-200",
            expanded && "rotate-180"
          )}
          style={{ color: "var(--text-muted)" }}
        />
      </button>

      {expanded && (
        <div
          className="px-4 pb-4 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <LoanCalculator {...props} displayMode="mobile" />
        </div>
      )}
    </div>
  );
}
