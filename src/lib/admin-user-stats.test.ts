import { describe, expect, it, vi } from "vitest";
import {
  classifyActivationStuckOn,
  computeConfirmationRate,
  countConfirmedSignupsSince,
  fetchAdminUserStats,
  formatConfirmationRate,
  formatFunnelStepLabel,
  isoDaysAgo,
  type ActivationFunnelStepId,
  type AdminStatsFilterQuery,
  type AdminUserStats,
  type AdminUserStatsClient,
  type AuthUserForStats,
} from "@/lib/admin-user-stats";

const NOW = new Date("2026-09-13T18:00:00.000Z");
const STORE_A = "store-old-only";
const STORE_B = "store-recent-bank";
const STORE_C = "store-never-active";
const STORE_D = "store-recent-link";
const STORE_E = "store-recent-manual";
const STORE_F = "store-onboarding-mf";
const STORE_G = "store-returning";
const STORE_H = "store-csv-active";

type ActivityRow = { store_id: string; at: string };

type StoreRow = {
  id: string;
  name: string | null;
  user_id: string | null;
  created_at: string;
};

type ProfileRow = { id: string; created_at: string };

type PlaidRow = { store_id: string; connected_at: string };

function deniedQuery(): AdminStatsFilterQuery {
  const denied = { data: null, count: null, error: { message: "denied" } };
  const query = {
    gte: () => query,
    lt: () => query,
    range: async () => denied,
    then: (resolve: (value: typeof denied) => unknown) => Promise.resolve(denied).then(resolve),
  };
  return query as AdminStatsFilterQuery;
}

function createRowQuery(rows: Record<string, unknown>[]): AdminStatsFilterQuery {
  const make = (): AdminStatsFilterQuery => {
    const countResult = {
      data: rows,
      count: rows.length,
      error: null as { message: string } | null,
    };
    return {
      gte: () => make(),
      lt: () => make(),
      range: async (from: number, to: number) => ({
        data: rows.slice(from, to + 1),
        error: null,
      }),
      then: (resolve: (value: typeof countResult) => unknown) =>
        Promise.resolve(countResult).then(resolve),
    } as AdminStatsFilterQuery;
  };

  return make();
}

function createProfilesQuery(
  options: { total: number; last7: number; last30: number; rows: ProfileRow[] }
): AdminStatsFilterQuery {
  const countFor = (sinceIso?: string) => {
    if (!sinceIso) return options.total;
    const since = new Date(sinceIso).getTime();
    const sevenDaysAgo = NOW.getTime() - 7 * 24 * 60 * 60 * 1000;
    return Math.abs(since - sevenDaysAgo) < 1000 ? options.last7 : options.last30;
  };

  const make = (sinceIso?: string): AdminStatsFilterQuery => {
    const filtered = sinceIso
      ? options.rows.filter((row) => row.created_at >= sinceIso)
      : options.rows;
    const result = { data: filtered, count: countFor(sinceIso), error: null };
    return {
      gte: (_column: string, value: string) => make(value),
      lt: () => make(sinceIso),
      range: async (from: number, to: number) => ({
        data: filtered.slice(from, to + 1),
        error: null,
      }),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    } as AdminStatsFilterQuery;
  };

  return make();
}

