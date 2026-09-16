import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const fetchAdminUserStatsMock = vi.fn();
const createAdminSupabaseClientMock = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

vi.mock("@/lib/supabase-admin", () => ({
  createAdminSupabaseClient: () => createAdminSupabaseClientMock(),
}));

vi.mock("@/lib/admin-user-stats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-user-stats")>();
  return {
    ...actual,
    fetchAdminUserStats: (...args: unknown[]) => fetchAdminUserStatsMock(...args),
  };
});

import { GET } from "@/app/api/admin/user-stats/route";

describe("GET /api/admin/user-stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminSupabaseClientMock.mockReturnValue({ mocked: true });
  });

  it("rejects non-admin users", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "someone@example.com" } } });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Unauthorized" });
    expect(fetchAdminUserStatsMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated users", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchAdminUserStatsMock).not.toHaveBeenCalled();
  });

  it("returns stats for the admin user via the service-role client", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { email: "tuckerspillane7@gmail.com" } },
    });
    fetchAdminUserStatsMock.mockResolvedValue({
      totalProfiles: 20,
      signups7d: 2,
      signups30d: 5,
      confirmed30d: 4,
      confirmationCohort30d: 5,
      confirmationRate30d: 0.8,
      weeklyActiveStores: 4,
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      totalProfiles: 20,
      signups7d: 2,
      signups30d: 5,
      confirmed30d: 4,
      confirmationCohort30d: 5,
      confirmationRate30d: 0.8,
      weeklyActiveStores: 4,
    });
    expect(createAdminSupabaseClientMock).toHaveBeenCalled();
    expect(fetchAdminUserStatsMock).toHaveBeenCalledWith({ mocked: true });
  });
});
