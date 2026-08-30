"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AccessStatus } from "@/lib/access";
import { ONBOARDING_STATUS_INVALIDATED, type OnboardingStatus } from "@/lib/onboarding";
import {
  DEFAULT_ACCESS_STATUS,
  DEFAULT_ONBOARDING_STATUS,
  getCachedAccess,
  getCachedOnboarding,
  getCachedSessionUser,
  invalidateAccessStatusCache,
  invalidateCachedOnboarding,
  invalidateSessionUser,
  peekFreshAccessCache,
  peekFreshOnboarding,
  peekSessionUser,
  subscribeAccessStatusInvalidation,
  type SessionUser,
} from "@/lib/session-cache";
import { createClient } from "@/lib/supabase";

export type SessionValue = {
  user: SessionUser | null;
  onboarding: OnboardingStatus;
  access: AccessStatus;
  storeCount: number;
  loading: boolean;
};

const SessionContext = createContext<SessionValue | null>(null);

function readInitialSession(): SessionValue {
  const user = peekSessionUser();
  if (user === undefined) {
    return {
      user: null,
      onboarding: DEFAULT_ONBOARDING_STATUS,
      access: DEFAULT_ACCESS_STATUS,
      storeCount: 0,
      loading: true,
    };
  }

  if (user === null) {
    return {
      user: null,
      onboarding: DEFAULT_ONBOARDING_STATUS,
      access: DEFAULT_ACCESS_STATUS,
      storeCount: 0,
      loading: false,
    };
  }

  const onboarding = peekFreshOnboarding(user.id);
  const access = peekFreshAccessCache(null, user.id);
  return {
    user,
    onboarding: onboarding?.status ?? DEFAULT_ONBOARDING_STATUS,
    access: access?.status ?? DEFAULT_ACCESS_STATUS,
    storeCount: access?.storeCount ?? 0,
    loading: onboarding === null || access === null,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionValue>(readInitialSession);
  const loadIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const loadId = ++loadIdRef.current;
      const user = await getCachedSessionUser();
      if (cancelled || loadId !== loadIdRef.current) return;

      if (!user) {
        setSession({
          user: null,
          onboarding: DEFAULT_ONBOARDING_STATUS,
          access: DEFAULT_ACCESS_STATUS,
          storeCount: 0,
          loading: false,
        });
        return;
      }

      const [onboarding, access] = await Promise.all([
        getCachedOnboarding(user.id),
        getCachedAccess(user.id, null),
      ]);

      if (cancelled || loadId !== loadIdRef.current) return;

      setSession({
        user,
        onboarding,
        access: access.status,
        storeCount: access.storeCount,
        loading: false,
      });
    }

    void load();

    const handleOnboardingInvalidate = () => {
      invalidateCachedOnboarding();
      void load();
    };
    window.addEventListener(ONBOARDING_STATUS_INVALIDATED, handleOnboardingInvalidate);

    const unsubscribeAccess = subscribeAccessStatusInvalidation(() => {
      void load();
    });

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      invalidateSessionUser();
      invalidateCachedOnboarding();
      invalidateAccessStatusCache();
    });

    return () => {
      cancelled = true;
      window.removeEventListener(ONBOARDING_STATUS_INVALIDATED, handleOnboardingInvalidate);
      unsubscribeAccess();
      subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue | null {
  return useContext(SessionContext);
}
