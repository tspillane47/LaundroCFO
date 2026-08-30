import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingStatus } from "@/lib/onboarding";

const { getOnboardingStatusMock, getUserMock } = vi.hoisted(() => ({
  getOnboardingStatusMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("@/lib/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onboarding")>();
  return {
    ...actual,
    getOnboardingStatus: (...args: Parameters<typeof actual.getOnboardingStatus>) =>
      getOnboardingStatusMock(...args),
  };
});

import {
  getCachedOnboarding,
  invalidateCachedOnboarding,
  peekFreshOnboarding,
} from "@/lib/session-cache";

const USER_ID = "user-123";
const INCOMPLETE: OnboardingStatus = { complete: false, path: null };
const JOIN_COMPLETE: OnboardingStatus = { complete: true, path: "join" };

beforeEach(() => {
  invalidateCachedOnboarding();
  getOnboardingStatusMock.mockReset();
  getUserMock.mockReset();
});

afterEach(() => {
  invalidateCachedOnboarding();
  vi.restoreAllMocks();
});

describe("getCachedOnboarding in-flight vs invalidate", () => {
  it("discards a stale in-flight fetch after invalidate so it cannot poison the cache", async () => {
    let releaseStale: ((status: OnboardingStatus) => void) | undefined;
    getOnboardingStatusMock.mockImplementationOnce(
      () =>
        new Promise<OnboardingStatus>((resolve) => {
          releaseStale = resolve;
        })
    );

    const stalePromise = getCachedOnboarding(USER_ID);

    let releaseFresh: ((status: OnboardingStatus) => void) | undefined;
    getOnboardingStatusMock.mockImplementationOnce(
      () =>
        new Promise<OnboardingStatus>((resolve) => {
          releaseFresh = resolve;
        })
    );

    invalidateCachedOnboarding();
    const freshPromise = getCachedOnboarding(USER_ID);

    releaseStale?.(INCOMPLETE);
    await stalePromise;

    expect(peekFreshOnboarding(USER_ID)).toBeNull();

    const thirdRead = getCachedOnboarding(USER_ID);
    releaseFresh?.(JOIN_COMPLETE);

    await expect(freshPromise).resolves.toEqual(JOIN_COMPLETE);
    await expect(thirdRead).resolves.toEqual(JOIN_COMPLETE);
    expect(peekFreshOnboarding(USER_ID)?.status).toEqual(JOIN_COMPLETE);
  });

  it("does not overwrite a newer cache entry when the stale fetch resolves later", async () => {
    let releaseStale: ((status: OnboardingStatus) => void) | undefined;
    getOnboardingStatusMock.mockImplementationOnce(
      () =>
        new Promise<OnboardingStatus>((resolve) => {
          releaseStale = resolve;
        })
    );

    const stalePromise = getCachedOnboarding(USER_ID);

    let releaseFresh: ((status: OnboardingStatus) => void) | undefined;
    getOnboardingStatusMock.mockImplementationOnce(
      () =>
        new Promise<OnboardingStatus>((resolve) => {
          releaseFresh = resolve;
        })
    );

    invalidateCachedOnboarding();
    const freshPromise = getCachedOnboarding(USER_ID);

    releaseFresh?.(JOIN_COMPLETE);
    await expect(freshPromise).resolves.toEqual(JOIN_COMPLETE);
    expect(peekFreshOnboarding(USER_ID)?.status).toEqual(JOIN_COMPLETE);

    releaseStale?.(INCOMPLETE);
    await stalePromise;

    expect(peekFreshOnboarding(USER_ID)?.status).toEqual(JOIN_COMPLETE);
    await expect(getCachedOnboarding(USER_ID)).resolves.toEqual(JOIN_COMPLETE);
  });
});