function createMockAdmin(options: {
  total: number;
  last7: number;
  last30: number;
  users: AuthUserForStats[];
  pages?: AuthUserForStats[][];
  profiles?: ProfileRow[];
  stores?: StoreRow[];
  plaid?: PlaidRow[];
  bankTransactions?: ActivityRow[];
  plLinks?: ActivityRow[];
  monthlyCreated?: ActivityRow[];
  monthlyOverrides?: ActivityRow[];
}): AdminUserStatsClient {
  return {
    from: (table: string) => ({
      select: () => {
        if (table === "profiles") {
          return createProfilesQuery({
            total: options.total,
            last7: options.last7,
            last30: options.last30,
            rows: options.profiles ?? [],
          });
        }
        if (table === "stores") {
          return createRowQuery(options.stores ?? []);
        }
        if (table === "plaid_connections") {
          return createRowQuery(
            (options.plaid ?? []).map((row) => ({
              store_id: row.store_id,
              connected_at: row.connected_at,
            }))
          );
        }
        if (table === "bank_transactions") {
          return createRowQuery(
            (options.bankTransactions ?? []).map((row) => ({
              store_id: row.store_id,
              created_at: row.at,
            }))
          );
        }
        if (table === "transaction_pl_links") {
          return createRowQuery(
            (options.plLinks ?? []).map((row) => ({
              store_id: row.store_id,
              applied_at: row.at,
            }))
          );
        }
        if (table === "monthly_financials") {
          const created = (options.monthlyCreated ?? []).map((row) => ({
            store_id: row.store_id,
            created_at: row.at,
            manually_overridden_at: null,
          }));
          const overrides = (options.monthlyOverrides ?? []).map((row) => ({
            store_id: row.store_id,
            created_at: null,
            manually_overridden_at: row.at,
          }));
          return createRowQuery([...created, ...overrides]);
        }
        return createRowQuery([]);
      },
    }),
    auth: {
      admin: {
        listUsers: async ({ page }) => {
          const pages = options.pages ?? [options.users];
          return {
            data: { users: pages[page - 1] ?? [] },
            error: null,
          };
        },
      },
    },
  };
}

function funnelCount(stats: AdminUserStats, id: ActivationFunnelStepId): number {
  const step = stats.funnel.steps.find((item) => item.id === id);
  if (!step) throw new Error(`missing funnel step ${id}`);
  return step.count;
}

function funnelMembers(stats: AdminUserStats, id: ActivationFunnelStepId) {
  const step = stats.funnel.steps.find((item) => item.id === id);
  if (!step) throw new Error(`missing funnel step ${id}`);
  return step.members;
}

describe("computeConfirmationRate", () => {
  it("returns null when there are no signups", () => {
    expect(computeConfirmationRate(0, 0)).toBeNull();
  });

  it("returns the confirmed share of total signups", () => {
    expect(computeConfirmationRate(3, 4)).toBe(0.75);
  });
});

describe("formatConfirmationRate", () => {
  it("renders a dash when the rate is unavailable", () => {
    expect(formatConfirmationRate(null)).toBe("—");
  });

  it("renders a rounded percentage", () => {
    expect(formatConfirmationRate(0.8333)).toBe("83%");
  });
});

describe("formatFunnelStepLabel", () => {
  it("renders a dash when the store is fully progressed", () => {
    expect(formatFunnelStepLabel(null)).toBe("—");
  });

  it("renders the step label", () => {
    expect(formatFunnelStepLabel("connected_bank")).toBe("New Bank Connections (7 days)");
  });
});

describe("countConfirmedSignupsSince", () => {
  it("counts only users created in the window and treats missing confirmation as unconfirmed", () => {
    const users: AuthUserForStats[] = [
      { created_at: "2026-09-12T00:00:00.000Z", email_confirmed_at: "2026-09-12T00:05:00.000Z" },
      { created_at: "2026-09-01T00:00:00.000Z", email_confirmed_at: null },
      { created_at: "2026-07-01T00:00:00.000Z", email_confirmed_at: "2026-07-01T00:05:00.000Z" },
    ];

    expect(countConfirmedSignupsSince(users, "2026-08-14T18:00:00.000Z")).toEqual({
      confirmed: 1,
      total: 2,
    });
  });

  it("excludes a late confirmation when the signup itself is older than 30 days", () => {
    const users: AuthUserForStats[] = [
      { created_at: isoDaysAgo(NOW, 10), email_confirmed_at: isoDaysAgo(NOW, 10) },
      { created_at: isoDaysAgo(NOW, 40), email_confirmed_at: isoDaysAgo(NOW, 2) },
    ];

    expect(countConfirmedSignupsSince(users, isoDaysAgo(NOW, 30))).toEqual({
      confirmed: 1,
      total: 1,
    });
  });
});

