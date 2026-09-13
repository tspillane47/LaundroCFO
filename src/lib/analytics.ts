import { sendGAEvent } from "@next/third-parties/google";

export const SIGN_UP_STORAGE_KEY = "ga4_sign_up_sent";

/**
 * Fires GA4's recommended `sign_up` event once per browser session.
 * No-ops on the server and on repeat calls (sessionStorage guard).
 */
export function trackSignUpEvent(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (window.sessionStorage.getItem(SIGN_UP_STORAGE_KEY) === "1") {
      return false;
    }
    window.sessionStorage.setItem(SIGN_UP_STORAGE_KEY, "1");
  } catch {
    // Private mode / blocked storage — still send this call.
  }

  sendGAEvent("event", "sign_up", { method: "email" });
  return true;
}
