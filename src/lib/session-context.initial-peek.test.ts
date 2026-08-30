import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessStatus } from "@/lib/access";
import type { OnboardingStatus } from "@/lib/onboarding";

const {
  getUserMock,
  getOnboardingStatusMock,
  getAccessStatusMock,
  getUserStoreCountMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getOnboardingStatusMock: vi.fn(),
  getAccessStatusMock: vi.fn(),
  getUserStoreCountMock: vi.fn(),
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

vi.mock("@/lib/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/access")>();
  return {
    ...actual,
    getAccessStatus: (...args: Parameters<typeof actual.getAccessStatus>) =>
      getAccessStatusMock(...args),
    getUserStoreCount: (...args: Parameters<typeof actual.getUserStoreCount>) =>
      getUserStoreCountMock(...args),
  };
});

import { invalidateOnboardingStatusCache } from "@/lib/onboarding";
import {
  getCachedAccess,
  getCachedOnboarding,
  getCachedSessionUser,
  invalidateAccessStatusCache,
  invalidateCachedOnboarding,
  invalidateSessionUser,
  peekFreshOnboarding,
} from "@/lib/session-cache";
import { readInitialSession } from "@/lib/session-context";

const USER_ID = "user-123";
const JOINER_EMAIL = "joiner@example.com";
const INCOMPLETE: OnboardingStatus = { complete: false, path: null };

const NO_SUBSCRIPTION: AccessStatus = {
  plan: null,
  isReadOnly: true,
  reason: "no_subscription",
  trialEndsAt: null,
  currentPeriodEnd: null,
  maxStores: 0,
};

beforeEach(() => {
  invalidateAccessStatusCache();
  invalidateCachedOnboarding();
  invalidateSessionUser();
  getUserMock.mockReset();
  getOnboardingStatusMock.mockReset();
  getAccessStatusMock.mockReset();
  getUserStoreCountMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID, email: JOINER_EMAIL } } });
  getOnboardingStatusMock.mockResolvedValue(INCOMPLETE);
  getAccessStatusMock.mockResolvedValue(NO_SUBSCRIPTION);
  getUserStoreCountMock.mockResolvedValue(0);
});

afterEach(() => {
  invalidateAccessStatusCache();
  invalidateCachedOnboarding();
  invalidateSessionUser();
  vi.restoreAllMocks();
});

describe("readInitialSession after onboarding invalidate", () => {
  it("is loading on a fresh mount when the peeked onboarding record predates the invalidate", async () => {
    await getCachedSessionUser();
    await getCachedOnboarding(USER_ID);
    await getCachedAccess(USER_ID, null);

    expect(peekFreshOnboarding(USER_ID)?.status).toEqual(INCOMPLETE);

    getOnboardingStatusMock.mockImplementation(
      () => new Promise<OnboardingStatus>(() => {})
    );

    // Leave the pre-invalidate settled record in place (60s TTL still valid)
    // while still bumping the generation — the live remount gap.
    const clearSpy = vi.spyOn(Map.prototype, "clear").mockImplementation(() => undefined);
    invalidateOnboardingStatusCache();
    clearSpy.mockRestore();

    const initial = readInitialSession();

    expect(initial.loading).toBe(true);
    expect(peekFreshOnboarding(USER_ID)).toBeNull();
  });
});
