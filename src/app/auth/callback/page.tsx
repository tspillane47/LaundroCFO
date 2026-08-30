"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthConfirmationError } from "@/components/auth/AuthConfirmationError";
import { createClient } from "@/lib/supabase";
import { isOnboardingComplete } from "@/lib/onboarding";
import { invalidateSessionUser } from "@/lib/session-cache";
import {
  logAuthConfirmationError,
  resolveAuthConfirmationErrorKind,
  resolvePostAuthDestination,
} from "@/lib/auth-callback";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeAuth() {
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const nextParam = searchParams.get("next");

      if (tokenHash && type) {
        router.replace(`/auth/confirm?${searchParams.toString()}`);
        return;
      }

      if (!code) {
        if (!cancelled) {
          setErrorMessage("This confirmation link is invalid or incomplete.");
        }
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (cancelled) return;

      if (error) {
        logAuthConfirmationError("auth-callback", error.message);
        setErrorMessage(error.message);
        return;
      }

      invalidateSessionUser();

      const destination = await resolvePostAuthDestination({
        nextParam,
        type,
        isOnboardingComplete: async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          return Boolean(user && (await isOnboardingComplete(supabase, user.id)));
        },
      });

      router.replace(destination);
    }

    void completeAuth();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, supabase]);

  if (errorMessage) {
    return (
      <AuthConfirmationError
        kind={resolveAuthConfirmationErrorKind(searchParams.get("type"))}
        technicalMessage={errorMessage}
        logContext="auth-callback-ui"
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
      <div className="text-center space-y-2">
        <div className="text-[15px] text-slate-100 font-medium">Confirming your request…</div>
        <div className="text-[13px] text-[var(--text-muted)]">Please wait a moment.</div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
          <div className="text-[13px] text-[var(--text-muted)]">Loading…</div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
