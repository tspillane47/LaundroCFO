/** Shared max-length constants for free-text fields. */

export const TEXT_LIMITS = {
  transactionNote: 500,
  transactionDescription: 500,
  exclusionReason: 500,
  vendorPattern: 200,
  feedbackMessage: 2000,
  notesField: 1000,
} as const;

export function validateMaxLength(
  value: string,
  max: number,
  label: string
): string | null {
  if (value.length > max) {
    return `${label} must be ${max} characters or fewer.`;
  }
  return null;
}

export function trimToMaxLength(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
