/** Client-safe QuickBooks types/helpers — no server-only or heavy lib imports. */

import { formatDistanceToNow } from "date-fns";

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

export type QuickBooksSyncHistory = {
  last_synced_at: string | null;
  last_sync_months_synced: number | null;
  last_sync_skipped_count: number | null;
  last_sync_unmapped_count: number | null;
};

export type QuickBooksConnectionError = {
  error_code: string | null;
  error_message: string | null;
  error_at: string | null;
};

export function formatQuickBooksConnectionErrorMessage(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined
): string {
  if (errorMessage?.trim()) {
    return errorMessage.trim();
  }

  switch (errorCode) {
    case "RECONNECT_REQUIRED":
      return "Your QuickBooks connection expired. Please reconnect to keep your data up to date.";
    default:
      return "Your QuickBooks connection needs attention.";
  }
}

export function formatQuickBooksSyncStatus(history: QuickBooksSyncHistory): string {
  if (!history.last_synced_at) {
    return "Never synced";
  }

  const relative = formatDistanceToNow(new Date(history.last_synced_at), { addSuffix: true });
  const months = history.last_sync_months_synced ?? 0;
  const skipped = history.last_sync_skipped_count ?? 0;
  const unmapped = history.last_sync_unmapped_count ?? 0;
  const monthLabel = months === 1 ? "1 month synced" : `${months} months synced`;
  const skippedLabel = skipped === 1 ? "1 skipped" : `${skipped} skipped`;
  const unmappedLabel = unmapped === 1 ? "1 unmapped" : `${unmapped} unmapped`;

  return `Last synced: ${relative} (${monthLabel}, ${skippedLabel}, ${unmappedLabel})`;
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
