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
  // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
  console.log("[TEMP-DEBUG] trackSignUpEvent() called");

  if (typeof window === "undefined") {
    // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
    console.log("[TEMP-DEBUG] trackSignUpEvent skipped — no window (server)");
    return false;
  }

  try {
    const existingGuard = window.sessionStorage.getItem(SIGN_UP_STORAGE_KEY);
    const alreadySent = existingGuard === "1";
    // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
    console.log("[TEMP-DEBUG] sessionStorage check", {
      key: SIGN_UP_STORAGE_KEY,
      value: existingGuard,
      alreadySent,
      passes: !alreadySent,
    });
    if (alreadySent) {
      // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
      console.log("[TEMP-DEBUG] trackSignUpEvent skipped — sessionStorage guard already set");
      return false;
    }
  } catch (err) {
    // Private mode / blocked storage — still send this call.
    // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
    console.log("[TEMP-DEBUG] sessionStorage check threw — proceeding anyway", err);
  }

  const target = window as DataLayerWindow;
  const dataLayerBefore = target.dataLayer;
  const pushArgs: unknown[] = ["event", "sign_up", { method: "email" }];
  // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
  console.log("[TEMP-DEBUG] window.dataLayer at moment of push", {
    exists: dataLayerBefore !== undefined,
    isArray: Array.isArray(dataLayerBefore),
    length: Array.isArray(dataLayerBefore) ? dataLayerBefore.length : null,
    state: dataLayerBefore,
  });
  console.log("[TEMP-DEBUG] executing dataLayer.push with", pushArgs);

  const queued = pushGAEvent("event", "sign_up", { method: "email" });
  // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
  console.log("[TEMP-DEBUG] dataLayer.push completed", {
    queued,
    dataLayerAfter: (window as DataLayerWindow).dataLayer,
  });
  if (!queued) return false;

  try {
    window.sessionStorage.setItem(SIGN_UP_STORAGE_KEY, "1");
  } catch {
    // Private mode / blocked storage — event is already queued.
  }

  return true;
}
