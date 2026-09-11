export interface LoanInputs {
  currentBalance: number;
  interestRate: number; // annual percentage e.g. 7.5
  monthlyPayment: number;
  loanStartDate?: string;
  /** Day of month the payment actually hits (1–31). Clamped to each month's last day. */
  paymentDueDay?: number | null;
  lastUpdated?: string; // when current_balance was last manually verified
}

/** Local calendar date (year/month/day only). ISO `YYYY-MM-DD` is parsed as local, not UTC. */
export function calendarDate(input: Date | string): Date {
  if (typeof input === "string") {
    const isoDate = input.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      const [year, month, day] = isoDate.split("-").map(Number);
      return new Date(year, month - 1, day);
    }
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

/** Payment date in a given month; day 31 in February becomes the 28th/29th. */
export function paymentDateOn(year: number, monthIndex: number, dueDay: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const day = Math.min(Math.max(1, Math.floor(dueDay)), lastDay);
  return new Date(year, monthIndex, day);
}

/**
 * Day of month to use for payment timing: explicit paymentDueDay, else start-date day, else 1.
 */
export function paymentDueDayFromLoan(loan: {
  paymentDueDay?: number | null;
  loanStartDate?: string | null;
}): number {
  const explicit = Number(loan.paymentDueDay);
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 31) return explicit;
  if (loan.loanStartDate) {
    const day = calendarDate(loan.loanStartDate).getDate();
    if (day >= 1 && day <= 31) return day;
  }
  return 1;
}

/** Next due date strictly after `asOf` (same calendar day does not count as upcoming). */
export function nextPaymentDate(asOf: Date | string, dueDay: number): Date {
  const from = calendarDate(asOf);
  const thisMonth = paymentDateOn(from.getFullYear(), from.getMonth(), dueDay);
  if (thisMonth.getTime() > from.getTime()) return thisMonth;
  const nextMonth = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  return paymentDateOn(nextMonth.getFullYear(), nextMonth.getMonth(), dueDay);
}

/**
 * Count due dates strictly after `lastUpdated` and on or before `asOf`.
 * A payment on the last-verified calendar day is treated as already in current_balance.
 */
