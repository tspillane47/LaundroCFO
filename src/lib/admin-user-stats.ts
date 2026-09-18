const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STORE_ID_PAGE = 1000;

export type ActivationFunnelStepId =
  | "signed_up"
  | "created_store"
  | "added_financial_data"
  | "connected_bank"
  | "weekly_active"
  | "returning";

export type ActivationFunnelMember = {
  email: string | null;
  storeName: string | null;
  signupDate: string | null;
  stuckOn: ActivationFunnelStepId | null;
};

export type ActivationFunnelStep = {
  id: ActivationFunnelStepId;
  count: number;
  members: ActivationFunnelMember[];
};

export type AdminUserStats = {
  totalProfiles: number;
  signups7d: number;
  signups30d: number;
  confirmed30d: number;
  confirmationCohort30d: number;
  confirmationRate30d: number | null;
  weeklyActiveStores: number;
  storesWithFinancialData: number;
  funnel: {
    windowDays: 7;
    steps: ActivationFunnelStep[];
  };
};

export const ACTIVATION_FUNNEL_STEP_ORDER: ActivationFunnelStepId[] = [
  "signed_up",
  "created_store",
  "added_financial_data",
  "connected_bank",
  "weekly_active",
  "returning",
];

export const ACTIVATION_FUNNEL_STEP_META: Record<
  ActivationFunnelStepId,
  { label: string; hint: string }
> = {
  signed_up: { label: "Signed Up", hint: "Profiles created in last 7 days" },
  created_store: { label: "Created Store", hint: "Stores created in last 7 days" },
  added_financial_data: {
    label: "Added Financial Data",
    hint: "Financial rows written in last 7 days",
  },
  connected_bank: { label: "Connected Bank", hint: "Plaid connections in last 7 days" },
  weekly_active: { label: "Weekly Active Stores", hint: "Qualifying activity in last 7 days" },
  returning: { label: "Returning Stores", hint: "Active in both this week and last week" },
};

export type AuthUserForStats = {
  id?: string;
  email?: string | null;
  created_at: string;
  email_confirmed_at?: string | null;
};

type QueryError = { message: string };

type CountResult = {
  data?: Record<string, unknown>[] | null;
  count: number | null;
  error: QueryError | null;
};

type PageResult = {
  data: Record<string, unknown>[] | null;
  error: QueryError | null;
};

