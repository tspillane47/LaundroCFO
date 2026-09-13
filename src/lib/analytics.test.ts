import { afterEach, describe, expect, it, vi } from "vitest";

const { sendGAEventMock } = vi.hoisted(() => ({
  sendGAEventMock: vi.fn(),
}));

vi.mock("@next/third-parties/google", () => ({
  sendGAEvent: sendGAEventMock,
}));

import { SIGN_UP_STORAGE_KEY, trackSignUpEvent } from "@/lib/analytics";

function mockBrowserStorage(initial?: Record<string, string>) {
  const store = new Map(Object.entries(initial ?? {}));
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  });
  return store;
}

afterEach(() => {
  sendGAEventMock.mockReset();
  vi.unstubAllGlobals();
});

describe("trackSignUpEvent", () => {
  it("no-ops on the server", () => {
    expect(typeof window).toBe("undefined");
    expect(trackSignUpEvent()).toBe(false);
    expect(sendGAEventMock).not.toHaveBeenCalled();
  });

  it("sends the recommended GA4 sign_up event once", () => {
    mockBrowserStorage();

    expect(trackSignUpEvent()).toBe(true);
    expect(sendGAEventMock).toHaveBeenCalledTimes(1);
    expect(sendGAEventMock).toHaveBeenCalledWith("event", "sign_up", { method: "email" });
  });

  it("does not send again in the same browser session", () => {
    mockBrowserStorage();

    expect(trackSignUpEvent()).toBe(true);
    expect(trackSignUpEvent()).toBe(false);
    expect(sendGAEventMock).toHaveBeenCalledTimes(1);
  });

  it("skips when the sessionStorage guard is already set", () => {
    mockBrowserStorage({ [SIGN_UP_STORAGE_KEY]: "1" });

    expect(trackSignUpEvent()).toBe(false);
    expect(sendGAEventMock).not.toHaveBeenCalled();
  });

  it("still sends when sessionStorage throws", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });

    expect(trackSignUpEvent()).toBe(true);
    expect(sendGAEventMock).toHaveBeenCalledWith("event", "sign_up", { method: "email" });
  });
});
