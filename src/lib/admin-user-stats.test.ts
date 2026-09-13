import { describe, expect, it, vi } from "vitest";
import {
  computeConfirmationRate,
  countConfirmedSignupsSince,
  fetchAdminUserStats,
  formatConfirmationRate,
  isoDaysAgo,
  type AdminUserStatsClient,
  type AuthUserForStats,
} from "@/lib/admin-user-stats";

const NOW = new Date("2026-09-13T18:00:00.000Z");

function createMockAdmin(options: {
  total: number;
  last7: number;
  last30: number;
  users: AuthUserForStats[];
  pages?: AuthUserForStats[][];
}): AdminUserStatsClient {
  return {
    from: () => ({
      select: () => {
        const result = Promise.resolve({ count: options.total, error: null });
        return Object.assign(result, {
          gte: async (_column: string, value: string) => {
            const since = new Date(value).getTime();
            const sevenDaysAgo = NOW.getTime() - 7 * 24 * 60 * 60 * 1000;
            const isSevenDayWindow = Math.abs(since - sevenDaysAgo) < 1000;
            return {
              count: isSevenDayWindow ? options.last7 : options.last30,
              error: null,
            };
          },
        });
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
  });

  it("surfaces profile count errors", async () => {
    const admin: AdminUserStatsClient = {
      from: () => ({
        select: () =>
          Object.assign(Promise.resolve({ count: null, error: { message: "denied" } }), {
            gte: async () => ({ count: null, error: { message: "denied" } }),
          }),
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
