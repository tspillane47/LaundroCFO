/** Client-safe QuickBooks types/helpers — no server-only or heavy lib imports. */

export type QuickBooksSyncSkippedMonth = {
  year: number;
  month: number;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function formatSkippedMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function shouldSkipMonthForQuickBooksSync(params: {
  manuallyOverriddenAt: string | null | undefined;
  year: number;
  month: number;
  forceOverrideMonths?: QuickBooksSyncSkippedMonth[];
}): boolean {
  if (!params.manuallyOverriddenAt) {
    return false;
  }

  const isForceOverride = (params.forceOverrideMonths ?? []).some(
    (entry) => entry.year === params.year && entry.month === params.month
  );

  return !isForceOverride;
}
