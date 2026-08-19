import { describe, expect, it, vi } from "vitest";
import {
  completeOnboarding,
  getOnboardingStatus,
  isEligibleForAutoTrial,
  isJoiningOnboardingPath,
  isOnboardingAlreadySavedForPath,
  isOnboardingComplete,
  OnboardingCompletionError,
  type OnboardingProfile,
} from "@/lib/onboarding";

function mockSupabase(profile: OnboardingProfile | null, ownedStoreCount: number) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: profile }),
            }),
          }),
        };
      }
      if (table === "stores") {
        return {
          select: () => ({
            eq: async () => ({ count: ownedStoreCount }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as never;
}

describe("onboarding status", () => {
  it("treats onboarding_completed as complete for own path", async () => {
    const supabase = mockSupabase(
      { onboarding_completed: true, onboarding_path: "own" },
      0
    );
    await expect(isOnboardingComplete(supabase, "user-1")).resolves.toBe(true);
    await expect(getOnboardingStatus(supabase, "user-1")).resolves.toEqual({
      complete: true,
      path: "own",
    });
  });

  it("treats onboarding_path join as complete without owned stores", async () => {
    const supabase = mockSupabase(
      { onboarding_completed: true, onboarding_path: "join" },
      0
    );
    await expect(isOnboardingComplete(supabase, "user-1")).resolves.toBe(true);
    await expect(getOnboardingStatus(supabase, "user-1")).resolves.toEqual({
      complete: true,
      path: "join",
    });
  });

  it("treats join path alone as complete when completed flag is false", async () => {
    const supabase = mockSupabase(
      { onboarding_completed: false, onboarding_path: "join" },
      0
    );
    await expect(isOnboardingComplete(supabase, "user-1")).resolves.toBe(true);
  });

  it("treats owned stores as complete for legacy users", async () => {
    const supabase = mockSupabase(
      { onboarding_completed: false, onboarding_path: null },
      +2
    );
    await expect(isOnboardingComplete(supabase, "user-1")).resolves.toBe(true);
    await expect(getOnboardingStatus(supabase, "user-1")).resolves.toEqual({
      complete: true,
      path: "own",
    });
  });

  it("treats fresh signups as incomplete", async () => {
    const supabase = mockSupabase(
      { onboarding_completed: false, onboarding_path: null },
      0
    );
    await expect(isOnboardingComplete(supabase, "user-1")).resolves.toBe(false);
    await expect(getOnboardingStatus(supabase, "user-1")).resolves.toEqual({
      complete: false,
      path: null,
    });
  });

  it("identifies joining onboarding path", () => {
    expect(isJoiningOnboardingPath("join")).toBe(true);
    expect(isJoiningOnboardingPath("own")).toBe(false);
    expect(isJoiningOnboardingPath(null)).toBe(false);
  });

  it("excludes join-path users from automatic trial grants", () => {
    expect(isEligibleForAutoTrial({ onboarding_path: "join" })).toBe(false);
    expect(isEligibleForAutoTrial({ onboarding_path: "own" })).toBe(true);
    expect(isEligibleForAutoTrial({ onboarding_path: null })).toBe(true);
    expect(isEligibleForAutoTrial(null)).toBe(true);
  });

  it("detects when onboarding is already saved for the intended path", () => {
    expect(
      isOnboardingAlreadySavedForPath(
        { onboarding_completed: true, onboarding_path: "join" },
        "join"
      )
    ).toBe(true);
    expect(
      isOnboardingAlreadySavedForPath(
        { onboarding_completed: false, onboarding_path: "join" },
        "join"
      )
    ).toBe(true);
    expect(
      isOnboardingAlreadySavedForPath(
        { onboarding_completed: true, onboarding_path: "join" },
        "own"
      )
    ).toBe(false);
    expect(isOnboardingAlreadySavedForPath(null, "join")).toBe(false);
  });
});

describe("completeOnboarding", () => {
  it("upserts profile onboarding fields and returns the saved row", async () => {
    const upsert = vi.fn(() => ({
      select: () => ({
        single: async () => ({
          data: {
            id: "user-1",
            onboarding_completed: true,
            onboarding_path: "join",
          },
          error: null,
        }),
      }),
    }));

    const supabase = {
      from(table: string) {
        if (table === "profiles") {
          return { upsert };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as never;

    await expect(completeOnboarding(supabase, "user-1", "join")).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledWith(
      {
        id: "user-1",
        onboarding_completed: true,
        onboarding_path: "join",
      },
      { onConflict: "id" }
    );
  });

  it("throws when upsert returns no row", async () => {
    const supabase = {
      from(table: string) {
        if (table === "profiles") {
          return {
            upsert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as never;

    await expect(completeOnboarding(supabase, "user-1", "join")).rejects.toBeInstanceOf(
      OnboardingCompletionError
    );
  });

  it("throws when upsert returns an error", async () => {
    const supabase = {
      from(table: string) {
        if (table === "profiles") {
          return {
            upsert: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: "permission denied" },
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as never;

    await expect(completeOnboarding(supabase, "user-1", "own")).rejects.toEqual({
      message: "permission denied",
    });
  });
});
