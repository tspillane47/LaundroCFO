import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const verifyUserCanAccessStoreMock = vi.fn();
const storeHasQuickBooksConnectionMock = vi.fn();
const reconcileStoreFinancialDataSourceMock = vi.fn();
const exchangePlaidPublicTokenMock = vi.fn();
const upsertPlaidConnectionMock = vi.fn();
const persistPlaidLinkSelectedAccountsMock = vi.fn();
const updateStoreFinancialDataSourceOnPlaidConnectMock = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

vi.mock("@/lib/store-access", () => ({
  verifyUserCanAccessStore: (...args: unknown[]) => verifyUserCanAccessStoreMock(...args),
}));

vi.mock("@/lib/quickbooks", () => ({
  reconcileStoreFinancialDataSourceWithQuickBooksConnection: (...args: unknown[]) =>
    reconcileStoreFinancialDataSourceMock(...args),
  storeHasQuickBooksConnection: (...args: unknown[]) => storeHasQuickBooksConnectionMock(...args),
}));

vi.mock("@/lib/plaid", () => ({
  exchangePlaidPublicToken: (...args: unknown[]) => exchangePlaidPublicTokenMock(...args),
  persistPlaidLinkSelectedAccounts: (...args: unknown[]) =>
    persistPlaidLinkSelectedAccountsMock(...args),
  PLAID_QUICKBOOKS_BLOCK_MESSAGE: "Disconnect QuickBooks before connecting Plaid for this store.",
  updateStoreFinancialDataSourceOnPlaidConnect: (...args: unknown[]) =>
    updateStoreFinancialDataSourceOnPlaidConnectMock(...args),
  upsertPlaidConnection: (...args: unknown[]) => upsertPlaidConnectionMock(...args),
}));

import { POST } from "@/app/api/plaid/exchange-token/route";
import { PLAID_LINK_ACCOUNTS_REQUIRED_MESSAGE } from "@/lib/plaid-shared";

const STORE_ID = "store-1";

function createPostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/plaid/exchange-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/plaid/exchange-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    verifyUserCanAccessStoreMock.mockResolvedValue(true);
    storeHasQuickBooksConnectionMock.mockResolvedValue(false);
    reconcileStoreFinancialDataSourceMock.mockResolvedValue(undefined);
  });

  it("rejects missing or empty selected accounts before exchanging the token", async () => {
    const missing = await POST(
      createPostRequest({ storeId: STORE_ID, public_token: "public-sandbox-1" })
    );
    const empty = await POST(
      createPostRequest({ storeId: STORE_ID, public_token: "public-sandbox-1", accounts: [] })
    );

    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: PLAID_LINK_ACCOUNTS_REQUIRED_MESSAGE });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: PLAID_LINK_ACCOUNTS_REQUIRED_MESSAGE });
    expect(exchangePlaidPublicTokenMock).not.toHaveBeenCalled();
    expect(persistPlaidLinkSelectedAccountsMock).not.toHaveBeenCalled();
  });

  it("persists the selected Link accounts after a successful exchange", async () => {
    exchangePlaidPublicTokenMock.mockResolvedValue({
      accessToken: "access-1",
      itemId: "item-1",
      institutionName: "Community Bank N.A.",
    });
    upsertPlaidConnectionMock.mockResolvedValue({ id: "conn-1" });
    persistPlaidLinkSelectedAccountsMock.mockResolvedValue(undefined);
    updateStoreFinancialDataSourceOnPlaidConnectMock.mockResolvedValue(undefined);

    const response = await POST(
      createPostRequest({
        storeId: STORE_ID,
        public_token: "public-sandbox-1",
        accounts: [
          {
            id: "acc-1",
            name: "CKCARBUS 0001",
            mask: "1884",
            type: "depository",
            subtype: "checking",
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(persistPlaidLinkSelectedAccountsMock).toHaveBeenCalledWith({
      connectionId: "conn-1",
      storeId: STORE_ID,
      accounts: [
        {
          plaid_account_id: "acc-1",
          account_name: "CKCARBUS 0001",
          mask: "1884",
          account_type: "depository",
          account_subtype: "checking",
        },
      ],
    });
  });
});
