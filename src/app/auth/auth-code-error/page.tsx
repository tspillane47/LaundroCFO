"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const REASON_COPY: Record<string, string> = {
  missing_params:
    "This confirmation link is missing required parameters. It may be malformed or truncated.",
  unsupported_type: "This confirmation link uses an unsupported verification type.",
};

function AuthCodeErrorContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const message = searchParams.get("message");
  const type = searchParams.get("type");

  const isEmailChange =
    type === "email_change" ||
    type === "email_change_new" ||
    type === "email_change_current";

  const description =
    message ??
    (reason ? REASON_COPY[reason] : undefined) ??
    "We couldn't verify this link. It may have expired or already been used.";

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
      <div className="w-full max-w-md card space-y-4 text-center">
        <h1 className="text-[22px] font-bold text-slate-100">
          {isEmailChange ? "Email change failed" : "Confirmation failed"}
        </h1>
        <p className="text-[14px] text-red-400 leading-relaxed">{description}</p>
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          Request a new confirmation email and open the link in the same browser where you
          started the change.
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

export default function AuthCodeErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
          <div className="text-[13px] text-[var(--text-muted)]">Loading…</div>
        </div>
      }
    >
      <AuthCodeErrorContent />
    </Suspense>
  );
}
