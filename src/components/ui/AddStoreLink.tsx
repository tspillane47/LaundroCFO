"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { ReadOnlyGuard } from "@/components/ui/ReadOnlyGuard";
import { storeLimitUpgradeMessage } from "@/lib/access";
import { useAccessStatus } from "@/lib/useAccessStatus";
import { useWriteGuard } from "@/lib/useWriteGuard";

type AddStoreLinkProps = {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  firstStore?: boolean;
  href?: string;
};

export function AddStoreLink({
  className,
  style,
  children = "+ Add Store",
  firstStore = false,
  href,
}: AddStoreLinkProps) {
  const { plan, maxStores, storeCount, loading } = useAccessStatus();
  const { canWrite } = useWriteGuard();
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const linkHref = href ?? (firstStore ? "/onboarding" : "/onboarding?add=true");
  const atLimit = !loading && maxStores !== null && storeCount >= maxStores;

  if (loading) {
    return (
      <span
        className={clsx(className, "opacity-60 cursor-not-allowed")}
        style={style}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }

  // Read-only first: expired trial / canceled subs can't save regardless of store count.
  if (!canWrite) {
    return (
      <ReadOnlyGuard align="end">
        <Link href={linkHref} className={className} style={style}>
          {children}
        </Link>
      </ReadOnlyGuard>
    );
  }

  if (atLimit) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          className={clsx(className, "opacity-60 cursor-not-allowed")}
          style={style}
          onClick={() => setLimitMessage(storeLimitUpgradeMessage(plan))}
        >
          {children}
        </button>
        {limitMessage && (
          <p className="text-[11px] text-right max-w-xs" style={{ color: "var(--text-muted)" }}>
            {limitMessage}{" "}
            <Link href="/pricing" className="font-semibold underline underline-offset-2">
              View plans
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <Link href={linkHref} className={className} style={style}>
      {children}
    </Link>
  );
}
