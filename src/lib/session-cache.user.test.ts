import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

import {
  getCachedSessionUser,
  invalidateSessionUser,
  peekSessionUser,
} from "@/lib/session-cache";

const USER_ID = "user-123";
const JOINER_EMAIL = "joiner@example.com";
const REAL_USER = { id: USER_ID, email: JOINER_EMAIL };

beforeEach(() => {
  invalidateSessionUser();
  getUserMock.mockReset();
});

afterEach(() => {
  invalidateSessionUser();
  vi.restoreAllMocks();
});

describe("getCachedSessionUser null handling", () => {
  it("does not treat a null getUser() result as a permanent cache hit", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });

    await expect(getCachedSessionUser()).resolves.toBeNull();
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(peekSessionUser()).toBeUndefined();

    getUserMock.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: JOINER_EMAIL } },
    });

    await expect(getCachedSessionUser()).resolves.toEqual(REAL_USER);
    expect(getUserMock).toHaveBeenCalledTimes(2);
    expect(peekSessionUser()).toEqual(REAL_USER);
  });

  it("discards an in-flight null after invalidate so it cannot poison a later real user", async () => {
    let releaseStale: ((value: { data: { user: null } }) => void) | undefined;
    getUserMock.mockImplementationOnce(
      () =>
        new Promise<{ data: { user: null } }>((resolve) => {
          releaseStale = resolve;
        })
    );

    const stalePromise = getCachedSessionUser();

    let releaseFresh:
      | ((value: { data: { user: { id: string; email: string } } }) => void)
      | undefined;
    getUserMock.mockImplementationOnce(
      () =>
        new Promise<{ data: { user: { id: string; email: string } } }>((resolve) => {
          releaseFresh = resolve;
        })
    );

    invalidateSessionUser();
    const freshPromise = getCachedSessionUser();

    releaseStale?.({ data: { user: null } });
    await expect(stalePromise).resolves.toBeNull();
    expect(peekSessionUser()).toBeUndefined();

    const thirdRead = getCachedSessionUser();
    releaseFresh?.({ data: { user: { id: USER_ID, email: JOINER_EMAIL } } });

    await expect(freshPromise).resolves.toEqual(REAL_USER);
    await expect(thirdRead).resolves.toEqual(REAL_USER);
    expect(peekSessionUser()).toEqual(REAL_USER);
    expect(getUserMock).toHaveBeenCalledTimes(2);
  });
});
