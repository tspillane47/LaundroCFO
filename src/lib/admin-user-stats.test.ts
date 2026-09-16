import { describe, expect, it, vi } from "vitest";
import {
  computeConfirmationRate,
  countConfirmedSignupsSince,
  fetchAdminUserStats,
  formatConfirmationRate,
  isoDaysAgo,
  type AdminStatsFilterQuery,
  type AdminUserStatsClient,
  type AuthUserForStats,
} from "@/lib/admin-user-stats";

const NOW = new Date("2026-09-13T18:00:00.000Z");
const STORE_A = "store-old-only";
const STORE_B = "store-recent-bank";
const STORE_C = "store-never-active";
const STORE_D = "store-recent-link";
const STORE_E = "store-recent-manual";

type ActivityRow = { store_id: string; at: string };

function deniedQuery(): AdminStatsFilterQuery {
  const denied = { data: null, count: null, error: { message: "denied" } };
  const query = {
    gte: () => query,
    range: async () => denied,
    then: (resolve: (value: typeof denied) => unknown) => Promise.resolve(denied).then(resolve),
  };
  return query as AdminStatsFilterQuery;
}

function createActivityQuery(rows: ActivityRow[]): AdminStatsFilterQuery {
  const pageFor = (since: string | undefined, from = 0, to = Number.POSITIVE_INFINITY) => {
    const filtered = (since ? rows.filter((row) => row.at >= since) : rows).map((row) => ({
      store_id: row.store_id,
    }));
    return { data: filtered.slice(from, to + 1), error: null };
  };

  const make = (since?: string): AdminStatsFilterQuery => {
    const countResult = {
      data: pageFor(since).data,
      count: null,
      error: null as { message: string } | null,
    };
    return {
      gte: (_column: string, value: string) => make(value),
      range: async (from: number, to: number) => pageFor(since, from, to),
      then: (resolve: (value: typeof countResult) => unknown) =>
        Promise.resolve(countResult).then(resolve),
    } as AdminStatsFilterQuery;
  };

  return make();
}

function createProfilesQuery(options: { total: number; last7: number; last30: number }): AdminStatsFilterQuery {
  const countFor = (sinceIso?: string) => {
    if (!sinceIso) return options.total;
    const since = new Date(sinceIso).getTime();
    const sevenDaysAgo = NOW.getTime() - 7 * 24 * 60 * 60 * 1000;
    return Math.abs(since - sevenDaysAgo) < 1000 ? options.last7 : options.last30;
  };

  const make = (sinceIso?: string): AdminStatsFilterQuery => {
    const result = { data: [] as { store_id: string }[], count: countFor(sinceIso), error: null };
    return {
      gte: (_column: string, value: string) => make(value),
      range: async () => ({ data: [], error: null }),
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
  bankTransactions?: ActivityRow[];
  plLinks?: ActivityRow[];
  monthlyOverrides?: ActivityRow[];
}): AdminUserStatsClient {
  return {
    from: (table: string) => ({
      select: () => {
        if (table === "profiles") {
          return createProfilesQuery(options);
        }
        if (table === "bank_transactions") {
          return createActivityQuery(options.bankTransactions ?? []);
        }
        if (table === "transaction_pl_links") {
          return createActivityQuery(options.plLinks ?? []);
        }
        if (table === "monthly_financials") {
          return createActivityQuery(options.monthlyOverrides ?? []);
        }
        return createActivityQuery([]);
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

    await expect(fetchAdminUserStats(admin, NOW)).resolves.toEqual({
      totalProfiles: 20,
      signups7d: 2,
      signups30d: 5,
      confirmed30d: 1,
      confirmationCohort30d: 2,
      confirmationRate30d: 0.5,
      weeklyActiveStores: 0,
    });
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

  it("surfaces profile count errors", async () => {
    const admin: AdminUserStatsClient = {
      from: (table: string) => ({
        select: () => {
          if (table === "profiles") return deniedQuery();
          return createActivityQuery([]);
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
