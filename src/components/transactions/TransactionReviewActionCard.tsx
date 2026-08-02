"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  TRANSACTION_REVIEW_ACTION_HREF,
  transactionReviewActionCardStyle,
} from "@/components/transactions/transactionReviewStyles";

function TagIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l6.59-6.59a1 1 0 0 0 0-1.41L12 2Z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

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

type TransactionReviewActionCardProps = {
  count: number;
  href?: string | null;
  storeName?: string;
  className?: string;
  compact?: boolean;
};

export function TransactionReviewActionCard({
  count,
  href = TRANSACTION_REVIEW_ACTION_HREF,
  storeName,
  className,
  compact = false,
}: TransactionReviewActionCardProps) {
  const body = (
    <div
      className={clsx(
        "rounded-lg flex items-center gap-3 transition-opacity",
        compact ? "px-3 py-2.5" : "px-4 py-3",
        href && "hover:opacity-90",
        className
      )}
      style={transactionReviewActionCardStyle}
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center"
        style={{
          background: "rgba(245, 158, 11, 0.12)",
          color: "var(--text-warning)",
        }}
      >
        <TagIcon />
      </div>
      <div className="flex-1 min-w-0">
        {storeName && (
          <div
            className="text-[10px] uppercase tracking-wider mb-0.5 truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {storeName}
          </div>
        )}
        <p className={clsx("leading-snug", compact ? "text-[12px]" : "text-[13px]")} style={{ color: "var(--text-primary)" }}>
          <strong className="font-bold tabular-nums" style={{ color: "var(--text-warning)" }}>
            {count}
          </strong>{" "}
          transaction{count === 1 ? "" : "s"} need{count === 1 ? "s" : ""} a category
        </p>
        {!compact && (
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Assign categories in the review queue before posting.
          </p>
        )}
      </div>
      {href && (
        <div
          className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium"
          style={{ color: "var(--text-warning)" }}
        >
          Review
          <ArrowIcon />
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {body}
      </Link>
    );
  }

  return body;
}
