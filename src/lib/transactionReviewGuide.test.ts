import { describe, expect, it } from "vitest";
import {
  TRANSACTION_CATEGORY_GUIDE,
  TRANSACTION_REVIEW_FLOW_STEPS,
  TRANSACTION_REVIEW_TIPS,
} from "@/lib/transactionReviewGuide";

describe("transactionReviewGuide content", () => {
  it("defines the four-step review flow", () => {
    expect(TRANSACTION_REVIEW_FLOW_STEPS).toHaveLength(4);
    expect(TRANSACTION_REVIEW_FLOW_STEPS.map((step) => step.id)).toEqual([
      "import",
      "review",
      "categorize",
      "post",
    ]);
  });

  it("includes the core revenue and utility categories", () => {
    const names = TRANSACTION_CATEGORY_GUIDE.map((item) => item.name);
    expect(names).toContain("Self-Service Revenue");
    expect(names).toContain("Utilities");
    expect(names).toContain("Exclude");
  });

  it("includes condensed review tips for the transactions banner", () => {
    expect(TRANSACTION_REVIEW_TIPS.length).toBeGreaterThanOrEqual(4);
    expect(TRANSACTION_REVIEW_TIPS.some((tip) => tip.includes("Post"))).toBe(true);
  });
});
