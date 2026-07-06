"use client";

import Link from "next/link";
import { readOnlyActionCopy } from "@/lib/access";
import { useAccessStatus } from "@/lib/useAccessStatus";
import { useBetaMode } from "@/lib/useBetaMode";

export function ReadOnlyBanner() {
  const { betaMode, loading: betaLoading } = useBetaMode();
  const { isReadOnly, reason, loading: accessLoading } = useAccessStatus();

  if (betaLoading || accessLoading || betaMode || !isReadOnly) {
    return null;
  }

  const { message, action } = readOnlyActionCopy(reason);

  return (
    <div
      className="flex-shrink-0 px-6 py-2.5 flex items-center justify-between gap-4"
      style={{
        background: "var(--bg-warning-tint, var(--bg-info-tint))",
        borderColor: "var(--border)",
        color: "var(--text-warning, var(--text-info))",
      }}
    >
      <p className="text-[12px] leading-snug">{message}</p>
      <Link
        href="/pricing"
        className="flex-shrink-0 text-[12px] font-semibold underline underline-offset-2 hover:opacity-80"
      >
        {action}
      </Link>
    </div>
  );
}
