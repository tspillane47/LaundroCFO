export interface LoanInputs {
  currentBalance: number;
  interestRate: number; // annual percentage e.g. 7.5
  monthlyPayment: number;
  loanStartDate?: string;
  lastUpdated?: string; // when current_balance was last manually verified
}

export function calcEstimatedBalance(loan: LoanInputs): number {
  if (!loan.lastUpdated || loan.monthlyPayment <= 0) return loan.currentBalance;

  const monthsSinceUpdate = monthsBetween(new Date(loan.lastUpdated), new Date());
  if (monthsSinceUpdate <= 0) return loan.currentBalance;

  const monthlyRate = (loan.interestRate / 100) / 12;
  let balance = loan.currentBalance;

  for (let i = 0; i < monthsSinceUpdate; i++) {
    const interestPortion = balance * monthlyRate;
    const principalPortion = loan.monthlyPayment - interestPortion;
    balance = Math.max(0, balance - principalPortion);
  }

  return balance;
}

export function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

export function calcRemainingMonths(loan: LoanInputs & { amortizationTermMonths?: number }): number {
  if (loan.amortizationTermMonths && loan.loanStartDate) {
    const elapsed = monthsBetween(new Date(loan.loanStartDate), new Date());
    return Math.max(0, loan.amortizationTermMonths - elapsed);
  }

  // Fallback: calculate from balance, rate, payment
  const monthlyRate = (loan.interestRate / 100) / 12;
  if (monthlyRate === 0 || loan.monthlyPayment <= 0) return 0;
  const balance = loan.currentBalance;
  const n = Math.log(loan.monthlyPayment / (loan.monthlyPayment - balance * monthlyRate)) / Math.log(1 + monthlyRate);
  return Math.max(0, Math.round(n));
}

export function calcPayoffDate(remainingMonths: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + remainingMonths);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ─── Multi-phase loan calculation (deferred → interest-only → amortizing) ───

export type LoanPhaseType = "deferred" | "interest-only" | "amortizing";

export interface MultiPhaseLoanInputs {
  /** Loan principal / amount */
  principal: number;
  /** Annual interest rate as a percentage, e.g. 7.5 */
  annualInterestRate: number;
  /** Total loan term in months */
  termMonths: number;
  /** Months with no payment; interest capitalizes into principal */
  deferredMonths?: number;
  /** Months paying interest only (no principal reduction) */
  interestOnlyMonths?: number;
}

export interface LoanPhaseSummary {
  type: LoanPhaseType;
  months: number;
  monthlyPayment: number;
  startingBalance: number;
  endingBalance: number;
}

export interface MultiPhaseLoanResult {
  phases: LoanPhaseSummary[];
  /** Payment due at loan inception (month 1) */
  month1Payment: number;
  /** Payment once special periods end — amortizing PMT, or IO if no amortizing phase remains */
  stabilizedPayment: number;
  /** Highest scheduled monthly payment across all phases (for conservative DSCR) */
  maxMonthlyPayment: number;
  /** maxMonthlyPayment × 12 */
  annualDebtService: number;
  totalTermMonths: number;
}

function toMonthlyRate(annualInterestRate: number): number {
  return (annualInterestRate / 100) / 12;
}

/** Standard fully-amortizing monthly payment (PMT). Exported for reuse and regression checks. */
export function calcAmortizingMonthlyPayment(
  principal: number,
  annualInterestRate: number,
  termMonths: number
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const monthlyRate = toMonthlyRate(annualInterestRate);
  if (monthlyRate === 0) return principal / termMonths;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return principal * (monthlyRate * factor) / (factor - 1);
}

function calcBalanceAfterDeferred(
  principal: number,
  monthlyRate: number,
  deferredMonths: number
): number {
  if (deferredMonths <= 0 || principal <= 0) return principal;
  if (monthlyRate === 0) return principal;
  return principal * Math.pow(1 + monthlyRate, deferredMonths);
}

