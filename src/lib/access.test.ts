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
  } as never;
}

const USER_ID = "user-123";
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
});

describe("store limits", () => {
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
