"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  getOnboardingStatus,
  isJoiningOnboardingPath,
  ONBOARDING_STATUS_INVALIDATED,
  type OnboardingStatus,
} from "@/lib/onboarding";

export function useOnboardingStatus() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const handleInvalidate = () => setReloadKey((key) => key + 1);
    window.addEventListener(ONBOARDING_STATUS_INVALIDATED, handleInvalidate);
    return () => window.removeEventListener(ONBOARDING_STATUS_INVALIDATED, handleInvalidate);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setStatus({ complete: false, path: null });
        setUserEmail(null);
        setLoading(false);
        return;
      }

      setUserEmail(user.email ?? null);

      const nextStatus = await getOnboardingStatus(supabase, user.id);
      if (cancelled) return;

      setStatus(nextStatus);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase, reloadKey]);

  return {
    status,
    loading,
    userEmail,
    isJoining: isJoiningOnboardingPath(status?.path),
  };
}
