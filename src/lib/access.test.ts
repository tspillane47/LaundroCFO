import { describe, expect, it } from "vitest";
import {
  canAddStore,
  getAccessStatus,
  storeLimitUpgradeMessage,
  type AccessStatus,
} from "@/lib/access";
import type { PlanKey } from "@/lib/beta";

type MockSupabaseOptions = {
  betaMode?: boolean;
  subscription?: {
    plan: PlanKey;
    status: string;
    trial_ends_at: string | null;
  } | null;
  subscriptionError?: boolean;
  betaError?: boolean;
  store?: { user_id: string } | null;
  storeError?: boolean;
  userCanWriteStore?: boolean;
  rpcError?: boolean;
};

function createMockSupabase(options: MockSupabaseOptions = {}) {
  const betaMode = options.betaMode ?? false;

  return {
    from(table: string) {
      if (table === "app_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (options.betaError) {
                  return { data: null, error: { message: "beta read failed" } };
                }
                return { data: { value: betaMode }, error: null };
              },
            }),
          }),
        };
      }

      if (table === "stores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (options.storeError) {
                  return { data: null, error: { message: "store read failed" } };
                }
                return { data: options.store ?? null, error: null };
              },
            }),
          }),
        };
      }

      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (options.subscriptionError) {
                  return { data: null, error: { message: "subscription read failed" } };
                }
                return { data: options.subscription ?? null, error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc(fn: string) {
      if (fn !== "user_can_write_store") {
        throw new Error(`Unexpected rpc: ${fn}`);
      }
      return Promise.resolve({
        data: options.rpcError ? null : (options.userCanWriteStore ?? false),
        error: options.rpcError ? { message: "rpc failed" } : null,
      });
    },
  } as never;
}

const USER_ID = "user-123";
const OWNER_ID = "owner-456";
const STORE_ID = "store-789";
const NOW = new Date("2026-07-05T12:00:00.000Z");

