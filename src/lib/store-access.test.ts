import { describe, expect, it, vi } from "vitest";
import { fetchAccessibleStores, ownedBySubtitle, type StoreRow } from "@/lib/store-access";

const OWNER_ID = "owner-1";
const CO_OWNER_ID = "co-owner-2";
const OTHER_OWNER_ID = "owner-3";

const OWNED_STORE: StoreRow = {
  id: "store-owned",
  name: "My Store",
  user_id: OWNER_ID,
  created_at: "2026-01-01T00:00:00.000Z",
};

const SHARED_STORE: StoreRow = {
  id: "store-shared",
  name: "Partner Store",
  user_id: OTHER_OWNER_ID,
  created_at: "2026-01-02T00:00:00.000Z",
};

const SECOND_SHARED_STORE: StoreRow = {
  id: "store-shared-2",
  name: "Second Partner Store",
  user_id: OTHER_OWNER_ID,
  created_at: "2026-01-03T00:00:00.000Z",
};

type LabelRow = { user_id: string; full_name: string | null; email: string | null };

function createMockSupabase(options: {
  userId: string | null;
  stores: StoreRow[];
  labels?: LabelRow[];
}) {
  const storesBuilder = {
    select() {
      return this;
    },
    or() {
      return this;
    },
    order() {
      return this;
    },
    then(onFulfilled: (value: { data: StoreRow[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: options.stores, error: null }).then(onFulfilled, onRejected);
    },
  };

  const rpc = vi.fn(async (fn: string, args?: { owner_ids?: string[] }) => {
    if (fn !== "store_owner_labels") {
      throw new Error(`Unexpected rpc: ${fn}`);
    }
    return { data: options.labels ?? [], error: null };
  });

  const getUser = vi.fn(async () => ({
    data: { user: options.userId ? { id: options.userId } : null },
    error: null,
  }));

  return {
    from: vi.fn((table: string) => {
      if (table !== "stores") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return storesBuilder;
    }),
    auth: { getUser },
    rpc,
  };
}

describe("fetchAccessibleStores owner labels", () => {
  it("does not call store_owner_labels when the user owns every store", async () => {
    const supabase = createMockSupabase({
      userId: OWNER_ID,
      stores: [OWNED_STORE],
    });

    const { data } = await fetchAccessibleStores(supabase as never);

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(data).toEqual([OWNED_STORE]);
    expect(data?.[0]).not.toHaveProperty("ownerLabel");
    expect(ownedBySubtitle(data![0], OWNER_ID)).toBeNull();
  });

  it("attaches the owner's label for a co-owner via one batched RPC", async () => {
    const supabase = createMockSupabase({
      userId: CO_OWNER_ID,
      stores: [SHARED_STORE, SECOND_SHARED_STORE],
      labels: [{ user_id: OTHER_OWNER_ID, full_name: "Alex Owner", email: "alex@example.com" }],
    });

    const { data } = await fetchAccessibleStores(supabase as never);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("store_owner_labels", {
      owner_ids: [OTHER_OWNER_ID],
    });
    expect(data).toEqual([
      { ...SHARED_STORE, ownerLabel: "Alex Owner" },
      { ...SECOND_SHARED_STORE, ownerLabel: "Alex Owner" },
    ]);
    expect(ownedBySubtitle(data![0], CO_OWNER_ID)).toBe("Owned by Alex Owner");
    expect(ownedBySubtitle(data![1], CO_OWNER_ID)).toBe("Owned by Alex Owner");
  });

  it("falls back to email when the owner has no full_name", async () => {
    const supabase = createMockSupabase({
      userId: CO_OWNER_ID,
      stores: [SHARED_STORE],
      labels: [{ user_id: OTHER_OWNER_ID, full_name: null, email: "alex@example.com" }],
    });

    const { data } = await fetchAccessibleStores(supabase as never);

    expect(data?.[0]).toMatchObject({ ownerLabel: "alex@example.com" });
    expect(ownedBySubtitle(data![0], CO_OWNER_ID)).toBe("Owned by alex@example.com");
  });

  it("labels only co-owned stores in a mixed owned + shared portfolio", async () => {
    const supabase = createMockSupabase({
      userId: OWNER_ID,
      stores: [OWNED_STORE, SHARED_STORE],
      labels: [{ user_id: OTHER_OWNER_ID, full_name: "Alex Owner", email: "alex@example.com" }],
    });

    const { data } = await fetchAccessibleStores(supabase as never);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("store_owner_labels", {
      owner_ids: [OTHER_OWNER_ID],
    });
    expect(data?.[0]).toEqual(OWNED_STORE);
    expect(data?.[0]).not.toHaveProperty("ownerLabel");
    expect(ownedBySubtitle(data![0], OWNER_ID)).toBeNull();
    expect(data?.[1]).toMatchObject({ id: "store-shared", ownerLabel: "Alex Owner" });
    expect(ownedBySubtitle(data![1], OWNER_ID)).toBe("Owned by Alex Owner");
  });
});

describe("ownedBySubtitle", () => {
  it("returns nothing for a store the current user owns, even if a label is present", () => {
    expect(
      ownedBySubtitle({ user_id: OWNER_ID, ownerLabel: "Should Not Show" }, OWNER_ID)
    ).toBeNull();
  });
});
