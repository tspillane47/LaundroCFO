import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceFullDocument } from "@/lib/navigate-after-auth-change";

describe("replaceFullDocument", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses location.replace so a prefetched middleware redirect cannot be reused", () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });

    replaceFullDocument("/portfolio");

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/portfolio");
  });
});
