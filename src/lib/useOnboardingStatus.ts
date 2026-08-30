"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_ONBOARDING_STATUS,
  getCachedOnboarding,
  getCachedSessionUser,
} from "@/lib/session-cache";
import { useSession } from "@/lib/session-context";
import {
  isJoiningOnboardingPath,
  ONBOARDING_STATUS_INVALIDATED,
  type OnboardingStatus,
} from "@/lib/onboarding";

function useOnboardingStatusFromCache(enabled: boolean) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const handleInvalidate = () => setReloadKey((key) => key + 1);
    window.addEventListener(ONBOARDING_STATUS_INVALIDATED, handleInvalidate);
    return () => window.removeEventListener(ONBOARDING_STATUS_INVALIDATED, handleInvalidate);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const user = await getCachedSessionUser();

      if (cancelled) return;

      if (!user) {
        setStatus(DEFAULT_ONBOARDING_STATUS);
        setUserEmail(null);
        setLoading(false);
        return;
      }

      setUserEmail(user.email);

      const nextStatus = await getCachedOnboarding(user.id);
      if (cancelled) return;

      setStatus(nextStatus);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadKey]);

  return {
    status,
    loading,
    userEmail,
    isJoining: isJoiningOnboardingPath(status?.path),
  };
}

export function useOnboardingStatus() {
  const session = useSession();
  const fallback = useOnboardingStatusFromCache(session === null);

  if (session) {
    return {
      status: session.onboarding,
      loading: session.loading,
      userEmail: session.user?.email ?? null,
      isJoining: isJoiningOnboardingPath(session.onboarding.path),
    };
  }

  return fallback;
}
