"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAccessStatus,
  getUserStoreCount,
  type AccessReason,
  type AccessStatus,
} from "@/lib/access";
import type { PlanKey } from "@/lib/beta";
import { createClient } from "@/lib/supabase";

const REVALIDATE_MS = 60_000;

type AccessCache = {
  userId: string;
  storeId: string | null;
  status: AccessStatus;
  storeCount: number;
  fetchedAt: number;
  promise?: Promise<{ status: AccessStatus; storeCount: number }>;
};

let accessCache: AccessCache | null = null;

async function fetchAccessFromDb(
  userId: string,
  storeId: string | null
): Promise<{
  status: AccessStatus;
  storeCount: number;
}> {
  const supabase = createClient();
  const [status, storeCount] = await Promise.all([
    getAccessStatus(supabase, userId, new Date(), storeId),
    getUserStoreCount(supabase, userId),
  ]);
  return { status, storeCount };
}

export function invalidateAccessStatusCache() {
  accessCache = null;
}

const DEFAULT_STATUS: AccessStatus = {
  plan: null,
  isReadOnly: true,
  reason: "no_subscription",
  trialEndsAt: null,
  currentPeriodEnd: null,
  maxStores: 0,
};

export function useAccessStatus(storeId?: string | null) {
  const scopedStoreId = storeId ?? null;
  const [status, setStatus] = useState<AccessStatus>(
    accessCache?.status ?? DEFAULT_STATUS
  );
  const [storeCount, setStoreCount] = useState(accessCache?.storeCount ?? 0);
  const [loading, setLoading] = useState(
    accessCache === null ||
      accessCache.storeId !== scopedStoreId
  );

  useEffect(() => {
    let cancelled = false;

    async function load(force = false) {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setStatus(DEFAULT_STATUS);
        setStoreCount(0);
        setLoading(false);
        return;
      }

      const now = Date.now();
      if (
        !force &&
        accessCache &&
        accessCache.userId === user.id &&
        accessCache.storeId === scopedStoreId &&
        !accessCache.promise &&
        now - accessCache.fetchedAt < REVALIDATE_MS
      ) {
        setStatus(accessCache.status);
        setStoreCount(accessCache.storeCount);
        setLoading(false);
        return;
      }

      if (
        !force &&
        accessCache?.userId === user.id &&
        accessCache.storeId === scopedStoreId &&
        accessCache.promise
      ) {
        const result = await accessCache.promise;
        if (!cancelled) {
          setStatus(result.status);
          setStoreCount(result.storeCount);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const promise = fetchAccessFromDb(user.id, scopedStoreId);
      accessCache = {
        userId: user.id,
        storeId: scopedStoreId,
        status: DEFAULT_STATUS,
        storeCount: 0,
        fetchedAt: now,
        promise,
      };

      const result = await promise;
      accessCache = {
        userId: user.id,
        storeId: scopedStoreId,
        status: result.status,
        storeCount: result.storeCount,
        fetchedAt: Date.now(),
      };

      if (!cancelled) {
        setStatus(result.status);
        setStoreCount(result.storeCount);
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [scopedStoreId]);

  const refresh = useCallback(async () => {
    invalidateAccessStatusCache();
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStatus(DEFAULT_STATUS);
      setStoreCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await fetchAccessFromDb(user.id, scopedStoreId);
    accessCache = {
      userId: user.id,
      storeId: scopedStoreId,
      status: result.status,
      storeCount: result.storeCount,
      fetchedAt: Date.now(),
    };
    setStatus(result.status);
    setStoreCount(result.storeCount);
    setLoading(false);
  }, [scopedStoreId]);

  return {
    isReadOnly: status.isReadOnly,
    plan: status.plan as PlanKey | null,
    maxStores: status.maxStores,
    reason: status.reason as AccessReason,
    trialEndsAt: status.trialEndsAt,
    currentPeriodEnd: status.currentPeriodEnd,
    storeCount,
    loading,
    refresh,
  };
}
