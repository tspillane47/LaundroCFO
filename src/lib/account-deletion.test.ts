import { afterEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();
const mockDeleteUser = vi.fn();
const mockRevokeQuickBooksToken = vi.fn();
const mockRemovePlaidItem = vi.fn();
const mockDecryptTokenIfEncrypted = vi.fn((value: string) => value);

vi.mock("@/lib/supabase-admin", () => ({
  createAdminSupabaseClient: () => ({
    from: mockFrom,
    auth: {
      admin: {
        deleteUser: mockDeleteUser,
      },
    },
  }),
}));

vi.mock("@/lib/quickbooks", () => ({
  revokeQuickBooksToken: (...args: unknown[]) => mockRevokeQuickBooksToken(...args),
}));

vi.mock("@/lib/plaid", () => ({
  removePlaidItem: (...args: unknown[]) => mockRemovePlaidItem(...args),
}));

vi.mock("@/lib/tokenEncryption", () => ({
  decryptTokenIfEncrypted: (value: string) => mockDecryptTokenIfEncrypted(value),
}));

function mockConnectionQueries(options: {
  quickbooksRows?: unknown[];
  plaidRows?: unknown[];
  quickbooksError?: { message: string } | null;
  plaidError?: { message: string } | null;
  storesDeleteError?: { message: string } | null;
  deleteUserError?: { message: string } | null;
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "quickbooks_connections") {
      return {
        select: () => ({
          eq: async () => ({
            data: options.quickbooksRows ?? [],
            error: options.quickbooksError ?? null,
          }),
        }),
      };
    }

    if (table === "plaid_connections") {
      return {
        select: () => ({
          eq: async () => ({
            data: options.plaidRows ?? [],
            error: options.plaidError ?? null,
          }),
        }),
      };
    }

    if (table === "stores") {
      return {
        delete: () => ({
          eq: async () => ({ error: options.storesDeleteError ?? null }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("deleteUserAccount", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("revokes QuickBooks and Plaid connections before deleting the user", async () => {
    mockConnectionQueries({
      quickbooksRows: [
        {
          id: "qb-1",
          store_id: "store-1",
          user_id: "user-1",
          refresh_token: "qb-refresh-token",
        },
      ],
      plaidRows: [
        {
          id: "plaid-1",
          store_id: "store-2",
          user_id: "user-1",
          plaid_access_token: "plaid-access-token",
        },
      ],
    });
    mockRevokeQuickBooksToken.mockResolvedValue(undefined);
    mockRemovePlaidItem.mockResolvedValue(undefined);
    mockDeleteUser.mockResolvedValue({ error: null });

    const { deleteUserAccount } = await import("@/lib/account-deletion");
    const result = await deleteUserAccount("user-1");

    expect(mockRevokeQuickBooksToken).toHaveBeenCalledWith("qb-refresh-token");
    expect(mockRemovePlaidItem).toHaveBeenCalledWith("plaid-access-token");
    expect(mockDeleteUser).toHaveBeenCalledWith("user-1");
    expect(result.quickbooksAttempted).toBe(1);
    expect(result.plaidAttempted).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it("continues account deletion when external revoke calls fail", async () => {
    mockConnectionQueries({
      quickbooksRows: [
        {
          id: "qb-1",
          store_id: "store-1",
          user_id: "user-1",
          refresh_token: "qb-refresh-token",
        },
      ],
      plaidRows: [
        {
          id: "plaid-1",
          store_id: "store-2",
          user_id: "user-1",
          plaid_access_token: "plaid-access-token",
        },
      ],
    });
    mockRevokeQuickBooksToken.mockRejectedValue(new Error("Intuit revoke failed"));
    mockRemovePlaidItem.mockRejectedValue(new Error("Plaid item remove failed"));
    mockDeleteUser.mockResolvedValue({ error: null });

    const { deleteUserAccount } = await import("@/lib/account-deletion");
    const result = await deleteUserAccount("user-1");

    expect(mockDeleteUser).toHaveBeenCalledWith("user-1");
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]?.provider).toBe("quickbooks");
    expect(result.failures[1]?.provider).toBe("plaid");
  });
});
