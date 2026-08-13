"use client";

import { readOnlyActionCopy } from "@/lib/access";
import { useAccessStatus } from "@/lib/useAccessStatus";

export function useWriteGuard(storeId?: string | null) {
  const { isReadOnly, reason, loading } = useAccessStatus(storeId);
  const { message } = readOnlyActionCopy(reason);

  return {
    canWrite: loading ? true : !isReadOnly,
    blockedReason: !loading && isReadOnly ? message : null,
    actionLabel: readOnlyActionCopy(reason).action,
    loading,
  };
}
