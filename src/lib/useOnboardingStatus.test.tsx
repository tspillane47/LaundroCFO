/** @vitest-environment happy-dom */

import React, { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingStatus } from "@/lib/onboarding";

const { getUserMock, getOnboardingStatusMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getOnboardingStatusMock: vi.fn(),
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

import { invalidateOnboardingStatusCache } from "@/lib/onboarding";
import { useOnboardingStatus } from "@/lib/useOnboardingStatus";

const USER_ID = "user-123";
const OWNER_EMAIL = "owner@example.com";
const JOINER_EMAIL = "joiner@example.com";

const INCOMPLETE: OnboardingStatus = { complete: false, path: null };
const OWN_COMPLETE: OnboardingStatus = { complete: true, path: "own" };
const JOIN_COMPLETE: OnboardingStatus = { complete: true, path: "join" };

type OnboardingHookValue = ReturnType<typeof useOnboardingStatus>;

function OnboardingProbe({
  onRender,
}: {
  onRender: (value: OnboardingHookValue) => void;
}) {
  onRender(useOnboardingStatus());
  return null;
}

function DualOnboardingProbe({
  onRender,
}: {
  onRender: (value: { first: OnboardingHookValue; second: OnboardingHookValue }) => void;
}) {
  const first = useOnboardingStatus();
  const second = useOnboardingStatus();
  onRender({ first, second });
  return null;
}

let mounted: { root: Root; container: HTMLDivElement } | null = null;

function mount(node: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  mounted = { root, container };
  return mounted;
}

function unmountMounted() {
  if (!mounted) return;
  act(() => {
    mounted?.root.unmount();
  });
  mounted.container.remove();
  mounted = null;
}

async function waitFor(assert: () => void, timeoutMs = 2000) {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      assert();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  throw lastError;
}

function mockSignedInUser(email = OWNER_EMAIL) {
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID, email } } });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  getUserMock.mockReset();
  getOnboardingStatusMock.mockReset();
  mockSignedInUser();
  getOnboardingStatusMock.mockResolvedValue(INCOMPLETE);
});

afterEach(() => {
  unmountMounted();
  vi.restoreAllMocks();
});

describe("useOnboardingStatus", () => {
  it("returns incomplete status and no email when there is no signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    getOnboardingStatusMock.mockResolvedValue(OWN_COMPLETE);

    let latest: OnboardingHookValue | undefined;
    mount(<OnboardingProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest).toMatchObject({
      status: { complete: false, path: null },
      userEmail: null,
      isJoining: false,
    });
    expect(getOnboardingStatusMock).not.toHaveBeenCalled();
  });

  it("returns own-path complete status and the user email", async () => {
    mockSignedInUser(OWNER_EMAIL);
    getOnboardingStatusMock.mockResolvedValue(OWN_COMPLETE);

    let latest: OnboardingHookValue | undefined;
    mount(<OnboardingProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest).toMatchObject({
      status: { complete: true, path: "own" },
      userEmail: OWNER_EMAIL,
      isJoining: false,
    });
    expect(getOnboardingStatusMock).toHaveBeenCalledTimes(1);
    expect(getOnboardingStatusMock.mock.calls[0][1]).toBe(USER_ID);
  });

  it("returns join-path complete status as isJoining without requiring owned stores", async () => {
    mockSignedInUser(JOINER_EMAIL);
    getOnboardingStatusMock.mockResolvedValue(JOIN_COMPLETE);

    let latest: OnboardingHookValue | undefined;
    mount(<OnboardingProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest).toMatchObject({
      status: { complete: true, path: "join" },
      userEmail: JOINER_EMAIL,
      isJoining: true,
    });
  });

  it("returns incomplete status for a fresh signup", async () => {
    getOnboardingStatusMock.mockResolvedValue(INCOMPLETE);

    let latest: OnboardingHookValue | undefined;
    mount(<OnboardingProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest).toMatchObject({
      status: { complete: false, path: null },
      userEmail: OWNER_EMAIL,
      isJoining: false,
    });
  });

  it("refetches after invalidateOnboardingStatusCache", async () => {
    getOnboardingStatusMock.mockResolvedValue(OWN_COMPLETE);

    let latest: OnboardingHookValue | undefined;
    mount(<OnboardingProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });
    expect(getOnboardingStatusMock).toHaveBeenCalledTimes(1);

    getOnboardingStatusMock.mockResolvedValue(JOIN_COMPLETE);

    await act(async () => {
      invalidateOnboardingStatusCache();
    });

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
      expect(latest?.isJoining).toBe(true);
      expect(latest?.status).toEqual(JOIN_COMPLETE);
    });
    expect(getOnboardingStatusMock).toHaveBeenCalledTimes(2);
  });

  it("fetches independently when two hooks mount on the same tree", async () => {
    getOnboardingStatusMock.mockResolvedValue(JOIN_COMPLETE);

    let latest: { first: OnboardingHookValue; second: OnboardingHookValue } | undefined;
    mount(
      <DualOnboardingProbe
        onRender={(value) => {
          latest = value;
        }}
      />
    );

    await waitFor(() => {
      expect(latest?.first.loading).toBe(false);
      expect(latest?.second.loading).toBe(false);
    });

    expect(latest?.first.isJoining).toBe(true);
    expect(latest?.second.isJoining).toBe(true);
    expect(getUserMock).toHaveBeenCalledTimes(2);
    expect(getOnboardingStatusMock).toHaveBeenCalledTimes(2);
  });
});
