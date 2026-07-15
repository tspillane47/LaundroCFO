import { describe, expect, it } from "vitest";
import {
  formatPlaidConnectionLabel,
  isQuickBooksDataSource,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
} from "@/lib/plaid-shared";

describe("Plaid connection guards", () => {
  it("blocks QuickBooks-connected stores", () => {
    expect(isQuickBooksDataSource("quickbooks")).toBe(true);
    expect(isQuickBooksDataSource("manual")).toBe(false);
    expect(isQuickBooksDataSource("bank_import")).toBe(false);
    expect(isQuickBooksDataSource(null)).toBe(false);
  });

  it("uses a clear QuickBooks disconnect message", () => {
    expect(PLAID_QUICKBOOKS_BLOCK_MESSAGE).toBe(
      "Disconnect QuickBooks before connecting Plaid for this store."
    );
  });

  it("falls back to a generic bank label when institution name is missing", () => {
    expect(formatPlaidConnectionLabel(null)).toBe("Bank connected");
    expect(formatPlaidConnectionLabel("")).toBe("Bank connected");
    expect(formatPlaidConnectionLabel("Chase")).toBe("Chase");
  });
});
