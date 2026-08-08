import { describe, expect, it } from "vitest";
import { getMarketingSignupCtaLabel, MARKETING_FEATURES_HREF } from "@/lib/marketingCta";

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

describe("MARKETING_FEATURES_HREF", () => {
  it("points at the home page features anchor", () => {
    expect(MARKETING_FEATURES_HREF).toBe("/#features");
  });
});
