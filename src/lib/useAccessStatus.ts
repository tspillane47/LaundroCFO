"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccessReason, AccessStatus } from "@/lib/access";
import type { PlanKey } from "@/lib/beta";
import {
  DEFAULT_ACCESS_STATUS,
  getCachedAccess,
  getCachedSessionUser,
  invalidateAccessStatusCache,
  peekFreshAccessCache,
} from "@/lib/session-cache";

export { invalidateAccessStatusCache };

export function useAccessStatus(storeId?: string | null) {
  const scopedStoreId = storeId ?? null;
  const initial = peekFreshAccessCache(scopedStoreId);
  const [status, setStatus] = useState<AccessStatus>(
    initial?.status ?? DEFAULT_ACCESS_STATUS
  );
  const [storeCount, setStoreCount] = useState(initial?.storeCount ?? 0);
  const [loading, setLoading] = useState(initial === null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const user = await getCachedSessionUser();

      if (cancelled) return;

      if (!user) {
        setStatus(DEFAULT_ACCESS_STATUS);
        setStoreCount(0);
        setLoading(false);
        return;
      }

      const cached = peekFreshAccessCache(scopedStoreId, user.id);
      if (cached) {
        setStatus(cached.status);
        setStoreCount(cached.storeCount);
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await getCachedAccess(user.id, scopedStoreId);

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
    const user = await getCachedSessionUser();

    if (!user) {
      setStatus(DEFAULT_ACCESS_STATUS);
      setStoreCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await getCachedAccess(user.id, scopedStoreId);
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