export type AdminStatsFilterQuery = PromiseLike<CountResult> & {
  gte: (column: string, value: string) => AdminStatsFilterQuery;
  lt: (column: string, value: string) => AdminStatsFilterQuery;
  range: (from: number, to: number) => PromiseLike<PageResult>;
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

type StoreForStats = {
  id: string;
  name: string | null;
  user_id: string | null;
  created_at: string | null;
};

type ProfileForStats = {
  id: string;
  created_at: string;
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

export function formatFunnelStepLabel(id: ActivationFunnelStepId | null): string {
  if (id == null) return "—";
  return ACTIVATION_FUNNEL_STEP_META[id].label;
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

export function classifyActivationStuckOn(input: {
  hasStore: boolean;
  hasFinancialData: boolean;
  hasPlaid: boolean;
  isWeeklyActive: boolean;
  isReturning: boolean;
}): ActivationFunnelStepId | null {
  const { hasStore, hasFinancialData, isWeeklyActive, isReturning } = input;
  if (!hasStore) return "created_store";
  if (!hasFinancialData) return "added_financial_data";
  // Plaid is optional once the store has real financial data (CSV, manual, or Plaid).
  // connected_bank is only a stuck-on when there is no bank AND no financial data;
  // that set is labeled added_financial_data because any of those paths unblocks them.
  if (!isWeeklyActive) return "weekly_active";
  if (!isReturning) return "returning";
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function inWindow(timestamp: string | null | undefined, sinceIso: string, untilExclusiveIso?: string): boolean {
  if (!timestamp) return false;
  if (timestamp < sinceIso) return false;
  if (untilExclusiveIso && timestamp >= untilExclusiveIso) return false;
  return true;
}

function unionStoreIds(...sets: Set<string>[]): Set<string> {
  const ids = new Set<string>();
  for (const set of sets) {
    set.forEach((id) => ids.add(id));
  }
  return ids;
}

function intersectStoreIds(left: Set<string>, right: Set<string>): Set<string> {
  const ids = new Set<string>();
  left.forEach((id) => {
    if (right.has(id)) ids.add(id);
  });
  return ids;
}

function collectStoreIds(
  rows: Record<string, unknown>[],
  timestampColumn: string | null,
  sinceIso?: string,
  untilExclusiveIso?: string
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = asString(row.store_id);
    if (!id) continue;
    if (timestampColumn && sinceIso && !inWindow(asString(row[timestampColumn]), sinceIso, untilExclusiveIso)) {
      continue;
    }
    ids.add(id);
  }
  return ids;
}

async function countProfiles(admin: AdminUserStatsClient, sinceIso?: string): Promise<number> {
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

async function pageSelect(
  admin: AdminUserStatsClient,
  table: string,
  columns: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += STORE_ID_PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .range(from, from + STORE_ID_PAGE - 1);
    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < STORE_ID_PAGE) break;
  }

  return rows;
}

function parseStores(rows: Record<string, unknown>[]): StoreForStats[] {
  const stores: StoreForStats[] = [];
  for (const row of rows) {
    const id = asString(row.id);
    if (!id) continue;
    stores.push({
      id,
      name: asString(row.name),
      user_id: asString(row.user_id),
      created_at: asString(row.created_at),
    });
  }
  return stores;
}

function parseProfiles(rows: Record<string, unknown>[]): ProfileForStats[] {
  const profiles: ProfileForStats[] = [];
  for (const row of rows) {
    const id = asString(row.id);
    const createdAt = asString(row.created_at);
    if (!id || !createdAt) continue;
    profiles.push({ id, created_at: createdAt });
  }
  return profiles;
}

function sortMembers(members: ActivationFunnelMember[]): ActivationFunnelMember[] {
  return [...members].sort((left, right) => {
    const date = (right.signupDate ?? "").localeCompare(left.signupDate ?? "");
    if (date !== 0) return date;
    return (left.email ?? "").localeCompare(right.email ?? "");
  });
}

function stuckOnRank(stuckOn: ActivationFunnelStepId | null): number {
  if (stuckOn == null) return ACTIVATION_FUNNEL_STEP_ORDER.length;
  return ACTIVATION_FUNNEL_STEP_ORDER.indexOf(stuckOn);
}

function storeStuckOn(
  storeId: string,
  context: {
    financialStoreIds: Set<string>;
    plaidStoreIds: Set<string>;
    weeklyActiveIds: Set<string>;
    returningIds: Set<string>;
  }
): ActivationFunnelStepId | null {
  return classifyActivationStuckOn({
    hasStore: true,
    hasFinancialData: context.financialStoreIds.has(storeId),
    hasPlaid: context.plaidStoreIds.has(storeId),
    isWeeklyActive: context.weeklyActiveIds.has(storeId),
    isReturning: context.returningIds.has(storeId),
  });
}

function memberForStore(
  store: StoreForStats | undefined,
  storeId: string,
  emailByUserId: Map<string, string | null>,
  signupByUserId: Map<string, string>,
  context: {
    financialStoreIds: Set<string>;
    plaidStoreIds: Set<string>;
    weeklyActiveIds: Set<string>;
    returningIds: Set<string>;
  }
): ActivationFunnelMember {
  const ownerId = store?.user_id ?? null;
  return {
    email: ownerId ? (emailByUserId.get(ownerId) ?? null) : null,
    storeName: store?.name ?? null,
    signupDate: ownerId ? (signupByUserId.get(ownerId) ?? null) : null,
    stuckOn: storeStuckOn(storeId, context),
  };
}

function memberForProfile(
  profile: ProfileForStats,
  ownedStores: StoreForStats[],
  emailByUserId: Map<string, string | null>,
  context: {
    financialStoreIds: Set<string>;
    plaidStoreIds: Set<string>;
    weeklyActiveIds: Set<string>;
    returningIds: Set<string>;
  }
): ActivationFunnelMember {
  const storeNames = ownedStores
    .map((store) => store.name)
    .filter((name): name is string => Boolean(name));

  let stuckOn: ActivationFunnelStepId | null;
  if (ownedStores.length === 0) {
    stuckOn = "created_store";
  } else {
    stuckOn = ownedStores
      .map((store) => storeStuckOn(store.id, context))
      .reduce<ActivationFunnelStepId | null>((least, current) => {
        if (least == null) return current;
        if (current == null) return least;
        return stuckOnRank(current) < stuckOnRank(least) ? current : least;
      }, null);
  }

  return {
    email: emailByUserId.get(profile.id) ?? null,
    storeName: storeNames.length > 0 ? storeNames.join(", ") : null,
    signupDate: profile.created_at,
    stuckOn,
  };
}

export async function fetchAdminUserStats(
  admin: AdminUserStatsClient,
  now: Date = new Date()
): Promise<AdminUserStats> {
  const since7d = isoDaysAgo(now, 7);
  const since14d = isoDaysAgo(now, 14);
  const since30d = isoDaysAgo(now, 30);

  const [
    totalProfiles,
    signups7d,
    signups30d,
    authUsers,
    storeRows,
    profileRows,
    plaidRows,
    bankRows,
    linkRows,
    monthlyRows,
  ] = await Promise.all([
    countProfiles(admin),
    countProfiles(admin, since7d),
    countProfiles(admin, since30d),
    listAllAuthUsers(admin),
    pageSelect(admin, "stores", "id, name, user_id, created_at"),
    pageSelect(admin, "profiles", "id, created_at"),
    pageSelect(admin, "plaid_connections", "store_id, connected_at"),
    pageSelect(admin, "bank_transactions", "store_id, created_at"),
    pageSelect(admin, "transaction_pl_links", "store_id, applied_at"),
    pageSelect(admin, "monthly_financials", "store_id, created_at, manually_overridden_at"),
  ]);

  const { confirmed, total } = countConfirmedSignupsSince(authUsers, since30d);
  const stores = parseStores(storeRows);
  const profiles = parseProfiles(profileRows);
  const storesById = new Map(stores.map((store) => [store.id, store]));
  const storesByOwner = new Map<string, StoreForStats[]>();
  for (const store of stores) {
    if (!store.user_id) continue;
    const owned = storesByOwner.get(store.user_id) ?? [];
    owned.push(store);
    storesByOwner.set(store.user_id, owned);
  }

  const emailByUserId = new Map<string, string | null>();
  for (const user of authUsers) {
    if (!user.id) continue;
    emailByUserId.set(user.id, user.email ?? null);
  }

  const signupByUserId = new Map<string, string>();
  for (const profile of profiles) {
    signupByUserId.set(profile.id, profile.created_at);
  }

  const plaidStoreIds = collectStoreIds(plaidRows, null);
  const connectedBankIds = collectStoreIds(plaidRows, "connected_at", since7d);

  const financialStoreIds = unionStoreIds(
    collectStoreIds(bankRows, null),
    collectStoreIds(linkRows, null),
    collectStoreIds(monthlyRows, null)
  );

  const addedFinancialIds = unionStoreIds(
    collectStoreIds(bankRows, "created_at", since7d),
    collectStoreIds(linkRows, "applied_at", since7d),
    collectStoreIds(monthlyRows, "created_at", since7d)
  );

  const weeklyActiveIds = unionStoreIds(
    collectStoreIds(bankRows, "created_at", since7d),
    collectStoreIds(linkRows, "applied_at", since7d),
    collectStoreIds(monthlyRows, "manually_overridden_at", since7d)
  );

  const priorActiveIds = unionStoreIds(
    collectStoreIds(bankRows, "created_at", since14d, since7d),
    collectStoreIds(linkRows, "applied_at", since14d, since7d),
    collectStoreIds(monthlyRows, "manually_overridden_at", since14d, since7d)
  );

  const returningIds = intersectStoreIds(weeklyActiveIds, priorActiveIds);
  const createdStoreIds = new Set(
    stores.filter((store) => store.created_at && store.created_at >= since7d).map((store) => store.id)
  );
  const signedUpProfiles = profiles.filter((profile) => profile.created_at >= since7d);

  const stuckContext = {
    financialStoreIds,
    plaidStoreIds,
    weeklyActiveIds,
    returningIds,
  };

  const storeMembers = (ids: Set<string>) =>
    sortMembers(
      Array.from(ids).map((storeId) =>
        memberForStore(storesById.get(storeId), storeId, emailByUserId, signupByUserId, stuckContext)
      )
    );

  const funnel: AdminUserStats["funnel"] = {
    windowDays: 7,
    steps: [
      {
        id: "signed_up",
        count: signups7d,
        members: sortMembers(
          signedUpProfiles.map((profile) =>
            memberForProfile(profile, storesByOwner.get(profile.id) ?? [], emailByUserId, stuckContext)
          )
        ),
      },
      {
        id: "created_store",
        count: createdStoreIds.size,
        members: storeMembers(createdStoreIds),
      },
      {
        id: "added_financial_data",
        count: addedFinancialIds.size,
        members: storeMembers(addedFinancialIds),
      },
      {
        id: "connected_bank",
        count: connectedBankIds.size,
        members: storeMembers(connectedBankIds),
      },
      {
        id: "weekly_active",
        count: weeklyActiveIds.size,
        members: storeMembers(weeklyActiveIds),
      },
      {
        id: "returning",
        count: returningIds.size,
        members: storeMembers(returningIds),
      },
    ],
  };

  return {
    totalProfiles,
    signups7d,
    signups30d,
    confirmed30d: confirmed,
    confirmationCohort30d: total,
    confirmationRate30d: computeConfirmationRate(confirmed, total),
    weeklyActiveStores: weeklyActiveIds.size,
    storesWithFinancialData: financialStoreIds.size,
    funnel,
  };
}
