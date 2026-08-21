import {
  getAccessStatus,
  getUserStoreCount,
  type AccessStatus,
} from "@/lib/access";
import { createClient } from "@/lib/supabase";

const REVALIDATE_MS = 60_000;

export const DEFAULT_ACCESS_STATUS: AccessStatus = {
  plan: null,
  isReadOnly: true,
  reason: "no_subscription",
  trialEndsAt: null,
  currentPeriodEnd: null,
  maxStores: 0,
};

type AccessResult = {
  status: AccessStatus;
  storeCount: number;
};

type AccessRecord = {
  userId: string;
  storeId: string | null;
  status: AccessStatus;
  storeCount: number;
  fetchedAt: number;
  promise?: Promise<AccessResult>;
};

type SessionUser = {
  id: string;
};

let userInFlight: Promise<SessionUser | null> | null = null;
const accessRecords = new Map<string, AccessRecord>();

function accessKey(userId: string, storeId: string | null): string {
  return `${userId}:${storeId ?? ""}`;
}

function isFresh(record: AccessRecord, now = Date.now()): boolean {
  return !record.promise && now - record.fetchedAt < REVALIDATE_MS;
}

async function fetchAccessFromDb(
  userId: string,
  storeId: string | null
): Promise<AccessResult> {
  const supabase = createClient();
  const [status, storeCount] = await Promise.all([
    getAccessStatus(supabase, userId, new Date(), storeId),
    getUserStoreCount(supabase, userId),
  ]);
  return { status, storeCount };
}

/** In-flight getUser() only — sequential calls still hit Auth, matching today's hook. */
export async function getCachedSessionUser(): Promise<SessionUser | null> {
  if (userInFlight) return userInFlight;

  const promise = (async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id } : null;
  })();

  userInFlight = promise;
  try {
    return await promise;
  } finally {
    if (userInFlight === promise) userInFlight = null;
  }
}

function peekAccessCache(
  storeId: string | null,
  userId?: string
): AccessRecord | null {
  if (userId) {
    return accessRecords.get(accessKey(userId, storeId)) ?? null;
  }

  for (const record of accessRecords.values()) {
    if (record.storeId === storeId) return record;
  }
  return null;
}

export function peekFreshAccessCache(
  storeId: string | null,
  userId?: string
): AccessRecord | null {
  const record = peekAccessCache(storeId, userId);
  if (!record || !isFresh(record)) return null;
  return record;
}

export async function getCachedAccess(
  userId: string,
  storeId: string | null
): Promise<AccessResult> {
  const key = accessKey(userId, storeId);
  const now = Date.now();
  const existing = accessRecords.get(key);

  if (existing && existing.userId === userId) {
    if (existing.promise) return existing.promise;
    if (isFresh(existing, now)) {
      return { status: existing.status, storeCount: existing.storeCount };
    }
  }

  const promise = fetchAccessFromDb(userId, storeId);
  accessRecords.set(key, {
    userId,
    storeId,
    status: DEFAULT_ACCESS_STATUS,
    storeCount: 0,
    fetchedAt: now,
    promise,
  });

  const result = await promise;
  accessRecords.set(key, {
    userId,
    storeId,
    status: result.status,
    storeCount: result.storeCount,
    fetchedAt: Date.now(),
  });
  return result;
}

export function invalidateAccessStatusCache() {
  accessRecords.clear();
}
