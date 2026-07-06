"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { storeLimitUpgradeMessage } from "@/lib/access";
import { useAccessStatus } from "@/lib/useAccessStatus";

type AddStoreLinkProps = {
  className?: string;
  children?: React.ReactNode;
  firstStore?: boolean;
};

export function AddStoreLink({
  className,
  children = "+ Add Store",
  firstStore = false,
}: AddStoreLinkProps) {
  const { plan, maxStores, storeCount, loading } = useAccessStatus();
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const atLimit = !loading && maxStores !== null && storeCount >= maxStores;

  if (atLimit) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          className={clsx(className, "opacity-60 cursor-not-allowed")}
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
    <Link href={firstStore ? "/onboarding" : "/onboarding?add=true"} className={className}>
      {children}
    </Link>
  );
}
