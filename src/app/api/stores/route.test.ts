import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessStatus } from "@/lib/access";

const getUserMock = vi.fn();
const getAccessStatusMock = vi.fn();
const getUserStoreCountMock = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(),
  })),
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

import { POST } from "@/app/api/stores/route";

const USER_ID = "user-123";

const noSubscriptionAccess: AccessStatus = {
  plan: null,
  isReadOnly: true,
  reason: "no_subscription",
  trialEndsAt: null,
  currentPeriodEnd: null,
  maxStores: 0,
};

const starterAtLimitAccess: AccessStatus = {
  plan: "starter",
  isReadOnly: false,
  reason: "active",
  trialEndsAt: null,
  currentPeriodEnd: null,
  maxStores: 1,
};

const activeStarterAccess: AccessStatus = {
  ...starterAtLimitAccess,
  isReadOnly: false,
  reason: "active",
};

function createPostRequest(body: Record<string, unknown> = { name: "Test Store" }) {
  return new Request("http://localhost/api/stores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await POST(createPostRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Unauthorized" });
    expect(getAccessStatusMock).not.toHaveBeenCalled();
  });

  it("returns 403 with subscription_required for read-only users with no subscription", async () => {
    getAccessStatusMock.mockResolvedValue(noSubscriptionAccess);
    getUserStoreCountMock.mockResolvedValue(0);

    const response = await POST(createPostRequest());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("subscription_required");
    expect(payload.message).toContain("Subscribe");
    expect(getAccessStatusMock).toHaveBeenCalledWith(expect.anything(), USER_ID);
    expect(getUserStoreCountMock).toHaveBeenCalledWith(expect.anything(), USER_ID);
  });

  it("returns 403 with store_limit_reached when the plan store cap is met", async () => {
    getAccessStatusMock.mockResolvedValue(starterAtLimitAccess);
    getUserStoreCountMock.mockResolvedValue(1);

    const response = await POST(createPostRequest());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("store_limit_reached");
    expect(payload.message).toContain("Starter plan");
  });

  it("blocks before reading the body when access is denied", async () => {
    getAccessStatusMock.mockResolvedValue(noSubscriptionAccess);
    getUserStoreCountMock.mockResolvedValue(0);

    const response = await POST(
      new Request("http://localhost/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      })
    );

    expect(response.status).toBe(403);
  });

  it("returns 400 when the store name is missing after access passes", async () => {
    getAccessStatusMock.mockResolvedValue(activeStarterAccess);
    getUserStoreCountMock.mockResolvedValue(0);

    const response = await POST(createPostRequest({ name: "   " }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "Store name is required" });
  });
});
