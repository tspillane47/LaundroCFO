import { describe, expect, it, vi } from "vitest";
import { buildUserDataExport } from "@/lib/account-export";

function chain(result: { data?: unknown; error?: { message: string } | null }) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "or", "order", "maybeSingle"]) {
    builder[method] = () => builder;
  }
  builder.then = promise.then.bind(promise);
  builder.catch = promise.catch.bind(promise);
  builder.finally = promise.finally.bind(promise);
  return builder;
}

describe("buildUserDataExport", () => {
  it("assembles export payload without OAuth tokens", async () => {
    const storeId = "store-1";
    const from = vi.fn((table: string) => {
      switch (table) {
        case "profiles":
          return chain({ data: { id: "user-1", full_name: "Alex Owner" }, error: null });
        case "subscriptions":
          return chain({ data: { plan: "pro", status: "active" }, error: null });
        case "stores":
          return chain({
            data: [{ id: storeId, name: "Main Store", user_id: "user-1", created_at: "2025-01-01" }],
            error: null,
          });
        case "store_members":
          return chain({ data: [{ store_id: storeId, user_id: "user-1", role: "Owner" }], error: null });
        case "monthly_financials":
          return chain({ data: [{ store_id: storeId, year: 2025, month: 1, revenue: 1000 }], error: null });
        case "monthly_utilities":
        case "equipment_inventory":
        case "store_loans":
        case "leases":
        case "insurance_policies":
        case "real_estate":
        case "categorization_rules":
        case "bank_transactions":
        case "lease_options":
        case "plaid_accounts":
          return chain({ data: [], error: null });
        case "quickbooks_connections":
          return chain({
            data: [
              {
                id: "qb-1",
                store_id: storeId,
                realm_id: "123",
                connected_at: "2025-01-01",
              },
            ],
            error: null,
          });
        case "plaid_connections":
          return chain({
            data: [
              {
                id: "plaid-1",
                store_id: storeId,
                institution_name: "Chase",
                connected_at: "2025-01-01",
              },
            ],
            error: null,
          });
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    });

    const payload = await buildUserDataExport({ from } as never, "user-1", "alex@example.com");

    expect(payload.email).toBe("alex@example.com");
    expect(payload.stores).toHaveLength(1);
    expect(payload.stores[0].monthlyFinancials).toHaveLength(1);
    expect(payload.stores[0].quickbooksConnections[0]).not.toHaveProperty("access_token");
    expect(payload.stores[0].quickbooksConnections[0]).not.toHaveProperty("refresh_token");
    expect(payload.stores[0].plaidConnections[0]).not.toHaveProperty("plaid_access_token");
  });
});
