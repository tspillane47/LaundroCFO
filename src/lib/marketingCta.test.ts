import { describe, expect, it } from "vitest";
import {
  getMarketingBottomSubcopy,
  getMarketingHeroBadge,
  getMarketingHeroSubcopy,
  getMarketingSignupCtaLabel,
  MARKETING_FEATURES_HREF,
} from "@/lib/marketingCta";

describe("getMarketingSignupCtaLabel", () => {
  it("uses beta copy when beta mode is on", () => {
    expect(getMarketingSignupCtaLabel(true)).toBe("Get Started Free");
    expect(getMarketingSignupCtaLabel(true, true)).toBe("Get Started Free →");
  });

  it("uses trial copy when beta mode is off", () => {
    expect(getMarketingSignupCtaLabel(false)).toBe("Start Free Trial");
    expect(getMarketingSignupCtaLabel(false, true)).toBe("Start Free Trial →");
  });
});

describe("marketing hero copy", () => {
  it("uses beta messaging when beta mode is on", () => {
    expect(getMarketingHeroBadge(true)).toContain("Beta");
    expect(getMarketingHeroSubcopy(true)).toContain("Free during beta");
    expect(getMarketingBottomSubcopy(true)).toContain("Free during beta");
  });

  it("uses trial messaging when beta mode is off", () => {
    expect(getMarketingHeroBadge(false)).toContain("Free Trial");
    expect(getMarketingHeroSubcopy(false)).toContain("14-day free trial");
    expect(getMarketingBottomSubcopy(false)).toContain("Start your free trial");
  });
});

describe("MARKETING_FEATURES_HREF", () => {
  it("points at the home page features anchor", () => {
    expect(MARKETING_FEATURES_HREF).toBe("/#features");
  });
});
