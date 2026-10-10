export const STORE_BANK_REFRESH_THROTTLE_MS = 5 * 60 * 1000;

export function shouldThrottleStoreBankRefresh(
  lastRefreshedAt: string | null | undefined,
  nowMs: number = Date.now(),
  throttleMs: number = STORE_BANK_REFRESH_THROTTLE_MS
): boolean {
  if (!lastRefreshedAt) return false;
  const then = Date.parse(lastRefreshedAt);
  if (!Number.isFinite(then)) return false;
  return nowMs - then < throttleMs;
}
