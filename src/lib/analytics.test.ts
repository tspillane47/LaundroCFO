import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GA_MEASUREMENT_ID,
  INTERNAL_TRAFFIC_STORAGE_KEY,
  SIGNUP_STARTED_STORAGE_KEY,
  SIGN_UP_STORAGE_KEY,
  applyInternalTrafficOptOut,
  isInternalTrafficPath,
  pushGAEvent,
  trackSignUpEvent,
  trackSignupStarted,
} from "@/lib/analytics";

function makeStorage(store: Map<string, string>, throws = false): Storage {
  return {
    getItem: (key: string) => {
      if (throws) throw new Error("blocked");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (throws) throw new Error("blocked");
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    get length() {
      return store.size;
    },
  };
}

function mockBrowser(options?: {
  storage?: Record<string, string>;
  localStorage?: Record<string, string>;
  dataLayer?: unknown[];
  storageThrows?: boolean;
}) {
  const store = new Map(Object.entries(options?.storage ?? {}));
  const localStore = new Map(Object.entries(options?.localStorage ?? {}));
  const target: Record<string, unknown> & {
    dataLayer?: unknown[];
    sessionStorage: Storage;
    localStorage: Storage;
  } = {
    dataLayer: options?.dataLayer,
    sessionStorage: makeStorage(store, options?.storageThrows),
    localStorage: makeStorage(localStore, options?.storageThrows),
  };
  vi.stubGlobal("window", target);
  return { store, localStore, target };
}

/**
 * gtag.js only executes `arguments` objects pushed on dataLayer; a plain array is
 * ignored. Every queued GA command must therefore be an Arguments object.
 */
function isArgumentsObject(value: unknown): boolean {
  return Object.prototype.toString.call(value) === "[object Arguments]";
}

function queuedCommands(target: { dataLayer?: unknown[] }): unknown[][] {
  return (target.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pushGAEvent", () => {
  it("no-ops on the server", () => {
    expect(typeof window).toBe("undefined");
    expect(pushGAEvent("event", "sign_up")).toBe(false);
  });

  it("creates dataLayer and queues the command as an arguments object", () => {
    const { target } = mockBrowser();

    expect(pushGAEvent("event", "sign_up", { method: "email" })).toBe(true);
    expect(target.dataLayer).toHaveLength(1);
    expect(isArgumentsObject(target.dataLayer![0])).toBe(true);
    expect(queuedCommands(target)).toEqual([["event", "sign_up", { method: "email" }]]);
  });

  it("never queues a plain array (gtag.js would ignore it)", () => {
    const { target } = mockBrowser();

    pushGAEvent("event", "anything");
    expect(Array.isArray(target.dataLayer![0])).toBe(false);
  });

  it("appends to an existing dataLayer so gtag.js can drain it later", () => {
    const existing: unknown[] = [["js", new Date(0)]];
    mockBrowser({ dataLayer: existing });

    expect(pushGAEvent("event", "sign_up", { method: "email" })).toBe(true);
    expect(existing).toHaveLength(2);
    expect(isArgumentsObject(existing[1])).toBe(true);
    expect(Array.from(existing[1] as ArrayLike<unknown>)).toEqual([
      "event",
      "sign_up",
      { method: "email" },
    ]);
  });
});

describe("trackSignUpEvent", () => {
  it("no-ops on the server", () => {
    expect(typeof window).toBe("undefined");
    expect(trackSignUpEvent()).toBe(false);
  });

  it("queues the recommended GA4 sign_up event once", () => {
    const { target, store } = mockBrowser();

    expect(trackSignUpEvent()).toBe(true);
    expect(isArgumentsObject(target.dataLayer![0])).toBe(true);
    expect(queuedCommands(target)).toEqual([["event", "sign_up", { method: "email" }]]);
    expect(store.get(SIGN_UP_STORAGE_KEY)).toBe("1");
  });

  it("does not send again in the same browser session", () => {
    const { target } = mockBrowser();

    expect(trackSignUpEvent()).toBe(true);
    expect(trackSignUpEvent()).toBe(false);
    expect(target.dataLayer).toHaveLength(1);
  });

  it("skips when the sessionStorage guard is already set", () => {
    const { target } = mockBrowser({ storage: { [SIGN_UP_STORAGE_KEY]: "1" } });

    expect(trackSignUpEvent()).toBe(false);
    expect(target.dataLayer).toBeUndefined();
  });

  it("still sends when sessionStorage throws", () => {
    const { target } = mockBrowser({ storageThrows: true });

    expect(trackSignUpEvent()).toBe(true);
    expect(queuedCommands(target)).toEqual([["event", "sign_up", { method: "email" }]]);
  });

  it("locks sessionStorage only after the event is queued", () => {
    const store = new Map<string, string>();
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", {
      dataLayer,
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          expect(queuedCommands({ dataLayer })).toEqual([
            ["event", "sign_up", { method: "email" }],
          ]);
          store.set(key, value);
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    });

    expect(trackSignUpEvent()).toBe(true);
    expect(store.get(SIGN_UP_STORAGE_KEY)).toBe("1");
  });
});

