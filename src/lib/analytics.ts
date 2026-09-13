export const SIGN_UP_STORAGE_KEY = "ga4_sign_up_sent";

type DataLayerWindow = Window & { dataLayer?: unknown[] };

/**
 * Queue a gtag command on window.dataLayer.
 * Creates the array if needed so events survive until gtag.js drains the queue.
 */
export function pushGAEvent(...args: unknown[]): boolean {
  if (typeof window === "undefined") return false;

  const target = window as DataLayerWindow;
  target.dataLayer = target.dataLayer ?? [];
  target.dataLayer.push(args);
  return true;
}

/**
 * Fires GA4's recommended `sign_up` event once per browser session.
 * No-ops on the server and on repeat calls (sessionStorage guard after a successful queue).
 */
export function trackSignUpEvent(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (window.sessionStorage.getItem(SIGN_UP_STORAGE_KEY) === "1") {
      return false;
    }
  } catch {
    // Private mode / blocked storage — still send this call.
  }

  const queued = pushGAEvent("event", "sign_up", { method: "email" });
  if (!queued) return false;

  try {
    window.sessionStorage.setItem(SIGN_UP_STORAGE_KEY, "1");
  } catch {
    // Private mode / blocked storage — event is already queued.
  }

  return true;
}
