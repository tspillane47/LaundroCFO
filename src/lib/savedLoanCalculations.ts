import { fmtDollar } from "@/lib/calculations";
import type { ReverseSolveBindingConstraint } from "@/lib/amortization";

export type LoanCalcMode = "forward" | "reverse";

export type SavedLoanCalculationInputs = {
  calcMode: LoanCalcMode;
  loanAmount: number;
  targetDscr: number;
  maxLtvPercent: number;
  interestRate: number;
  termMonths: number;
  interestOnlyEnabled: boolean;
  interestOnlyMonths: number;
  deferredEnabled: boolean;
  deferredMonths: number;
  isRefinance: boolean;
};

export type SavedLoanCalculationForwardOutputs = {
  calcMode: "forward";
  monthlyPayment: number;
  dscr: number | null;
  businessLtv: number | null;
  annualDebtService: number;
  totalAnnualDebtService: number;
};

export type SavedLoanCalculationReverseOutputs = {
  calcMode: "reverse";
  maxLoanAmount: number;
  dscrBasedMaxLoan: number;
  ltvBasedMaxLoan: number;
  bindingConstraint: ReverseSolveBindingConstraint;
  maxLtvPercent: number;
  resultingDscr: number | null;
};

export type SavedLoanCalculationOutputs =
  | SavedLoanCalculationForwardOutputs
  | SavedLoanCalculationReverseOutputs;

export type SavedLoanCalculationRow = {
  id: string;
  name: string;
  inputs: SavedLoanCalculationInputs;
  outputs: SavedLoanCalculationOutputs;
  created_at: string;
};

export type LoanCalculatorPersistedState = SavedLoanCalculationInputs;

export function buildSavedLoanInputs(
  state: LoanCalculatorPersistedState
): SavedLoanCalculationInputs {
  return { ...state };
}

export function buildSavedLoanForwardOutputs(args: {
  monthlyPayment: number;
  dscr: number | null;
  businessLtv: number | null;
  annualDebtService: number;
  totalAnnualDebtService: number;
}): SavedLoanCalculationForwardOutputs {
  return {
    calcMode: "forward",
    monthlyPayment: args.monthlyPayment,
    dscr: args.dscr,
    businessLtv: args.businessLtv,
    annualDebtService: args.annualDebtService,
    totalAnnualDebtService: args.totalAnnualDebtService,
  };
}

export function buildSavedLoanReverseOutputs(args: {
  maxLoanAmount: number;
  dscrBasedMaxLoan: number;
  ltvBasedMaxLoan: number;
  bindingConstraint: ReverseSolveBindingConstraint;
  maxLtvPercent: number;
  resultingDscr: number | null;
}): SavedLoanCalculationReverseOutputs {
  return {
    calcMode: "reverse",
    maxLoanAmount: args.maxLoanAmount,
    dscrBasedMaxLoan: args.dscrBasedMaxLoan,
    ltvBasedMaxLoan: args.ltvBasedMaxLoan,
    bindingConstraint: args.bindingConstraint,
    maxLtvPercent: args.maxLtvPercent,
    resultingDscr: args.resultingDscr,
  };
}

function formatTermYears(termMonths: number): string {
  return `${Math.round(termMonths / 12)}yr`;
}

function formatBindingConstraint(constraint: ReverseSolveBindingConstraint): string {
  if (constraint === "ltv") return "LTV-limited";
  if (constraint === "dscr") return "DSCR-limited";
  return "unconstrained";
}

export function formatSavedLoanSummaryWithInputs(
  inputs: SavedLoanCalculationInputs,
  outputs: SavedLoanCalculationOutputs
): string {
  if (outputs.calcMode === "forward") {
    const amount = fmtDollar(inputs.loanAmount);
    const rate = `${inputs.interestRate}%`;
    const term = formatTermYears(inputs.termMonths);
    if (outputs.dscr != null) {
      return `${amount} @ ${rate} / ${term} → DSCR ${outputs.dscr.toFixed(2)}x`;
    }
    return `${amount} @ ${rate} / ${term}`;
  }
  return `Max loan ${fmtDollar(outputs.maxLoanAmount)} (${formatBindingConstraint(outputs.bindingConstraint)})`;
}

export function parseSavedLoanInputs(raw: unknown): SavedLoanCalculationInputs | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.calcMode !== "forward" && o.calcMode !== "reverse") return null;
  if (typeof o.interestRate !== "number" || typeof o.termMonths !== "number") return null;
  if (typeof o.interestOnlyEnabled !== "boolean" || typeof o.deferredEnabled !== "boolean") {
    return null;
  }
  if (typeof o.isRefinance !== "boolean") return null;

  return {
    calcMode: o.calcMode,
    loanAmount: typeof o.loanAmount === "number" ? o.loanAmount : 0,
    targetDscr: typeof o.targetDscr === "number" ? o.targetDscr : 1.25,
    maxLtvPercent: typeof o.maxLtvPercent === "number" ? o.maxLtvPercent : 80,
    interestRate: o.interestRate,
    termMonths: o.termMonths,
    interestOnlyEnabled: o.interestOnlyEnabled,
    interestOnlyMonths: typeof o.interestOnlyMonths === "number" ? o.interestOnlyMonths : 0,
    deferredEnabled: o.deferredEnabled,
    deferredMonths: typeof o.deferredMonths === "number" ? o.deferredMonths : 0,
    isRefinance: o.isRefinance,
  };
}

export function savedInputsToCalculatorState(
  inputs: SavedLoanCalculationInputs
): LoanCalculatorPersistedState {
  return { ...inputs };
}
