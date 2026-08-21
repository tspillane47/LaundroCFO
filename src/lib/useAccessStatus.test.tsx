/** @vitest-environment happy-dom */

import React, { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessStatus } from "@/lib/access";

const { getUserMock, getAccessStatusMock, getUserStoreCountMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getAccessStatusMock: vi.fn(),
  getUserStoreCountMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

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

import { invalidateAccessStatusCache, useAccessStatus } from "@/lib/useAccessStatus";

const USER_ID = "user-123";
const STORE_ID = "store-789";
const REVALIDATE_MS = 60_000;

const NO_SUBSCRIPTION: AccessStatus = {
  plan: null,
  isReadOnly: true,
  reason: "no_subscription",
  trialEndsAt: null,
  currentPeriodEnd: null,
  maxStores: 0,
};

const CO_OWNER_WRITE: AccessStatus = {
  plan: null,
  isReadOnly: false,
  reason: "active",
  trialEndsAt: null,
  currentPeriodEnd: null,
  maxStores: null,
};

const STARTER_AT_LIMIT: AccessStatus = {
  plan: "starter",
  isReadOnly: false,
  reason: "active",
  trialEndsAt: null,
  currentPeriodEnd: null,
  maxStores: 1,
};

type AccessHookValue = ReturnType<typeof useAccessStatus>;

function AccessProbe({
  storeId,
  onRender,
}: {
  storeId?: string | null;
  onRender: (value: AccessHookValue) => void;
}) {
  onRender(useAccessStatus(storeId));
  return null;
}

function DualAccessProbe({
  storeId,
  onRender,
}: {
  storeId: string;
  onRender: (value: { unscoped: AccessHookValue; scoped: AccessHookValue }) => void;
}) {
  const unscoped = useAccessStatus();
  const scoped = useAccessStatus(storeId);
  onRender({ unscoped, scoped });
  return null;
}

let mounted: { root: Root; container: HTMLDivElement } | null = null;

function SameScopeProbe({
  onRender,
}: {
  onRender: (value: { first: AccessHookValue; second: AccessHookValue }) => void;
}) {
  const first = useAccessStatus(STORE_ID);
  const second = useAccessStatus(STORE_ID);
  onRender({ first, second });
  return null;
}

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

function mockSignedInUser() {
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID, email: "owner@example.com" } } });
}

function mockAccessByStoreId() {
  getAccessStatusMock.mockImplementation(
    async (_supabase: unknown, _userId: string, _now?: Date, storeId?: string | null) => {
      if (storeId) return CO_OWNER_WRITE;
      return NO_SUBSCRIPTION;
    }
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  invalidateAccessStatusCache();
  getUserMock.mockReset();
  getAccessStatusMock.mockReset();
  getUserStoreCountMock.mockReset();
  mockSignedInUser();
  getUserStoreCountMock.mockResolvedValue(0);
});

afterEach(() => {
  unmountMounted();
  vi.restoreAllMocks();
  invalidateAccessStatusCache();
});

