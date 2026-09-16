const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STORE_ID_PAGE = 1000;

export type AdminUserStats = {
  totalProfiles: number;
  signups7d: number;
  signups30d: number;
  confirmed30d: number;
  confirmationCohort30d: number;
  confirmationRate30d: number | null;
  weeklyActiveStores: number;
};

export type AuthUserForStats = {
  created_at: string;
  email_confirmed_at?: string | null;
};

type QueryError = { message: string };

type CountResult = {
  data?: { store_id: string }[] | null;
  count: number | null;
  error: QueryError | null;
};

type StoreIdPageResult = {
  data: { store_id: string }[] | null;
  error: QueryError | null;
};

export type AdminStatsFilterQuery = PromiseLike<CountResult> & {
  gte: (column: string, value: string) => AdminStatsFilterQuery;
  range: (from: number, to: number) => PromiseLike<StoreIdPageResult>;
};

export type AdminUserStatsClient = {
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count: "exact"; head: boolean }
    ) => AdminStatsFilterQuery;
  };
  auth: {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<{
        data: { users: AuthUserForStats[] };
        error: { message: string } | null;
      }>;
    };
  };
};

export function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}

export function computeConfirmationRate(confirmed: number, total: number): number | null {
  if (total <= 0) return null;
  return confirmed / total;
}

export function formatConfirmationRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function countConfirmedSignupsSince(
  users: AuthUserForStats[],
  sinceIso: string
): { confirmed: number; total: number } {
  let confirmed = 0;
  let total = 0;

  for (const user of users) {
    if (user.created_at < sinceIso) continue;
    total += 1;
    if (user.email_confirmed_at) confirmed += 1;
  }

  return { confirmed, total };
}

async function countProfiles(
  admin: AdminUserStatsClient,
  sinceIso?: string
): Promise<number> {
  const query = admin.from("profiles").select("id", { count: "exact", head: true });
  const { count, error } = await (sinceIso ? query.gte("created_at", sinceIso) : query);
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function listAllAuthUsers(admin: AdminUserStatsClient): Promise<AuthUserForStats[]> {
  const users: AuthUserForStats[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    users.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }

  return users;
}

async function storeIdsSince(
  admin: AdminUserStatsClient,
  table: string,
  column: string,
  sinceIso: string
): Promise<Set<string>> {
  const ids = new Set<string>();

  for (let from = 0; ; from += STORE_ID_PAGE) {
    const { data, error } = await admin
      .from(table)
      .select("store_id")
      .gte(column, sinceIso)
      .range(from, from + STORE_ID_PAGE - 1);
    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];
    for (const row of page) {
      if (row.store_id) ids.add(row.store_id);
    }
    if (page.length < STORE_ID_PAGE) break;
  }

  return ids;
}

async function countWeeklyActiveStores(
  admin: AdminUserStatsClient,
  sinceIso: string
): Promise<number> {
  const [bankIds, linkIds, manualIds] = await Promise.all([
    storeIdsSince(admin, "bank_transactions", "created_at", sinceIso),
    storeIdsSince(admin, "transaction_pl_links", "applied_at", sinceIso),
    storeIdsSince(admin, "monthly_financials", "manually_overridden_at", sinceIso),
  ]);

  const ids = new Set<string>();
  bankIds.forEach((id) => ids.add(id));
  linkIds.forEach((id) => ids.add(id));
  manualIds.forEach((id) => ids.add(id));
  return ids.size;
}

export async function fetchAdminUserStats(
  admin: AdminUserStatsClient,
  now: Date = new Date()
): Promise<AdminUserStats> {
  const since7d = isoDaysAgo(now, 7);
  const since30d = isoDaysAgo(now, 30);

  const [totalProfiles, signups7d, signups30d, authUsers, weeklyActiveStores] = await Promise.all([
    countProfiles(admin),
    countProfiles(admin, since7d),
    countProfiles(admin, since30d),
    listAllAuthUsers(admin),
    countWeeklyActiveStores(admin, since7d),
  ]);

  const { confirmed, total } = countConfirmedSignupsSince(authUsers, since30d);

  return {
    totalProfiles,
    signups7d,
    signups30d,
    confirmed30d: confirmed,
    confirmationCohort30d: total,
    confirmationRate30d: computeConfirmationRate(confirmed, total),
    weeklyActiveStores,
  };
}
