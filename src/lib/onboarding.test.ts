import { describe, expect, it } from "vitest";
import {
  getOnboardingStatus,
  isEligibleForAutoTrial,
  isJoiningOnboardingPath,
  isOnboardingComplete,
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
});
