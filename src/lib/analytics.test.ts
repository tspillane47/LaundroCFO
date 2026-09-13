import { afterEach, describe, expect, it, vi } from "vitest";

import { SIGN_UP_STORAGE_KEY, pushGAEvent, trackSignUpEvent } from "@/lib/analytics";

function mockBrowser(options?: {
  storage?: Record<string, string>;
  dataLayer?: unknown[];
  storageThrows?: boolean;
}) {
  const store = new Map(Object.entries(options?.storage ?? {}));
  const target: { dataLayer?: unknown[]; sessionStorage: Storage } = {
    dataLayer: options?.dataLayer,
    sessionStorage: {
      getItem: (key: string) => {
        if (options?.storageThrows) throw new Error("blocked");
        return store.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (options?.storageThrows) throw new Error("blocked");
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
    },
  };
  vi.stubGlobal("window", target);
  return { store, target };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pushGAEvent", () => {
  it("no-ops on the server", () => {
    expect(typeof window).toBe("undefined");
    expect(pushGAEvent("event", "sign_up")).toBe(false);
  });

  it("creates dataLayer and queues a raw command array", () => {
    const { target } = mockBrowser();

    expect(pushGAEvent("event", "sign_up", { method: "email" })).toBe(true);
    expect(target.dataLayer).toEqual([["event", "sign_up", { method: "email" }]]);
  });

  it("appends to an existing dataLayer so gtag.js can drain it later", () => {
    const existing: unknown[] = [["js", new Date(0)]];
    mockBrowser({ dataLayer: existing });

    expect(pushGAEvent("event", "sign_up", { method: "email" })).toBe(true);
    expect(existing).toHaveLength(2);
    expect(existing[1]).toEqual(["event", "sign_up", { method: "email" }]);
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
    expect(target.dataLayer).toEqual([["event", "sign_up", { method: "email" }]]);
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
    expect(target.dataLayer).toEqual([["event", "sign_up", { method: "email" }]]);
  });

  it("locks sessionStorage only after the event is queued", () => {
    const store = new Map<string, string>();
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", {
      dataLayer,
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          expect(dataLayer).toEqual([["event", "sign_up", { method: "email" }]]);
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