export function countElapsedPayments(
  lastUpdated: Date | string,
  asOf: Date | string,
  dueDay: number
): number {
  const from = calendarDate(lastUpdated);
  const to = calendarDate(asOf);
  if (to.getTime() <= from.getTime()) return 0;

  let count = 0;
  let year = from.getFullYear();
  let month = from.getMonth();
  for (let i = 0; i < 600; i++) {
    const due = paymentDateOn(year, month, dueDay);
    if (due.getTime() > to.getTime()) break;
    if (due.getTime() > from.getTime()) count += 1;
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return count;
}

function applyOnePayment(balance: number, interestRate: number, monthlyPayment: number): number {
  if (monthlyPayment <= 0) return Math.max(0, balance);
  const monthlyRate = (interestRate / 100) / 12;
  const interestPortion = balance * monthlyRate;
  const principalPortion = monthlyPayment - interestPortion;
  return Math.max(0, balance - principalPortion);
}

export function calcEstimatedBalance(loan: LoanInputs, asOf: Date = new Date()): number {
  if (!loan.lastUpdated || loan.monthlyPayment <= 0) return loan.currentBalance;

  const dueDay = paymentDueDayFromLoan(loan);
  const paymentsDue = countElapsedPayments(loan.lastUpdated, asOf, dueDay);
  if (paymentsDue <= 0) return loan.currentBalance;

  let balance = loan.currentBalance;
  for (let i = 0; i < paymentsDue; i++) {
    balance = applyOnePayment(balance, loan.interestRate, loan.monthlyPayment);
  }

  return balance;
}

export function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

export function calcRemainingMonths(
  loan: LoanInputs & { amortizationTermMonths?: number }
): number | null {
  if (loan.amortizationTermMonths && loan.loanStartDate) {
    const elapsed = monthsBetween(new Date(loan.loanStartDate), new Date());
    return Math.max(0, loan.amortizationTermMonths - elapsed);
  }

  // Fallback: calculate from balance, rate, payment
  const monthlyRate = (loan.interestRate / 100) / 12;
  if (monthlyRate === 0 || loan.monthlyPayment <= 0) return 0;
  const balance = loan.currentBalance;
  const interestDue = balance * monthlyRate;
  if (loan.monthlyPayment <= interestDue) return null;
  const n =
    Math.log(loan.monthlyPayment / (loan.monthlyPayment - interestDue)) /
    Math.log(1 + monthlyRate);
  if (!Number.isFinite(n)) return null;
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

// ─── Reverse-solve: target DSCR / LTV → maximum loan amount ───

/** Default max LTV for business/collateral-backed lending (matches calculator warning threshold). */
export const DEFAULT_MAX_LTV_PERCENT = 80;

export type ReverseSolveBindingConstraint = "dscr" | "ltv" | "none";

export interface ReverseSolveLoanInputs {
  targetDscr: number;
  annualEbitda: number;
  existingAnnualDebtService: number;
  /** When true, existing debt is excluded from DSCR (refinance). */
  isRefinance?: boolean;
  annualInterestRate: number;
  termMonths: number;
  deferredMonths?: number;
  interestOnlyMonths?: number;
  businessValue: number;
  realEstateValue?: number;
  isOwnerOccupied?: boolean;
  /** Max LTV as a percentage, e.g. 80 for 80%. */
  maxLtvPercent?: number;
}

export interface ReverseSolveLoanResult {
  maxLoanAmount: number;
  dscrBasedMaxLoan: number;
  ltvBasedMaxLoan: number;
  bindingConstraint: ReverseSolveBindingConstraint;
  /** Monthly payment budget derived from target DSCR (0 when no room for new debt). */
  targetMaxMonthlyPayment: number;
  requiredNewAnnualDebtService: number;
  /** True when existing obligations already meet or exceed the target DSCR. */
  dscrAlreadyExceeded: boolean;
  /** True when zero-interest IO-only structure cannot bound principal by payment alone. */
  zeroRateUnbounded: boolean;
  collateralValue: number;
  maxLtvPercent: number;
}

/**
 * Balance at the start of the amortizing phase given a target fully-amortizing payment.
 * Inverse of calcAmortizingMonthlyPayment: B = PMT × (1 − (1+r)^−n) / r.
 */
export function calcBalanceFromAmortizingPayment(
  targetPayment: number,
  annualInterestRate: number,
  amortizingMonths: number
): number {
  if (targetPayment <= 0 || amortizingMonths <= 0) return 0;
  const monthlyRate = toMonthlyRate(annualInterestRate);
  if (monthlyRate === 0) return targetPayment * amortizingMonths;
  const discountFactor = 1 - Math.pow(1 + monthlyRate, -amortizingMonths);
  return targetPayment * discountFactor / monthlyRate;
}

/**
 * Reverse multi-phase loan: given a target stabilized (amortizing) monthly payment,
 * solve for the original principal before deferred capitalization.
 */
export function calcPrincipalFromTargetStabilizedPayment(
  targetPayment: number,
  annualInterestRate: number,
  termMonths: number,
  deferredMonths = 0,
  interestOnlyMonths = 0
): { principal: number; zeroRateUnbounded: boolean } {
  if (targetPayment <= 0) return { principal: 0, zeroRateUnbounded: false };

  const monthlyRate = toMonthlyRate(annualInterestRate);
  const { deferred, interestOnly, amortizing } = clampPhaseMonths(
    termMonths,
    deferredMonths,
    interestOnlyMonths
  );

  if (amortizing > 0) {
    const balanceAtAmortStart = calcBalanceFromAmortizingPayment(
      targetPayment,
      annualInterestRate,
      amortizing
    );
    if (deferred <= 0 || monthlyRate === 0) {
      return { principal: balanceAtAmortStart, zeroRateUnbounded: false };
    }
    return {
      principal: balanceAtAmortStart / Math.pow(1 + monthlyRate, deferred),
      zeroRateUnbounded: false,
    };
  }

  // Entire remaining term is interest-only (possibly after deferred) — payment = balance × r.
  if (monthlyRate === 0) {
    return { principal: 0, zeroRateUnbounded: true };
  }

  const balanceAfterDeferred = targetPayment / monthlyRate;
  if (deferred <= 0) {
    return { principal: balanceAfterDeferred, zeroRateUnbounded: false };
  }
  return {
    principal: balanceAfterDeferred / Math.pow(1 + monthlyRate, deferred),
    zeroRateUnbounded: false,
  };
}

/** Max new loan principal from an LTV cap against collateral value. */
export function calcMaxLoanFromLtv(
  businessValue: number,
  options: {
    realEstateValue?: number;
    isOwnerOccupied?: boolean;
    maxLtvPercent?: number;
  } = {}
): { maxLoan: number; collateralValue: number; maxLtvPercent: number } {
  const maxLtvPercent = options.maxLtvPercent ?? DEFAULT_MAX_LTV_PERCENT;
  const realEstateValue = options.realEstateValue ?? 0;
  const collateralValue =
    options.isOwnerOccupied && realEstateValue > 0
      ? businessValue + realEstateValue
      : businessValue;

  if (collateralValue <= 0 || maxLtvPercent <= 0) {
    return { maxLoan: 0, collateralValue, maxLtvPercent };
  }

  return {
    maxLoan: collateralValue * (maxLtvPercent / 100),
    collateralValue,
    maxLtvPercent,
  };
}

/**
 * Reverse-solve maximum loan amount from target DSCR and LTV constraints.
 * Returns the more conservative (lower) of the two caps and identifies the binding constraint.
 */
export function calcReverseSolveLoan(inputs: ReverseSolveLoanInputs): ReverseSolveLoanResult {
  const {
    targetDscr,
    annualEbitda,
    existingAnnualDebtService,
    isRefinance = false,
    annualInterestRate,
    termMonths,
    deferredMonths = 0,
    interestOnlyMonths = 0,
    businessValue,
    realEstateValue = 0,
    isOwnerOccupied = false,
    maxLtvPercent = DEFAULT_MAX_LTV_PERCENT,
  } = inputs;

  const effectiveExisting = isRefinance ? 0 : existingAnnualDebtService;
  const requiredTotalAnnualDebtService =
    targetDscr > 0 && annualEbitda > 0 ? annualEbitda / targetDscr : 0;
  const requiredNewAnnualDebtService = requiredTotalAnnualDebtService - effectiveExisting;
  const dscrAlreadyExceeded = requiredNewAnnualDebtService <= 0;

  let dscrBasedMaxLoan = 0;
  let targetMaxMonthlyPayment = 0;
  let zeroRateUnbounded = false;

  if (!dscrAlreadyExceeded) {
    targetMaxMonthlyPayment = requiredNewAnnualDebtService / 12;
    const solved = calcPrincipalFromTargetStabilizedPayment(
      targetMaxMonthlyPayment,
      annualInterestRate,
      termMonths,
      deferredMonths,
      interestOnlyMonths
    );
    dscrBasedMaxLoan = Math.max(0, solved.principal);
    zeroRateUnbounded = solved.zeroRateUnbounded;
  }

  const ltvResult = calcMaxLoanFromLtv(businessValue, {
    realEstateValue,
    isOwnerOccupied,
    maxLtvPercent,
  });
  const ltvBasedMaxLoan = ltvResult.maxLoan;

  let bindingConstraint: ReverseSolveBindingConstraint = "none";
  let maxLoanAmount = 0;

  if (dscrAlreadyExceeded && ltvBasedMaxLoan <= 0) {
    bindingConstraint = "none";
    maxLoanAmount = 0;
  } else if (dscrAlreadyExceeded) {
    bindingConstraint = "ltv";
    maxLoanAmount = ltvBasedMaxLoan;
  } else if (zeroRateUnbounded && ltvBasedMaxLoan > 0) {
    bindingConstraint = "ltv";
    maxLoanAmount = ltvBasedMaxLoan;
  } else if (ltvBasedMaxLoan <= 0) {
    bindingConstraint = "dscr";
    maxLoanAmount = dscrBasedMaxLoan;
  } else if (dscrBasedMaxLoan <= ltvBasedMaxLoan) {
    bindingConstraint = "dscr";
    maxLoanAmount = dscrBasedMaxLoan;
  } else {
    bindingConstraint = "ltv";
    maxLoanAmount = ltvBasedMaxLoan;
  }

  return {
    maxLoanAmount,
    dscrBasedMaxLoan,
    ltvBasedMaxLoan,
    bindingConstraint,
    targetMaxMonthlyPayment,
    requiredNewAnnualDebtService,
    dscrAlreadyExceeded,
    zeroRateUnbounded,
    collateralValue: ltvResult.collateralValue,
    maxLtvPercent: ltvResult.maxLtvPercent,
  };
}

function formatPaymentChartLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

export function generatePayoffSchedule(
  loan: LoanInputs,
  months: number = 24,
  asOf: Date = new Date()
): { month: string; balance: number }[] {
  const dueDay = paymentDueDayFromLoan(loan);
  let balance = calcEstimatedBalance(loan, asOf);
  const schedule: { month: string; balance: number }[] = [];
  const startDate = calendarDate(asOf);

  schedule.push({
    month: formatPaymentChartLabel(startDate),
    balance: Math.round(balance),
  });

  let paymentOn = nextPaymentDate(startDate, dueDay);
  for (let i = 0; i < months; i++) {
    if (loan.monthlyPayment > 0) {
      balance = applyOnePayment(balance, loan.interestRate, loan.monthlyPayment);
    }
    schedule.push({
      month: formatPaymentChartLabel(paymentOn),
      balance: Math.round(balance),
    });
    const nextMonth = new Date(paymentOn.getFullYear(), paymentOn.getMonth() + 1, 1);
    paymentOn = paymentDateOn(nextMonth.getFullYear(), nextMonth.getMonth(), dueDay);
  }

  return schedule;
}
