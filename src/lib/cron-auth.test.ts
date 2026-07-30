import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { verifyCronRequest } from "@/lib/cron-auth";

describe("verifyCronRequest", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("returns null for a valid bearer token", () => {
    const request = new Request("http://localhost/api/cron/sync-integrations", {
      headers: { authorization: "Bearer test-cron-secret" },
    });

    expect(verifyCronRequest(request)).toBeNull();
  });

  it("returns 401 when the bearer token is missing or wrong", async () => {
    const missing = new Request("http://localhost/api/cron/sync-integrations");
    const wrong = new Request("http://localhost/api/cron/sync-integrations", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    expect((await verifyCronRequest(missing)?.json()) as { error: string }).toEqual({
      error: "Unauthorized",
    });
    expect((await verifyCronRequest(wrong)?.json()) as { error: string }).toEqual({
      error: "Unauthorized",
    });
  });

  it("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const request = new Request("http://localhost/api/cron/sync-integrations", {
      headers: { authorization: "Bearer test-cron-secret" },
    });

    expect((await verifyCronRequest(request)?.json()) as { error: string }).toEqual({
      error: "Cron secret not configured",
    });
  });
});

describe("extractPlaidApiErrorBody", () => {
  it("extracts Plaid error fields from axios-like errors", async () => {
    const { extractPlaidApiErrorBody } = await import("@/lib/plaid");
    const error = {
      response: {
        status: 400,
        data: {
          error_code: "ITEM_LOGIN_REQUIRED",
          error_message: "the login details of this item have changed",
          display_message: "Please reconnect your bank account.",
        },
      },
    };

    expect(extractPlaidApiErrorBody(error)).toEqual({
      error_code: "ITEM_LOGIN_REQUIRED",
      error_message: "the login details of this item have changed",
      display_message: "Please reconnect your bank account.",
    });
  });
});
