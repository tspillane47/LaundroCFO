"use client";

import Link from "next/link";
import { cloneElement, isValidElement, useState, type ReactElement } from "react";
import clsx from "clsx";
import { useWriteGuard } from "@/lib/useWriteGuard";

type GuardedElementProps = {
  onClick?: (event: React.MouseEvent) => void;
  className?: string;
  disabled?: boolean;
  type?: string;
};

type ReadOnlyGuardProps = {
  children: ReactElement<GuardedElementProps>;
  align?: "start" | "end" | "stretch";
};

export function ReadOnlyGuard({ children, align = "end" }: ReadOnlyGuardProps) {
  const { canWrite, blockedReason, actionLabel } = useWriteGuard();
  const [messageVisible, setMessageVisible] = useState(false);

  if (canWrite) {
    return children;
  }

  if (!isValidElement(children)) {
    return children;
  }

  const blockedClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMessageVisible(true);
  };

  const alignClass =
    align === "start"
      ? "items-start"
      : align === "stretch"
        ? "items-stretch"
        : "items-end";

  return (
    <div className={clsx("inline-flex flex-col gap-1", alignClass)}>
      {cloneElement(children, {
        onClick: blockedClick,
        disabled: false,
        className: clsx(children.props.className, "opacity-60 cursor-not-allowed"),
        type: children.props.type ?? "button",
      })}
      {messageVisible && blockedReason && (
        <p className="text-[11px] text-right max-w-xs" style={{ color: "var(--text-muted)" }}>
          {blockedReason}{" "}
          <Link href="/pricing" className="font-semibold underline underline-offset-2">
            {actionLabel}
          </Link>
        </p>
      )}
    </div>
  );
}
