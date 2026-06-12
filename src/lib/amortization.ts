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