describe("trackSignupStarted", () => {
  it("no-ops on the server", () => {
    expect(typeof window).toBe("undefined");
    expect(trackSignupStarted()).toBe(false);
  });

  it("queues signup_started once per session, separately from sign_up", () => {
    const { target, store } = mockBrowser();

    expect(trackSignupStarted()).toBe(true);
    expect(trackSignupStarted()).toBe(false);
    expect(queuedCommands(target)).toEqual([["event", "signup_started", { method: "email" }]]);
    expect(store.get(SIGNUP_STARTED_STORAGE_KEY)).toBe("1");
    expect(store.has(SIGN_UP_STORAGE_KEY)).toBe(false);

    expect(trackSignUpEvent()).toBe(true);
    expect(target.dataLayer).toHaveLength(2);
  });
});

describe("isInternalTrafficPath", () => {
  it("treats /admin and its children as internal", () => {
    expect(isInternalTrafficPath("/admin")).toBe(true);
    expect(isInternalTrafficPath("/admin/users")).toBe(true);
  });

  it("does not match public or look-alike paths", () => {
    expect(isInternalTrafficPath("/")).toBe(false);
    expect(isInternalTrafficPath("/signup")).toBe(false);
    expect(isInternalTrafficPath("/administrators")).toBe(false);
    expect(isInternalTrafficPath(null)).toBe(false);
  });
});

describe("applyInternalTrafficOptOut", () => {
  const key = `ga-disable-${GA_MEASUREMENT_ID}`;

  it("no-ops on the server", () => {
    expect(typeof window).toBe("undefined");
    expect(applyInternalTrafficOptOut("/", "")).toBe(false);
  });

  it("leaves GA enabled for a normal visitor", () => {
    const { target } = mockBrowser();

    expect(applyInternalTrafficOptOut("/", "")).toBe(false);
    expect(target[key]).toBe(false);
  });

  it("disables GA on /admin without marking the browser", () => {
    const { target, localStore } = mockBrowser();

    expect(applyInternalTrafficOptOut("/admin", "")).toBe(true);
    expect(target[key]).toBe(true);
    expect(localStore.has(INTERNAL_TRAFFIC_STORAGE_KEY)).toBe(false);
  });

  it("marks the browser internal with ?ga_optout=1 and keeps it on later pages", () => {
    const { target, localStore } = mockBrowser();

    expect(applyInternalTrafficOptOut("/", "?ga_optout=1")).toBe(true);
    expect(localStore.get(INTERNAL_TRAFFIC_STORAGE_KEY)).toBe("1");

    expect(applyInternalTrafficOptOut("/signup", "")).toBe(true);
    expect(target[key]).toBe(true);
  });

  it("clears the marker with ?ga_optout=0", () => {
    const { target, localStore } = mockBrowser({
      localStorage: { [INTERNAL_TRAFFIC_STORAGE_KEY]: "1" },
    });

    expect(applyInternalTrafficOptOut("/", "?ga_optout=0")).toBe(false);
    expect(localStore.has(INTERNAL_TRAFFIC_STORAGE_KEY)).toBe(false);
    expect(target[key]).toBe(false);
  });

  it("falls back to the path check when storage is blocked", () => {
    const { target } = mockBrowser({ storageThrows: true });

    expect(applyInternalTrafficOptOut("/", "?ga_optout=1")).toBe(false);
    expect(applyInternalTrafficOptOut("/admin", "")).toBe(true);
    expect(target[key]).toBe(true);
  });
});
