/** @vitest-environment happy-dom */

import React, { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, fetchAccessibleStoresMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fetchAccessibleStoresMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

vi.mock("@/lib/store-access", () => ({
  fetchAccessibleStores: (...args: unknown[]) => fetchAccessibleStoresMock(...args),
}));

import { StoreProvider, useStores } from "@/lib/store-context";

const USER_ID = "user-123";
const SELECTED_STORE_STORAGE_KEY = "laundrocfo:selected-store-id";

const STORE_A = { id: "store-a", name: "Alpha", created_at: "2026-01-01T00:00:00.000Z" };
const STORE_B = { id: "store-b", name: "Beta", created_at: "2026-01-02T00:00:00.000Z" };

type StoresValue = ReturnType<typeof useStores>;

function StoresProbe({ onRender }: { onRender: (value: StoresValue) => void }) {
  onRender(useStores());
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

function mockSignedInUser() {
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID, email: "owner@example.com" } } });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  getUserMock.mockReset();
  fetchAccessibleStoresMock.mockReset();
  fromMock.mockReset();
  fromMock.mockImplementation(() => {
    throw new Error("StoreProvider must not query stores directly");
  });
  sessionStorage.clear();
  mockSignedInUser();
  fetchAccessibleStoresMock.mockResolvedValue({ data: [] });
});

afterEach(() => {
  unmountMounted();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("StoreProvider", () => {
  it("stops after getUser and does not load stores when there is no signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    let latest: StoresValue | undefined;
    mount(
      <StoreProvider>
        <StoresProbe onRender={(value) => { latest = value; }} />
      </StoreProvider>
    );

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest?.stores).toEqual([]);
    expect(latest?.selectedStore).toBeNull();
    expect(latest?.isAllStores).toBe(true);
    expect(fetchAccessibleStoresMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("loads stores through fetchAccessibleStores for a signed-in user", async () => {
    fetchAccessibleStoresMock.mockResolvedValue({ data: [STORE_A, STORE_B] });

    let latest: StoresValue | undefined;
    mount(
      <StoreProvider>
        <StoresProbe onRender={(value) => { latest = value; }} />
      </StoreProvider>
    );

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest?.stores).toEqual([STORE_A, STORE_B]);
    expect(fetchAccessibleStoresMock).toHaveBeenCalledTimes(1);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("auto-selects the only accessible store", async () => {
    fetchAccessibleStoresMock.mockResolvedValue({ data: [STORE_A] });

    let latest: StoresValue | undefined;
    mount(
      <StoreProvider>
        <StoresProbe onRender={(value) => { latest = value; }} />
      </StoreProvider>
    );

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest?.selectedStore).toEqual(STORE_A);
    expect(latest?.isAllStores).toBe(false);
  });

  it("restores the persisted store id when multiple stores are accessible", async () => {
    sessionStorage.setItem(SELECTED_STORE_STORAGE_KEY, STORE_B.id);
    fetchAccessibleStoresMock.mockResolvedValue({ data: [STORE_A, STORE_B] });

    let latest: StoresValue | undefined;
    mount(
      <StoreProvider>
        <StoresProbe onRender={(value) => { latest = value; }} />
      </StoreProvider>
    );

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest?.selectedStore).toEqual(STORE_B);
    expect(latest?.isAllStores).toBe(false);
  });

  it("keeps All Stores selected when multiple stores exist and none are persisted", async () => {
    fetchAccessibleStoresMock.mockResolvedValue({ data: [STORE_A, STORE_B] });

    let latest: StoresValue | undefined;
    mount(
      <StoreProvider>
        <StoresProbe onRender={(value) => { latest = value; }} />
      </StoreProvider>
    );

    await waitFor(() => {
      expect(latest?.loading).toBe(false);
    });

    expect(latest?.selectedStore).toBeNull();
    expect(latest?.isAllStores).toBe(true);
  });
});
