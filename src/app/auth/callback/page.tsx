"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { isOnboardingComplete } from "@/lib/onboarding";
import {
  isEmailChangeType,
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
        console.error("Auth callback failed:", error.message);
        setErrorMessage(
          isEmailChangeType(type)
            ? `We couldn't confirm your email change: ${error.message}`
            : `Email confirmation failed: ${error.message}`
        );
        return;
      }

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
    const isEmailChange = isEmailChangeType(searchParams.get("type"));

    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
        <div className="w-full max-w-md card space-y-4 text-center">
          <h1 className="text-[22px] font-bold text-slate-100">
            {isEmailChange ? "Email change failed" : "Confirmation failed"}
          </h1>
          <p className="text-[14px] text-red-400 leading-relaxed">{errorMessage}</p>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            The link may have expired, already been used, or was opened in a different browser
            than the one where you requested the change. Request a new confirmation email and
            open the link in the same browser.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            {isEmailChange ? (
              <Link href="/account" className="btn-primary w-full py-2.5 text-[13px]">
                Back to Account
              </Link>
            ) : (
              <Link href="/login" className="btn-primary w-full py-2.5 text-[13px]">
                Back to Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
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