describe("getAccessStatus", () => {
  it("returns beta access when beta_mode is true", async () => {
    const result = await getAccessStatus(createMockSupabase({ betaMode: true }), USER_ID, NOW);

    expect(result).toEqual({
      plan: null,
      isReadOnly: false,
      reason: "beta",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: null,
    });
  });

  it("treats app_settings read errors as beta off and falls back to subscription access", async () => {
    const result = await getAccessStatus(
      createMockSupabase({
        betaError: true,
        subscription: {
          plan: "pro",
          status: "active",
          trial_ends_at: null,
        },
      }),
      USER_ID,
      NOW
    );

    expect(result.reason).toBe("active");
    expect(result.isReadOnly).toBe(false);
  });

  it("returns active access for an active subscription", async () => {
    const result = await getAccessStatus(
      createMockSupabase({
        betaMode: false,
        subscription: {
          plan: "pro",
          status: "active",
          trial_ends_at: null,
        },
      }),
      USER_ID,
      NOW
    );

    expect(result).toEqual({
      plan: "pro",
      isReadOnly: false,
      reason: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: 3,
    });
  });

  it("returns trialing access while trial is still active", async () => {
    const result = await getAccessStatus(
      createMockSupabase({
        betaMode: false,
        subscription: {
          plan: "starter",
          status: "trialing",
          trial_ends_at: "2026-07-20T00:00:00.000Z",
        },
      }),
      USER_ID,
      NOW
    );

    expect(result.plan).toBe("starter");
    expect(result.isReadOnly).toBe(false);
    expect(result.reason).toBe("trialing");
    expect(result.maxStores).toBe(1);
    expect(result.trialEndsAt?.toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });

  it("returns trial_expired when trialing past trial_ends_at", async () => {
    const result = await getAccessStatus(
      createMockSupabase({
        betaMode: false,
        subscription: {
          plan: "starter",
          status: "trialing",
          trial_ends_at: "2026-07-01T00:00:00.000Z",
        },
      }),
      USER_ID,
      NOW
    );

    expect(result.isReadOnly).toBe(true);
    expect(result.reason).toBe("trial_expired");
    expect(result.maxStores).toBe(1);
  });

  it("returns canceled access for canceled subscriptions", async () => {
    const result = await getAccessStatus(
      createMockSupabase({
        betaMode: false,
        subscription: {
          plan: "growth",
          status: "canceled",
          trial_ends_at: null,
        },
      }),
      USER_ID,
      NOW
    );

    expect(result).toMatchObject({
      plan: "growth",
      isReadOnly: true,
      reason: "canceled",
      maxStores: null,
    });
  });

  it("returns past_due access for past_due subscriptions", async () => {
    const result = await getAccessStatus(
      createMockSupabase({
        betaMode: false,
        subscription: {
          plan: "pro",
          status: "past_due",
          trial_ends_at: null,
        },
      }),
      USER_ID,
      NOW
    );

    expect(result).toMatchObject({
      plan: "pro",
      isReadOnly: true,
      reason: "past_due",
      maxStores: 3,
    });
  });

  it("returns no_subscription when no subscription row exists", async () => {
    const result = await getAccessStatus(
      createMockSupabase({ betaMode: false, subscription: null }),
      USER_ID,
      NOW
    );

    expect(result).toEqual({
      plan: null,
      isReadOnly: true,
      reason: "no_subscription",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: 0,
    });
  });

  it("checks the caller subscription when storeId belongs to the caller", async () => {
    const result = await getAccessStatus(
      createMockSupabase({
        betaMode: false,
        store: { user_id: USER_ID },
        subscription: {
          plan: "pro",
          status: "active",
          trial_ends_at: null,
        },
      }),
      USER_ID,
      NOW,
      STORE_ID
    );

    expect(result.isReadOnly).toBe(false);
    expect(result.reason).toBe("active");
    expect(result.plan).toBe("pro");
  });

  it("grants write access to co-owners via user_can_write_store when owner is subscribed", async () => {
    const result = await getAccessStatus(
      createMockSupabase({
        betaMode: false,
        store: { user_id: OWNER_ID },
        subscription: null,
        userCanWriteStore: true,
      }),
      USER_ID,
      NOW,
      STORE_ID
    );

    expect(result).toEqual({
      plan: null,
      isReadOnly: false,
      reason: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: null,
    });
  });

  it("keeps unscoped subscription access distinct from co-owner store write access for the same user", async () => {
    const supabase = createMockSupabase({
      betaMode: false,
      store: { user_id: OWNER_ID },
      subscription: null,
      userCanWriteStore: true,
    });

    const unscoped = await getAccessStatus(supabase, USER_ID, NOW, null);
    const scoped = await getAccessStatus(supabase, USER_ID, NOW, STORE_ID);

    expect(unscoped).toEqual({
      plan: null,
      isReadOnly: true,
      reason: "no_subscription",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: 0,
    });
    expect(scoped).toEqual({
      plan: null,
      isReadOnly: false,
      reason: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: null,
    });
    expect(canAddStore(unscoped, 0)).toBe(false);
    expect(scoped.isReadOnly).toBe(false);
  });

  it("blocks co-owners when user_can_write_store returns false", async () => {
    const result = await getAccessStatus(
      createMockSupabase({
        betaMode: false,
        store: { user_id: OWNER_ID },
        userCanWriteStore: false,
      }),
      USER_ID,
      NOW,
      STORE_ID
    );

    expect(result.isReadOnly).toBe(true);
    expect(result.reason).toBe("no_subscription");
  });
});

describe("store limits", () => {
  it("blocks store creation when access is read-only, even under the store limit", () => {
    const trialExpiredAccess: AccessStatus = {
      plan: "starter",
      isReadOnly: true,
      reason: "trial_expired",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: 1,
    };

    expect(canAddStore(trialExpiredAccess, 0)).toBe(false);
  });

  it("blocks store creation for read-only growth plans with unlimited stores", () => {
    const canceledGrowthAccess: AccessStatus = {
      plan: "growth",
      isReadOnly: true,
      reason: "canceled",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: null,
    };

    expect(canAddStore(canceledGrowthAccess, 0)).toBe(false);
  });

  it("blocks store creation with no subscription", () => {
    const noSubscriptionAccess: AccessStatus = {
      plan: null,
      isReadOnly: true,
      reason: "no_subscription",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: 0,
    };

    expect(canAddStore(noSubscriptionAccess, 0)).toBe(false);
  });

  it("blocks adding stores at the plan limit but not below it", () => {
    const starterAccess: AccessStatus = {
      plan: "starter",
      isReadOnly: false,
      reason: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: 1,
    };

    expect(canAddStore(starterAccess, 0)).toBe(true);
    expect(canAddStore(starterAccess, 1)).toBe(false);
    expect(storeLimitUpgradeMessage("starter")).toContain("Starter plan");
  });

  it("allows unlimited stores on growth", () => {
    const growthAccess: AccessStatus = {
      plan: "growth",
      isReadOnly: false,
      reason: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      maxStores: null,
    };

    expect(canAddStore(growthAccess, 100)).toBe(true);
  });
});
