import { describe, expect, it } from "vitest";
import { parseBetaSettingValue, resolveBetaModeFromQuery } from "@/lib/beta";

describe("parseBetaSettingValue", () => {
  it("parses boolean and string jsonb values", () => {
    expect(parseBetaSettingValue(true)).toBe(true);
    expect(parseBetaSettingValue(false)).toBe(false);
    expect(parseBetaSettingValue("true")).toBe(true);
    expect(parseBetaSettingValue("false")).toBe(false);
  });

  it("fails closed to beta off for missing or unrecognized values", () => {
    expect(parseBetaSettingValue(null)).toBe(false);
    expect(parseBetaSettingValue(undefined)).toBe(false);
    expect(parseBetaSettingValue("yes")).toBe(false);
  });
});

describe("resolveBetaModeFromQuery", () => {
  it("returns false when the query errors", () => {
    expect(resolveBetaModeFromQuery({ data: null, error: { message: "denied" } })).toBe(false);
  });

  it("returns false when the row is missing", () => {
    expect(resolveBetaModeFromQuery({ data: null, error: null })).toBe(false);
  });

  it("returns true when beta_mode is true in the database", () => {
    expect(resolveBetaModeFromQuery({ data: { value: false }, error: null })).toBe(false);
    expect(resolveBetaModeFromQuery({ data: { value: true }, error: null })).toBe(true);
  });
});
