export type RentEscalationInfo = {
  nextDate: Date;
  monthsUntil: number;
  currentRent: number;
  newRent: number;
  increase: number;
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function diffInMonths(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function monthsUntil(from: Date, to: Date): number {
  if (to <= from) return 0;
  let months = diffInMonths(from, to);
  const probe = new Date(from);
  probe.setMonth(probe.getMonth() + months);
  if (probe < to) months += 1;
  return months;
}

function addYears(date: Date, years: number): Date {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
}

function parseLeaseStart(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

/** Next annual rent escalation date and projected rent. Returns null when escalation is 0/null or no rent on file. */
export function getNextRentEscalation(
  leaseStartDate: string | null | undefined,
  annualEscalationPct: number | null | undefined,
  monthlyRent: number | null | undefined,
  fromDate: Date = new Date()
): RentEscalationInfo | null {
  const pct = annualEscalationPct ?? 0;
  const currentRent = monthlyRent ?? 0;
  if (pct <= 0 || currentRent <= 0) return null;

  const today = startOfDay(fromDate);
  const leaseStart = parseLeaseStart(leaseStartDate);
  const anchor = leaseStart ?? today;

  let next = startOfDay(anchor);
  while (next <= today) {
    next = addYears(next, 1);
  }

  const newRent = Math.round(currentRent * (1 + pct / 100));
  const increase = newRent - currentRent;

  return {
    nextDate: next,
    monthsUntil: monthsUntil(today, next),
    currentRent,
    newRent,
    increase,
  };
}

export function formatRentEscalationAlert(info: RentEscalationInfo): string {
  const fmt = (n: number) =>
    "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const monthLabel = info.monthsUntil === 1 ? "1 month" : `${info.monthsUntil} months`;
  return `Rent escalation in ${monthLabel} — from ${fmt(info.currentRent)} to ${fmt(info.newRent)} per month (+${fmt(info.increase)})`;
}

export function escalationSeverity(
  monthsUntilEscalation: number
): "warning" | "danger" | null {
  if (monthsUntilEscalation <= 3) return "danger";
  if (monthsUntilEscalation <= 6) return "warning";
  return null;
}
