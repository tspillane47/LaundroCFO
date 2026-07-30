import { describe, expect, it } from "vitest";
import { TEXT_LIMITS, trimToMaxLength, validateMaxLength } from "@/lib/textLimits";

describe("textLimits", () => {
  it("validates max length", () => {
    expect(validateMaxLength("abc", 5, "Note")).toBeNull();
    expect(validateMaxLength("abcdef", 5, "Note")).toBe("Note must be 5 characters or fewer.");
  });

  it("trims to max length without throwing", () => {
    expect(trimToMaxLength("abcdef", 5)).toBe("abcde");
    expect(trimToMaxLength("abc", 5)).toBe("abc");
  });

  it("exports the expected limits", () => {
    expect(TEXT_LIMITS.transactionNote).toBe(500);
    expect(TEXT_LIMITS.vendorPattern).toBe(200);
    expect(TEXT_LIMITS.feedbackMessage).toBe(2000);
    expect(TEXT_LIMITS.notesField).toBe(1000);
  });
});
