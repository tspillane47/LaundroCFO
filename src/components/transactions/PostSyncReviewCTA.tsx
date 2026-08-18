"use client";

import clsx from "clsx";
import Link from "next/link";
import { TRANSACTION_REVIEW_ACTION_HREF } from "@/components/transactions/transactionReviewStyles";

type PostSyncReviewCTAProps = {
  count: number;
  href?: string;
  className?: string;
};

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function PostSyncReviewCTA({
  count,
  href = TRANSACTION_REVIEW_ACTION_HREF,
  className,
}: PostSyncReviewCTAProps) {
  if (count <= 0) return null;

  return (
    <Link
      href={href}
      className={clsx(
        "mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-[14px] font-semibold no-underline transition-opacity hover:opacity-90 active:opacity-80 md:hidden",
        className
      )}
      style={{
        background: "var(--bg-warning-tint)",
        border: "1px solid rgba(245, 158, 11, 0.25)",
        color: "var(--text-warning)",
      }}
    >
      Review {count} new transaction{count === 1 ? "" : "s"}
      <ArrowIcon />
    </Link>
  );
}