describe("classifyActivationStuckOn", () => {
  it("labels a user without a store as stuck on Created Store", () => {
    expect(
      classifyActivationStuckOn({
        hasStore: false,
        hasFinancialData: false,
        hasPlaid: false,
        isWeeklyActive: false,
        isReturning: false,
      })
    ).toBe("created_store");
  });

  it("labels a store with no financial data as stuck on Added Financial Data, not Connected Bank", () => {
    expect(
      classifyActivationStuckOn({
        hasStore: true,
        hasFinancialData: false,
        hasPlaid: false,
        isWeeklyActive: false,
        isReturning: false,
      })
    ).toBe("added_financial_data");
  });

  it("does not flag a CSV-only weekly-active store as stuck on Connected Bank", () => {
    expect(
      classifyActivationStuckOn({
        hasStore: true,
        hasFinancialData: true,
        hasPlaid: false,
        isWeeklyActive: true,
        isReturning: false,
      })
    ).toBe("returning");
  });

  it("treats a CSV-only returning store as fully progressed", () => {
    expect(
      classifyActivationStuckOn({
        hasStore: true,
        hasFinancialData: true,
        hasPlaid: false,
        isWeeklyActive: true,
        isReturning: true,
      })
    ).toBeNull();
  });

  it("labels a store with financial data but no recent activity as stuck on Weekly Active Stores", () => {
    expect(
      classifyActivationStuckOn({
        hasStore: true,
        hasFinancialData: true,
        hasPlaid: true,
        isWeeklyActive: false,
        isReturning: false,
      })
    ).toBe("weekly_active");
  });
});

