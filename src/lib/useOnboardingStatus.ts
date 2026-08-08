"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  getOnboardingStatus,
  isJoiningOnboardingPath,
  type OnboardingStatus,
} from "@/lib/onboarding";

export function useOnboardingStatus() {
  const supabase = createClient();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
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
  }, [supabase]);

  return {
    status,
    loading,
    userEmail,
    isJoining: isJoiningOnboardingPath(status?.path),
  };
}
