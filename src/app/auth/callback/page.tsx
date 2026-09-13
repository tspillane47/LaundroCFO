"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthConfirmationError } from "@/components/auth/AuthConfirmationError";
import { createClient } from "@/lib/supabase";
import { isOnboardingComplete } from "@/lib/onboarding";
import { invalidateSessionUser } from "@/lib/session-cache";
import { trackSignUpEvent } from "@/lib/analytics";
import {
  SIGNUP_CONFIRMATION_SKEW_MS,
  isEmailChangeType,
  isNewSignupConfirmation,
  logAuthConfirmationError,
  resolveAuthConfirmationErrorKind,
  resolvePostAuthDestination,
  type SignupConfirmationUser,
} from "@/lib/auth-callback";

// [TEMP-DEBUG] Remove with the other [TEMP-DEBUG] logs after GA4 sign_up diagnosis.
function tempDebugSignupConfirmationWhy(options: {
  user: SignupConfirmationUser | null | undefined;
  type?: string | null;
  onboardingComplete?: boolean;
}): string {
  const { user, type, onboardingComplete } = options;
  if (!user) return "false because no user was returned on the session";
  if (onboardingComplete) return "false because onboarding is already complete";
  if (isEmailChangeType(type) || type === "recovery") {
    return `false because type=${String(type)} is excluded (email change / recovery)`;
  }

  const confirmedRaw = user.email_confirmed_at ?? null;
  const lastSignInRaw = user.last_sign_in_at ?? null;
  const confirmedAt = Date.parse(confirmedRaw ?? "");
  const lastSignInAt = Date.parse(lastSignInRaw ?? "");
  if (Number.isNaN(confirmedAt) || Number.isNaN(lastSignInAt)) {
    return `false because timestamps were unparseable (email_confirmed_at=${String(confirmedRaw)}, last_sign_in_at=${String(lastSignInRaw)})`;
  }

  const deltaMs = Math.abs(lastSignInAt - confirmedAt);
  if (deltaMs <= SIGNUP_CONFIRMATION_SKEW_MS) {
    return `true because |last_sign_in_at - email_confirmed_at|=${deltaMs}ms is within ${SIGNUP_CONFIRMATION_SKEW_MS}ms skew`;
  }
  return `false because |last_sign_in_at - email_confirmed_at|=${deltaMs}ms exceeds ${SIGNUP_CONFIRMATION_SKEW_MS}ms skew`;
}

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

      // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
      console.log("[TEMP-DEBUG] /auth/callback start", {
        hasCode: Boolean(code),
        hasTokenHash: Boolean(tokenHash),
        type,
        nextParam,
      });

      if (tokenHash && type) {
        // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
        console.log(
          "[TEMP-DEBUG] token_hash+type present — redirecting to /auth/confirm (no client exchangeCodeForSession)"
        );
        router.replace(`/auth/confirm?${searchParams.toString()}`);
        return;
      }

      if (!code) {
        // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
        console.log("[TEMP-DEBUG] /auth/callback abort — missing code");
        if (!cancelled) {
          setErrorMessage("This confirmation link is invalid or incomplete.");
        }
        return;
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (cancelled) return;

      if (error) {
        // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
        console.log("[TEMP-DEBUG] exchangeCodeForSession failed", error.message);
        logAuthConfirmationError("auth-callback", error.message);
        setErrorMessage(error.message);
        return;
      }

      const user = data.user;
      // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
      console.log("[TEMP-DEBUG] exchangeCodeForSession succeeded — user timestamps", {
        email_confirmed_at: user?.email_confirmed_at ?? null,
        last_sign_in_at: user?.last_sign_in_at ?? null,
        type,
      });

      invalidateSessionUser();

      const onboardingComplete = Boolean(
        user && (await isOnboardingComplete(supabase, user.id))
      );

      const isNewSignup = isNewSignupConfirmation({ user, type, onboardingComplete });
      // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
      console.log("[TEMP-DEBUG] isNewSignupConfirmation()", {
        result: isNewSignup,
        why: tempDebugSignupConfirmationWhy({ user, type, onboardingComplete }),
        onboardingComplete,
        type,
        email_confirmed_at: user?.email_confirmed_at ?? null,
        last_sign_in_at: user?.last_sign_in_at ?? null,
      });

      if (isNewSignup) {
        // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
        console.log("[TEMP-DEBUG] calling trackSignUpEvent() from /auth/callback");
        trackSignUpEvent();
      } else {
        // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
        console.log("[TEMP-DEBUG] skipping trackSignUpEvent() from /auth/callback");
      }

      const destination = await resolvePostAuthDestination({
        nextParam,
        type,
        isOnboardingComplete: async () => onboardingComplete,
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
