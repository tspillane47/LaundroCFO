/** Shared form → DB coercions for Supabase payloads. */

export function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "allowed", "with consent"].includes(normalized)) return true;
    return false;
  }
  return Boolean(value);
}

export function toNum(value: unknown, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toNullableNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toNullableDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

export function toNullableText(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/** Returns the first negative-field error message, or null if all values are >= 0. */
export function findNegativeFieldError(
  fields: { value: number; label: string }[]
): string | null {
  for (const { value, label } of fields) {
    if (value < 0) {
      return `${label} cannot be negative.`;
    }
  }
  return null;
}

const SERVICE_MIX_SUM_TOLERANCE = 5;

/** Returns an error message when service mix percentages don't sum to ~100%, or null if valid. */
export function validateServiceMixSum(
  selfServicePct: number,
  wdfPct: number,
  commercialPct: number,
  pickupDeliveryPct: number,
  tolerance = SERVICE_MIX_SUM_TOLERANCE
): string | null {
  const sum = selfServicePct + wdfPct + commercialPct + pickupDeliveryPct;
  if (sum < 100 - tolerance || sum > 100 + tolerance) {
    return `Service mix must sum to approximately 100% (currently ${sum}%). Adjust Self Service, WDF, Commercial, and Pickup & Delivery.`;
  }
  return null;
}
