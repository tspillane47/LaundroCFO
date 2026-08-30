import {
  getAccessStatus,
  getUserStoreCount,
  type AccessStatus,
} from "@/lib/access";
import {
  getOnboardingStatus,
  registerOnboardingCacheInvalidator,
  type OnboardingStatus,
} from "@/lib/onboarding";
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

export const DEFAULT_ONBOARDING_STATUS: OnboardingStatus = {
  complete: false,
  path: null,
};

export type SessionUser = {
  id: string;
  email: string | null;
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

type UserRecord = {
  user: SessionUser | null;
  fetchedAt: number;
  promise?: Promise<SessionUser | null>;
};

type OnboardingRecord = {
  userId: string;
  status: OnboardingStatus;
  fetchedAt: number;
  promise?: Promise<OnboardingStatus>;
};

let userRecord: UserRecord | null = null;
const onboardingRecords = new Map<string, OnboardingRecord>();
const accessRecords = new Map<string, AccessRecord>();
const accessInvalidationListeners = new Set<() => void>();

function accessKey(userId: string, storeId: string | null): string {
  return `${userId}:${storeId ?? ""}`;
}

function isFresh(fetchedAt: number, now = Date.now()): boolean {
  return now - fetchedAt < REVALIDATE_MS;
}

async function fetchSessionUser(): Promise<SessionUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

async function fetchOnboardingFromDb(userId: string): Promise<OnboardingStatus> {
  const supabase = createClient();
  return getOnboardingStatus(supabase, userId);
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

export async function getCachedSessionUser(): Promise<SessionUser | null> {
  if (userRecord?.promise) return userRecord.promise;
  if (userRecord) return userRecord.user;

  const promise = fetchSessionUser();
  userRecord = { user: null, fetchedAt: Date.now(), promise };

  try {
    const user = await promise;
    userRecord = { user, fetchedAt: Date.now() };
    return user;
  } catch (error) {
    userRecord = null;
    throw error;
  }
}

export function peekSessionUser(): SessionUser | null | undefined {
  if (!userRecord || userRecord.promise) return undefined;
  return userRecord.user;
}

export function invalidateSessionUser() {
  userRecord = null;
}

let onboardingCacheGeneration = 0;

export async function getCachedOnboarding(userId: string): Promise<OnboardingStatus> {
  const now = Date.now();
  const existing = onboardingRecords.get(userId);

  if (existing) {
    if (existing.promise) return existing.promise;
    if (isFresh(existing.fetchedAt, now)) return existing.status;
  }

  const generation = onboardingCacheGeneration;
  const promise = fetchOnboardingFromDb(userId);
  onboardingRecords.set(userId, {
    userId,
    status: DEFAULT_ONBOARDING_STATUS,
    fetchedAt: now,
    promise,
  });

  try {
    const status = await promise;
    if (generation !== onboardingCacheGeneration) {
      return status;
    }
    onboardingRecords.set(userId, {
      userId,
      status,
      fetchedAt: Date.now(),
    });
    return status;
  } catch (error) {
    if (generation === onboardingCacheGeneration) {
      onboardingRecords.delete(userId);
    }
    throw error;
  }
}

export function peekFreshOnboarding(userId: string): OnboardingRecord | null {
  const record = onboardingRecords.get(userId);
  if (!record || record.promise || !isFresh(record.fetchedAt)) return null;
  return record;
}

export function invalidateCachedOnboarding() {
  onboardingCacheGeneration += 1;
  onboardingRecords.clear();
}

registerOnboardingCacheInvalidator(invalidateCachedOnboarding);

function peekAccessCache(
  storeId: string | null,
  userId?: string
): AccessRecord | null {
  if (userId) {
    return accessRecords.get(accessKey(userId, storeId)) ?? null;
  }

  for (const record of Array.from(accessRecords.values())) {
    if (record.storeId === storeId) return record;
  }
  return null;
}

export function peekFreshAccessCache(
  storeId: string | null,
  userId?: string
): AccessRecord | null {
  const record = peekAccessCache(storeId, userId);
  if (!record || record.promise || !isFresh(record.fetchedAt)) return null;
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
    if (isFresh(existing.fetchedAt, now)) {
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

export function subscribeAccessStatusInvalidation(listener: () => void) {
  accessInvalidationListeners.add(listener);
  return () => {
    accessInvalidationListeners.delete(listener);
  };
}

export function invalidateAccessStatusCache() {
  accessRecords.clear();
  for (const listener of Array.from(accessInvalidationListeners)) {
    listener();
  }
}
