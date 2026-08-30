"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AuthConfirmationError } from "@/components/auth/AuthConfirmationError";
import { resolveAuthConfirmationErrorKind } from "@/lib/auth-callback";

function AuthCodeErrorContent() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const technicalMessage = searchParams.get("message");
  const kind = useMemo(() => resolveAuthConfirmationErrorKind(type), [type]);

  return (
    <AuthConfirmationError
      kind={kind}
      technicalMessage={technicalMessage}
      logContext="auth-code-error"
    />
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