function clampPhaseMonths(
  termMonths: number,
  deferredMonths: number,
  interestOnlyMonths: number
): { deferred: number; interestOnly: number; amortizing: number } {
  const term = Math.max(0, Math.floor(termMonths));
  const deferred = Math.min(Math.max(0, Math.floor(deferredMonths)), term);
  const interestOnly = Math.min(Math.max(0, Math.floor(interestOnlyMonths)), term - deferred);
  const amortizing = Math.max(0, term - deferred - interestOnly);
  return { deferred, interestOnly, amortizing };
}

/**
 * Three-phase loan: deferred (capitalize interest) → interest-only → fully amortizing.
 * Phase durations longer than the remaining term are clamped; a zero-month phase is omitted.
 */
export function calcMultiPhaseLoan(inputs: MultiPhaseLoanInputs): MultiPhaseLoanResult {
  const {
    principal,
    annualInterestRate,
    termMonths,
    deferredMonths = 0,
    interestOnlyMonths = 0,
  } = inputs;

  const monthlyRate = toMonthlyRate(annualInterestRate);
  const { deferred, interestOnly, amortizing } = clampPhaseMonths(
    termMonths,
    deferredMonths,
    interestOnlyMonths
  );

  const phases: LoanPhaseSummary[] = [];
  let balance = Math.max(0, principal);

  if (deferred > 0) {
    const startingBalance = balance;
    balance = calcBalanceAfterDeferred(balance, monthlyRate, deferred);
    phases.push({
      type: "deferred",
      months: deferred,
      monthlyPayment: 0,
      startingBalance,
      endingBalance: balance,
    });
  }

  if (interestOnly > 0) {
    const startingBalance = balance;
    const ioPayment = monthlyRate === 0 ? 0 : balance * monthlyRate;
    phases.push({
      type: "interest-only",
      months: interestOnly,
      monthlyPayment: ioPayment,
      startingBalance,
      endingBalance: balance,
    });
  }

  let stabilizedPayment = 0;
  if (amortizing > 0) {
    const startingBalance = balance;
    const payment = calcAmortizingMonthlyPayment(startingBalance, annualInterestRate, amortizing);
    stabilizedPayment = payment;

    let endingBalance = startingBalance;
    if (monthlyRate === 0) {
      endingBalance = Math.max(0, startingBalance - payment * amortizing);
    } else if (payment > 0) {
      const factor = Math.pow(1 + monthlyRate, amortizing);
      endingBalance = Math.max(0, startingBalance * factor - payment * (factor - 1) / monthlyRate);
    }

    phases.push({
      type: "amortizing",
      months: amortizing,
      monthlyPayment: payment,
      startingBalance,
      endingBalance,
    });
  } else if (interestOnly > 0) {
    stabilizedPayment = phases.find((p) => p.type === "interest-only")?.monthlyPayment ?? 0;
  }

  const month1Payment = phases[0]?.monthlyPayment ?? 0;
  const maxMonthlyPayment = phases.reduce((max, p) => Math.max(max, p.monthlyPayment), 0);

  return {
    phases,
    month1Payment,
    stabilizedPayment,
    maxMonthlyPayment,
    annualDebtService: maxMonthlyPayment * 12,
    totalTermMonths: deferred + interestOnly + amortizing,
  };
}

export function generatePayoffSchedule(loan: LoanInputs, months: number = 24): { month: string; balance: number }[] {
  const monthlyRate = (loan.interestRate / 100) / 12;
  let balance = calcEstimatedBalance(loan);
  const schedule: { month: string; balance: number }[] = [];
  const startDate = new Date();

  for (let i = 0; i <= months; i++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + i);
    schedule.push({
      month: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      balance: Math.round(balance),
    });
    if (loan.monthlyPayment > 0) {
      const interestPortion = balance * monthlyRate;
      const principalPortion = loan.monthlyPayment - interestPortion;
      balance = Math.max(0, balance - principalPortion);
    }
  }

  return schedule;
}
