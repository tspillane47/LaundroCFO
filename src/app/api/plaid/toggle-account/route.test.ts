import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const verifyUserCanAccessStoreMock = vi.fn();
const togglePlaidAccountInclusionMock = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

vi.mock("@/lib/store-access", () => ({
  verifyUserCanAccessStore: (...args: unknown[]) => verifyUserCanAccessStoreMock(...args),
}));

vi.mock("@/lib/plaidAccountInclusion", () => ({
  PlaidAccountNotFoundError: class PlaidAccountNotFoundError extends Error {
    constructor() {
      super("Bank account not found for this store");
      this.name = "PlaidAccountNotFoundError";
    }
  },
  togglePlaidAccountInclusion: (...args: unknown[]) => togglePlaidAccountInclusionMock(...args),
}));

import { POST } from "@/app/api/plaid/toggle-account/route";

const STORE_ID = "store-1";
const ACCOUNT_ID = "account-1";

function createPostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/plaid/toggle-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/plaid/toggle-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    verifyUserCanAccessStoreMock.mockResolvedValue(true);
    togglePlaidAccountInclusionMock.mockResolvedValue({
      included: false,
      stamped: 0,
      reversed: 0,
      restored: 0,
    });
  });

  it("rejects unauthenticated callers", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await POST(
      createPostRequest({ storeId: STORE_ID, accountId: ACCOUNT_ID, included: false })
    );

    expect(response.status).toBe(401);
    expect(togglePlaidAccountInclusionMock).not.toHaveBeenCalled();
  });

  it("rejects callers who cannot access the store", async () => {
    verifyUserCanAccessStoreMock.mockResolvedValue(false);

    const response = await POST(
      createPostRequest({ storeId: STORE_ID, accountId: ACCOUNT_ID, included: false })
    );

    expect(response.status).toBe(403);
    expect(togglePlaidAccountInclusionMock).not.toHaveBeenCalled();
  });

  it("rejects missing fields", async () => {
    const missingStore = await POST(createPostRequest({ accountId: ACCOUNT_ID, included: false }));
    const missingAccount = await POST(createPostRequest({ storeId: STORE_ID, included: false }));
    const missingIncluded = await POST(
      createPostRequest({ storeId: STORE_ID, accountId: ACCOUNT_ID })
    );

    expect(missingStore.status).toBe(400);
    expect(missingAccount.status).toBe(400);
    expect(missingIncluded.status).toBe(400);
    expect(togglePlaidAccountInclusionMock).not.toHaveBeenCalled();
  });

  it("toggles inclusion after auth and store checks", async () => {
    const response = await POST(
      createPostRequest({ storeId: STORE_ID, accountId: ACCOUNT_ID, included: false })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      included: false,
      stamped: 0,
      reversed: 0,
      restored: 0,
    });
    expect(togglePlaidAccountInclusionMock).toHaveBeenCalledWith({
      storeId: STORE_ID,
      userId: "user-1",
      accountId: ACCOUNT_ID,
      included: false,
    });
  });
});
