import { describe, expect, it } from "vitest";
import {
  normalizeStoreCondition,
  parseCanonicalStoreCondition,
  validateStoreCondition,
} from "@/lib/formHelpers";

describe("normalizeStoreCondition", () => {
  it("maps average to fair", () => {
    expect(normalizeStoreCondition("average")).toBe("fair");
    expect(normalizeStoreCondition("Average")).toBe("fair");
  });

  it("keeps the four canonical values", () => {
    expect(normalizeStoreCondition("excellent")).toBe("excellent");
    expect(normalizeStoreCondition("good")).toBe("good");
    expect(normalizeStoreCondition("fair")).toBe("fair");
    expect(normalizeStoreCondition("poor")).toBe("poor");
  });

  it("maps remodeled and needs_renovation aliases", () => {
    expect(normalizeStoreCondition("remodeled")).toBe("excellent");
    expect(normalizeStoreCondition("needs_renovation")).toBe("poor");
  });

  it("maps null, empty, and unknown values to fair", () => {
    expect(normalizeStoreCondition(null)).toBe("fair");
    expect(normalizeStoreCondition(undefined)).toBe("fair");
    expect(normalizeStoreCondition("")).toBe("fair");
    expect(normalizeStoreCondition("  ")).toBe("fair");
    expect(normalizeStoreCondition("mediocre")).toBe("fair");
  });
});

describe("parseCanonicalStoreCondition / validateStoreCondition", () => {
  it("accepts only the four canonical values", () => {
    expect(parseCanonicalStoreCondition("excellent")).toBe("excellent");
    expect(parseCanonicalStoreCondition("Good")).toBe("good");
    expect(parseCanonicalStoreCondition(" fair ")).toBe("fair");
    expect(parseCanonicalStoreCondition("poor")).toBe("poor");
    expect(validateStoreCondition("good")).toBeNull();
  });

  it("rejects average and other legacy/invalid values so they cannot be saved", () => {
    expect(parseCanonicalStoreCondition("average")).toBeNull();
    expect(parseCanonicalStoreCondition("remodeled")).toBeNull();
    expect(parseCanonicalStoreCondition("needs_renovation")).toBeNull();
    expect(parseCanonicalStoreCondition(null)).toBeNull();
    expect(parseCanonicalStoreCondition("")).toBeNull();
    expect(validateStoreCondition("average")).toMatch(/Excellent, Good, Fair, or Poor/);
  });
});
