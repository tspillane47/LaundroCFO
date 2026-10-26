export const GA_MEASUREMENT_ID = "G-ZCTEFSVP13";
export const SIGN_UP_STORAGE_KEY = "ga4_sign_up_sent";
export const SIGNUP_STARTED_STORAGE_KEY = "ga4_signup_started_sent";
export const INTERNAL_TRAFFIC_STORAGE_KEY = "ga4_internal_traffic";
export const INTERNAL_TRAFFIC_PARAM = "ga_optout";

type DataLayerWindow = Window & { dataLayer?: unknown[] } & Record<string, unknown>;

/**
 * Queue a gtag command on window.dataLayer.
 *
 * gtag.js only recognises an `arguments` object as a command. A plain array is
 * silently ignored, so this must push `arguments` exactly like the
 * `function gtag(){ dataLayer.push(arguments) }` snippet Google (and
 * @next/third-parties) use. Creates the array if needed so events survive
 * until gtag.js drains the queue.
 */
export function pushGAEvent(..._command: unknown[]): boolean {
  if (typeof window === "undefined") return false;

  const target = window as DataLayerWindow;
  target.dataLayer = target.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  target.dataLayer.push(arguments);
  return true;
}

/** Send a GA4 event at most once per browser session, guarded by sessionStorage. */
function trackOncePerSession(
  storageKey: string,
  eventName: string,
  params?: Record<string, unknown>
): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (window.sessionStorage.getItem(storageKey) === "1") {
      return false;
    }
  } catch {
    // Private mode / blocked storage — still send this call.
  }

  const queued = params
    ? pushGAEvent("event", eventName, params)
    : pushGAEvent("event", eventName);
  if (!queued) return false;

  try {
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Private mode / blocked storage — event is already queued.
  }

  return true;
}

/**
 * Fires GA4's recommended `sign_up` event once per browser session.
 * No-ops on the server and on repeat calls (sessionStorage guard after a successful queue).
 */
export function trackSignUpEvent(): boolean {
  const sent = trackOncePerSession(SIGN_UP_STORAGE_KEY, "sign_up", { method: "email" });
  if (sent && typeof window !== "undefined") {
    // Tells Meta ads a signup happened so campaigns can optimize for it.
    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
    if (typeof fbq === "function") fbq("track", "CompleteRegistration");
  }
  return sent;
}

/**
 * Fires `signup_started` the first time a visitor interacts with the signup form,
 * so drop-off before email confirmation shows up in GA4.
 */
export function trackSignupStarted(): boolean {
  return trackOncePerSession(SIGNUP_STARTED_STORAGE_KEY, "signup_started", {
    method: "email",
  });
}

/** Paths that are never real visitors (owner tooling). */
export function isInternalTrafficPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Decide whether this browser's GA hits should be suppressed, and apply it.
 *
 * - Any `/admin` page is always excluded.
 * - Visiting any page once with `?ga_optout=1` marks this browser as internal
 *   (stored in localStorage), so the owner's phone/laptop stay out of GA4
 *   regardless of IP. `?ga_optout=0` clears it.
 *
 * Suppression uses Google's documented `window['ga-disable-<ID>']` switch,
 * which is checked at send time.
 */
export function applyInternalTrafficOptOut(
  pathname: string | null | undefined,
  search: string
): boolean {
  if (typeof window === "undefined") return false;

  let internal = isInternalTrafficPath(pathname);

  try {
    const flag = new URLSearchParams(search).get(INTERNAL_TRAFFIC_PARAM);
    if (flag === "1") {
      window.localStorage.setItem(INTERNAL_TRAFFIC_STORAGE_KEY, "1");
    } else if (flag === "0") {
      window.localStorage.removeItem(INTERNAL_TRAFFIC_STORAGE_KEY);
    }
    if (window.localStorage.getItem(INTERNAL_TRAFFIC_STORAGE_KEY) === "1") {
      internal = true;
    }
  } catch {
    // Blocked storage — fall back to the path check only.
  }

  (window as DataLayerWindow)[`ga-disable-${GA_MEASUREMENT_ID}`] = internal;
  return internal;
}
