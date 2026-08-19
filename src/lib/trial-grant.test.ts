import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TRIAL_PLAN, TRIAL_LENGTH_DAYS } from "@/lib/beta";
import {
  buildAutoTrialSubscriptionRow,
  ensureAutoTrialSubscription,
} from "@/lib/trial-grant";

type MockAdminOptions = {
  existingUserId?: string | null;
  selectError?: boolean;
  insertError?: { code: string; message: string } | null;
};

function createMockAdmin(options: MockAdminOptions = {}) {
  const inserts: unknown[] = [];

  return {
    admin: {
      from(table: string) {
        if (table !== "subscriptions") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (options.selectError) {
                  return { data: null, error: { message: "select failed" } };
                }
                return {
                  data: options.existingUserId ? { user_id: options.existingUserId } : null,
                  error: null,
                };
              },
            }),
          }),
          insert: async (row: unknown) => {
            inserts.push(row);
            if (options.insertError) {
              return { data: null, error: options.insertError };
            }
            return { data: row, error: null };
          },
        };
      },
    } as never,
    inserts,
  };
}

const USER_ID = "user-abc";
const FIXED_NOW = new Date("2026-08-19T12:00:00.000Z");
const FIXED_TRIAL_ENDS_AT = "2026-09-02T12:00:00.000Z";

describe("buildAutoTrialSubscriptionRow", () => {
  it("matches the end-beta batch grant shape", () => {
    expect(buildAutoTrialSubscriptionRow(USER_ID, FIXED_TRIAL_ENDS_AT)).toEqual({
      user_id: USER_ID,
      plan: DEFAULT_TRIAL_PLAN,
      status: "trialing",
      trial_ends_at: FIXED_TRIAL_ENDS_AT,
    });
  });
});

describe("ensureAutoTrialSubscription", () => {
  it("creates a Starter trialing row when eligible and none exists", async () => {
    const { admin, inserts } = createMockAdmin();

    const result = await ensureAutoTrialSubscription(
      admin,
      USER_ID,
      { onboarding_path: null },
      { now: FIXED_NOW, trialEndsAt: FIXED_TRIAL_ENDS_AT }
    );

    expect(result).toEqual({ granted: true, reason: "created" });
    expect(inserts).toEqual([
      {
        user_id: USER_ID,
        plan: "starter",
        status: "trialing",
        trial_ends_at: FIXED_TRIAL_ENDS_AT,
      },
    ]);
  });

  it("uses trialEndsAtFromNow when trialEndsAt is not provided", async () => {
    const { admin, inserts } = createMockAdmin();

    await ensureAutoTrialSubscription(admin, USER_ID, { onboarding_path: "own" }, {
      now: FIXED_NOW,
    });

    const inserted = inserts[0] as { trial_ends_at: string };
    const expected = new Date(FIXED_NOW);
    expected.setUTCDate(expected.getUTCDate() + TRIAL_LENGTH_DAYS);
    expect(inserted.trial_ends_at).toBe(expected.toISOString());
  });

  it("skips join-path users", async () => {
    const { admin, inserts } = createMockAdmin();

    const result = await ensureAutoTrialSubscription(admin, USER_ID, {
      onboarding_path: "join",
    });

    expect(result).toEqual({ granted: false, reason: "join_path" });
    expect(inserts).toHaveLength(0);
  });

  it("does not insert when a subscription row already exists", async () => {
    const { admin, inserts } = createMockAdmin({ existingUserId: USER_ID });

    const result = await ensureAutoTrialSubscription(admin, USER_ID, {
      onboarding_path: "own",
    });

    expect(result).toEqual({ granted: false, reason: "already_subscribed" });
    expect(inserts).toHaveLength(0);
  });

  it("treats concurrent unique violations as already subscribed", async () => {
    const { admin, inserts } = createMockAdmin({
      insertError: { code: "23505", message: "duplicate key value" },
    });

    const result = await ensureAutoTrialSubscription(admin, USER_ID, {
      onboarding_path: null,
    });

    expect(result).toEqual({ granted: false, reason: "already_subscribed" });
    expect(inserts).toHaveLength(1);
  });

  it("returns insert_failed for non-unique insert errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = createMockAdmin({
      insertError: { code: "42501", message: "permission denied" },
    });

    const result = await ensureAutoTrialSubscription(admin, USER_ID, {
      onboarding_path: null,
    });

    expect(result).toEqual({ granted: false, reason: "insert_failed" });
    consoleError.mockRestore();
  });

  it("handles concurrent double-insert: second caller sees already subscribed", async () => {
    let inserted = false;

    const admin = {
      from(table: string) {
        if (table !== "subscriptions") throw new Error(`Unexpected table: ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: inserted ? { user_id: USER_ID } : null,
                error: null,
              }),
            }),
          }),
          insert: async (row: unknown) => {
            if (inserted) {
              return { data: null, error: { code: "23505", message: "duplicate key" } };
            }
            inserted = true;
            return { data: row, error: null };
          },
        };
      },
    } as never;

    const first = await ensureAutoTrialSubscription(admin, USER_ID, { onboarding_path: null });
    const second = await ensureAutoTrialSubscription(admin, USER_ID, { onboarding_path: null });

    expect(first).toEqual({ granted: true, reason: "created" });
    expect(second).toEqual({ granted: false, reason: "already_subscribed" });
  });
});