describe("fetchAdminUserStats", () => {
  it("combines profile counts with auth confirmation for the last 30 days", async () => {
    const admin = createMockAdmin({
      total: 20,
      last7: 2,
      last30: 5,
      users: [
        { created_at: isoDaysAgo(NOW, 2), email_confirmed_at: isoDaysAgo(NOW, 2) },
        { created_at: isoDaysAgo(NOW, 10), email_confirmed_at: null },
        { created_at: isoDaysAgo(NOW, 40), email_confirmed_at: isoDaysAgo(NOW, 40) },
      ],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(stats.totalProfiles).toBe(20);
    expect(stats.signups7d).toBe(2);
    expect(stats.signups30d).toBe(5);
    expect(stats.confirmed30d).toBe(1);
    expect(stats.confirmationCohort30d).toBe(2);
    expect(stats.confirmationRate30d).toBe(0.5);
    expect(stats.weeklyActiveStores).toBe(0);
    expect(stats.storesWithFinancialData).toBe(0);
    expect(stats.storesWithPlaidConnection).toBe(0);
    expect(stats.totalStores).toBe(0);
    expect(stats.funnel.windowDays).toBe(7);
    expect(funnelCount(stats, "signed_up")).toBe(2);
    expect(funnelCount(stats, "weekly_active")).toBe(0);
    expect(funnelCount(stats, "returning")).toBe(0);
  });

  it("pages through auth users when computing confirmation", async () => {
    const page = Array.from({ length: 1000 }, (_, index) => ({
      created_at: isoDaysAgo(NOW, 3),
      email_confirmed_at: index % 2 === 0 ? isoDaysAgo(NOW, 3) : null,
    }));
    const lastPage: AuthUserForStats[] = [
      { created_at: isoDaysAgo(NOW, 1), email_confirmed_at: isoDaysAgo(NOW, 1) },
    ];

    const admin = createMockAdmin({
      total: 1,
      last7: 1,
      last30: 1,
      users: [],
      pages: [page, lastPage],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(stats.confirmed30d).toBe(501);
    expect(stats.confirmationRate30d).toBe(501 / 1001);
    expect(stats.weeklyActiveStores).toBe(0);
  });

  it("counts a store with activity in the last 7 days and excludes old-only and never-active stores", async () => {
    const admin = createMockAdmin({
      total: 3,
      last7: 0,
      last30: 0,
      users: [],
      bankTransactions: [
        { store_id: STORE_A, at: isoDaysAgo(NOW, 8) },
        { store_id: STORE_B, at: isoDaysAgo(NOW, 2) },
      ],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(stats.weeklyActiveStores).toBe(1);
    expect(funnelCount(stats, "weekly_active")).toBe(1);
    expect(funnelCount(stats, "added_financial_data")).toBe(1);
    expect(funnelCount(stats, "returning")).toBe(0);
    expect(stats.storesWithFinancialData).toBe(2);
  });

  it("counts a store with only an in-window P&L link or manual override, not 8+ day-old signals", async () => {
    const admin = createMockAdmin({
      total: 1,
      last7: 0,
      last30: 0,
      users: [],
      bankTransactions: [{ store_id: STORE_A, at: isoDaysAgo(NOW, 8) }],
      plLinks: [
        { store_id: STORE_A, at: isoDaysAgo(NOW, 9) },
        { store_id: STORE_D, at: isoDaysAgo(NOW, 1) },
      ],
      monthlyOverrides: [
        { store_id: STORE_A, at: isoDaysAgo(NOW, 10) },
        { store_id: STORE_E, at: isoDaysAgo(NOW, 3) },
        { store_id: STORE_C, at: isoDaysAgo(NOW, 8) },
      ],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(stats.weeklyActiveStores).toBe(2);
    expect(funnelCount(stats, "weekly_active")).toBe(2);
    expect(funnelCount(stats, "returning")).toBe(0);
  });

  it("counts a store only once when it has multiple in-window activity signals", async () => {
    const admin = createMockAdmin({
      total: 1,
      last7: 0,
      last30: 0,
      users: [],
      bankTransactions: [{ store_id: STORE_B, at: isoDaysAgo(NOW, 1) }],
      plLinks: [{ store_id: STORE_B, at: isoDaysAgo(NOW, 1) }],
      monthlyOverrides: [{ store_id: STORE_B, at: isoDaysAgo(NOW, 1) }],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(stats.weeklyActiveStores).toBe(1);
    expect(funnelCount(stats, "weekly_active")).toBe(1);
    expect(funnelCount(stats, "added_financial_data")).toBe(1);
  });

  it("pages through activity rows when computing weekly active stores", async () => {
    const bankTransactions = Array.from({ length: 1001 }, (_, index) => ({
      store_id: index < 1000 ? STORE_B : STORE_D,
      at: isoDaysAgo(NOW, 1),
    }));

    const admin = createMockAdmin({
      total: 1,
      last7: 0,
      last30: 0,
      users: [],
      bankTransactions,
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(stats.weeklyActiveStores).toBe(2);
  });

  it("counts onboarding monthly_financials created_at as added financial data, not weekly active", async () => {
    const admin = createMockAdmin({
      total: 1,
      last7: 0,
      last30: 0,
      users: [],
      monthlyCreated: [{ store_id: STORE_F, at: isoDaysAgo(NOW, 2) }],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(funnelCount(stats, "added_financial_data")).toBe(1);
    expect(stats.weeklyActiveStores).toBe(0);
    expect(stats.storesWithFinancialData).toBe(1);
  });

  it("counts a returning store only when qualifying activity exists in both 7-day windows", async () => {
    const admin = createMockAdmin({
      total: 1,
      last7: 0,
      last30: 0,
      users: [],
      bankTransactions: [
        { store_id: STORE_G, at: isoDaysAgo(NOW, 2) },
        { store_id: STORE_G, at: isoDaysAgo(NOW, 10) },
        { store_id: STORE_B, at: isoDaysAgo(NOW, 1) },
        { store_id: STORE_A, at: isoDaysAgo(NOW, 9) },
      ],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(funnelCount(stats, "weekly_active")).toBe(2);
    expect(funnelCount(stats, "returning")).toBe(1);
    expect(funnelMembers(stats, "returning")[0]?.storeName).toBeNull();
  });

  it("does not treat activity exactly 7 days ago as prior-window activity", async () => {
    const boundary = isoDaysAgo(NOW, 7);
    const admin = createMockAdmin({
      total: 1,
      last7: 0,
      last30: 0,
      users: [],
      bankTransactions: [
        { store_id: STORE_G, at: boundary },
        { store_id: STORE_G, at: isoDaysAgo(NOW, 1) },
      ],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(funnelCount(stats, "weekly_active")).toBe(1);
    expect(funnelCount(stats, "returning")).toBe(0);
  });

  it("counts Connected Bank from Plaid connected_at independently of financial rows", async () => {
    const admin = createMockAdmin({
      total: 1,
      last7: 0,
      last30: 0,
      users: [],
      plaid: [{ store_id: STORE_C, connected_at: isoDaysAgo(NOW, 1) }],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(funnelCount(stats, "connected_bank")).toBe(1);
    expect(funnelCount(stats, "added_financial_data")).toBe(0);
    expect(stats.storesWithFinancialData).toBe(0);
    expect(stats.storesWithPlaidConnection).toBe(1);
  });

  it("counts all-time Plaid connections separately from the 7-day Connected Bank step", async () => {
    const admin = createMockAdmin({
      total: 1,
      last7: 0,
      last30: 0,
      users: [],
      stores: [
        {
          id: STORE_A,
          name: "Old Laundry",
          user_id: null,
          created_at: isoDaysAgo(NOW, 40),
        },
        {
          id: STORE_C,
          name: "Never Active",
          user_id: null,
          created_at: isoDaysAgo(NOW, 20),
        },
      ],
      plaid: [
        { store_id: STORE_A, connected_at: isoDaysAgo(NOW, 20) },
        { store_id: STORE_C, connected_at: isoDaysAgo(NOW, 1) },
      ],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    expect(funnelCount(stats, "connected_bank")).toBe(1);
    expect(stats.storesWithPlaidConnection).toBe(2);
    expect(stats.totalStores).toBe(2);
  });

  it("builds drill-down members and does not mark a CSV-only active store as stuck on Connected Bank", async () => {
    const ownerId = "user-csv";
    const admin = createMockAdmin({
      total: 2,
      last7: 2,
      last30: 2,
      users: [{ id: ownerId, email: "csv@example.com", created_at: isoDaysAgo(NOW, 3) }],
      profiles: [
        { id: ownerId, created_at: isoDaysAgo(NOW, 3) },
        { id: "user-empty", created_at: isoDaysAgo(NOW, 2) },
      ],
      stores: [
        {
          id: STORE_H,
          name: "CSV Laundry",
          user_id: ownerId,
          created_at: isoDaysAgo(NOW, 3),
        },
      ],
      bankTransactions: [
        { store_id: STORE_H, at: isoDaysAgo(NOW, 1) },
        { store_id: STORE_H, at: isoDaysAgo(NOW, 10) },
      ],
    });

    const stats = await fetchAdminUserStats(admin, NOW);
    const csvMember = funnelMembers(stats, "weekly_active").find((member) => member.storeName === "CSV Laundry");
    expect(csvMember).toEqual({
      email: "csv@example.com",
      storeName: "CSV Laundry",
      signupDate: isoDaysAgo(NOW, 3),
      stuckOn: null,
    });
    expect(funnelMembers(stats, "returning")[0]?.stuckOn).toBeNull();

    const signedUp = funnelMembers(stats, "signed_up");
    expect(signedUp).toEqual(
      expect.arrayContaining([
        {
          email: "csv@example.com",
          storeName: "CSV Laundry",
          signupDate: isoDaysAgo(NOW, 3),
          stuckOn: null,
        },
        {
          email: null,
          storeName: null,
          signupDate: isoDaysAgo(NOW, 2),
          stuckOn: "created_store",
        },
      ])
    );
  });

  it("surfaces profile count errors", async () => {
    const admin: AdminUserStatsClient = {
      from: (table: string) => ({
        select: () => {
          if (table === "profiles") return deniedQuery();
          return createRowQuery([]);
        },
      }),
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
        },
      },
    };

    await expect(fetchAdminUserStats(admin, NOW)).rejects.toThrow("denied");
  });
});
