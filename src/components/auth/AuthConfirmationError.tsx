"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { INPUT_CLASS } from "@/components/occupancy/shared";
import {
  logAuthConfirmationError,
  resolveAuthConfirmationErrorCopy,
  type AuthConfirmationErrorKind,
} from "@/lib/auth-callback";
import { createClient } from "@/lib/supabase";

const RESEND_SUCCESS = "New confirmation email sent. Check your inbox — and your spam folder.";
const RESEND_FAILURE =
  "We couldn't send a new email right now. Try logging in first, or wait a minute and try again.";

export function AuthConfirmationError({
  kind,
  technicalMessage,
  logContext = "auth-confirmation",
}: {
  kind: AuthConfirmationErrorKind;
  technicalMessage?: string | null;
  logContext?: string;
}) {
  const copy = resolveAuthConfirmationErrorCopy(kind);
  const [showResend, setShowResend] = useState(false);
  const [email, setEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendFailed, setResendFailed] = useState(false);

  useEffect(() => {
    logAuthConfirmationError(logContext, technicalMessage);
  }, [logContext, technicalMessage]);

  async function handleResend() {
    const trimmed = email.trim();
    if (!trimmed) {
      setResendFailed(true);
      setResendMessage("Enter the email you used to sign up.");
      return;
    }

    setResendLoading(true);
    setResendMessage("");
    setResendFailed(false);

    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      logAuthConfirmationError("auth-confirmation-resend", error.message);
      setResendFailed(true);
      setResendMessage(RESEND_FAILURE);
    } else {
      setResendFailed(false);
      setResendMessage(RESEND_SUCCESS);
    }
    setResendLoading(false);
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
      <div className="w-full max-w-md card space-y-4 text-center">
        <h1 className="text-[22px] font-bold text-slate-100">{copy.title}</h1>
        <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">{copy.body}</p>
        <div className="flex flex-col gap-2 pt-2">
          <Link href={copy.primaryHref} className="btn-primary w-full py-2.5 text-[13px]">
            {copy.primaryLabel}
          </Link>
          {copy.secondaryKind === "resend_signup" && copy.secondaryLabel && (
            <button
              type="button"
              className="btn-outline w-full py-2.5 text-[13px]"
              onClick={() => setShowResend((open) => !open)}
            >
              {copy.secondaryLabel}
            </button>
          )}
        </div>
        {showResend && copy.secondaryKind === "resend_signup" && (
          <div className="text-left space-y-3 pt-1">
            <label className="block">
              <span className="metric-label mb-1.5 block">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleResend();
                }}
                className={INPUT_CLASS}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            {resendMessage && (
              <div
                className={
                  resendFailed
                    ? "bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400"
                    : "bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-[12px] text-blue-400"
                }
              >
                {resendMessage}
              </div>
            )}
            <button
              type="button"
              className="btn-secondary w-full py-2.5 text-[13px]"
              onClick={() => void handleResend()}
              disabled={resendLoading}
            >
              {resendLoading ? "Sending…" : "Send confirmation email"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