describe("useAccessStatus", () => {
  it("returns default read-only access when there is no signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    getAccessStatusMock.mockResolvedValue(STARTER_AT_LIMIT);

    let latest: AccessHookValue | undefined;
    mount(<AccessProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest).toMatchObject({
      isReadOnly: true,
      plan: null,
      maxStores: 0,
      reason: "no_subscription",
      storeCount: 0,
    });
    expect(getAccessStatusMock).not.toHaveBeenCalled();
    expect(getUserStoreCountMock).not.toHaveBeenCalled();
  });

  it("returns unscoped subscription access and owned store count", async () => {
    getAccessStatusMock.mockResolvedValue(STARTER_AT_LIMIT);
    getUserStoreCountMock.mockResolvedValue(1);

    let latest: AccessHookValue | undefined;
    mount(<AccessProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest).toMatchObject({
      isReadOnly: false,
      plan: "starter",
      maxStores: 1,
      reason: "active",
      storeCount: 1,
    });
    expect(getAccessStatusMock).toHaveBeenCalledTimes(1);
    expect(getAccessStatusMock.mock.calls[0][1]).toBe(USER_ID);
    expect(getAccessStatusMock.mock.calls[0][3] ?? null).toBeNull();
    expect(getUserStoreCountMock).toHaveBeenCalledWith(expect.anything(), USER_ID);
  });

  it("returns store-scoped co-owner write access without changing owned store count", async () => {
    mockAccessByStoreId();
    getUserStoreCountMock.mockResolvedValue(0);

    let latest: AccessHookValue | undefined;
    mount(
      <AccessProbe
        storeId={STORE_ID}
        onRender={(value) => {
          latest = value;
        }}
      />
    );

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest).toMatchObject({
      isReadOnly: false,
      plan: null,
      maxStores: null,
      reason: "active",
      storeCount: 0,
    });
    expect(getAccessStatusMock.mock.calls[0][3]).toBe(STORE_ID);
  });

  it("lets unscoped no-subscription and scoped co-owner write access coexist on the same tree", async () => {
    mockAccessByStoreId();
    getUserStoreCountMock.mockResolvedValue(0);

    let latest: { unscoped: AccessHookValue; scoped: AccessHookValue } | undefined;
    mount(
      <DualAccessProbe
        storeId={STORE_ID}
        onRender={(value) => {
          latest = value;
        }}
      />
    );

    await waitFor(() => {
      expect(latest?.unscoped.loading).toBe(false);
      expect(latest?.scoped.loading).toBe(false);
    });

    expect(latest?.unscoped).toMatchObject({
      isReadOnly: true,
      reason: "no_subscription",
      plan: null,
      maxStores: 0,
      storeCount: 0,
    });
    expect(latest?.scoped).toMatchObject({
      isReadOnly: false,
      reason: "active",
      plan: null,
      maxStores: null,
      storeCount: 0,
    });
  });

  it("shares one access fetch across two hooks with the same store id", async () => {
    getAccessStatusMock.mockResolvedValue(CO_OWNER_WRITE);
    getUserStoreCountMock.mockResolvedValue(0);

    let latest: { first: AccessHookValue; second: AccessHookValue } | undefined;
    mount(
      <SameScopeProbe
        onRender={(value) => {
          latest = value;
        }}
      />
    );

    await waitFor(() => {
      expect(latest?.first.loading).toBe(false);
      expect(latest?.second.loading).toBe(false);
    });

    expect(latest?.first.isReadOnly).toBe(false);
    expect(latest?.second.isReadOnly).toBe(false);
    expect(getAccessStatusMock).toHaveBeenCalledTimes(1);
    expect(getUserStoreCountMock).toHaveBeenCalledTimes(1);
  });

  it("reuses a fresh cache on remount with the same store id", async () => {
    getAccessStatusMock.mockResolvedValue(STARTER_AT_LIMIT);
    getUserStoreCountMock.mockResolvedValue(1);

    let latest: AccessHookValue | undefined;
    mount(<AccessProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });
    expect(getAccessStatusMock).toHaveBeenCalledTimes(1);

    unmountMounted();
    latest = undefined;
    mount(<AccessProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
      expect(latest?.plan).toBe("starter");
      expect(latest?.storeCount).toBe(1);
    });

    expect(getAccessStatusMock).toHaveBeenCalledTimes(1);
    expect(getUserStoreCountMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after 60s even for the same store id", async () => {
    getAccessStatusMock.mockResolvedValue(STARTER_AT_LIMIT);
    getUserStoreCountMock.mockResolvedValue(1);
    const nowSpy = vi.spyOn(Date, "now");
    const start = 1_700_000_000_000;
    nowSpy.mockReturnValue(start);

    let latest: AccessHookValue | undefined;
    mount(<AccessProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });
    expect(getAccessStatusMock).toHaveBeenCalledTimes(1);

    unmountMounted();
    nowSpy.mockReturnValue(start + REVALIDATE_MS + 1);
    latest = undefined;
    mount(<AccessProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
      expect(getAccessStatusMock).toHaveBeenCalledTimes(2);
    });
  });

  it("refetches after invalidateAccessStatusCache", async () => {
    getAccessStatusMock.mockResolvedValue(STARTER_AT_LIMIT);
    getUserStoreCountMock.mockResolvedValue(1);

    let latest: AccessHookValue | undefined;
    mount(<AccessProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });
    expect(getAccessStatusMock).toHaveBeenCalledTimes(1);

    unmountMounted();
    invalidateAccessStatusCache();
    latest = undefined;
    mount(<AccessProbe onRender={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
      expect(getAccessStatusMock).toHaveBeenCalledTimes(2);
    });
  });

  it("refresh() bypasses the cache and reloads access for the current store id", async () => {
    getAccessStatusMock.mockResolvedValue(NO_SUBSCRIPTION);
    getUserStoreCountMock.mockResolvedValue(0);

    let latest: AccessHookValue | undefined;
    mount(
      <AccessProbe
        storeId={STORE_ID}
        onRender={(value) => {
          latest = value;
        }}
      />
    );

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });
    expect(getAccessStatusMock).toHaveBeenCalledTimes(1);

    getAccessStatusMock.mockResolvedValue(CO_OWNER_WRITE);
    getUserStoreCountMock.mockResolvedValue(0);

    await act(async () => {
      await latest?.refresh();
    });

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
      expect(latest?.isReadOnly).toBe(false);
      expect(latest?.reason).toBe("active");
    });
    expect(getAccessStatusMock).toHaveBeenCalledTimes(2);
    expect(getAccessStatusMock.mock.calls[1][3]).toBe(STORE_ID);
  });
});
