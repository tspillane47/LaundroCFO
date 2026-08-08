"use client";

import { useState } from "react";
import clsx from "clsx";

type CopyableEmailProps = {
  email: string;
  className?: string;
};

export function CopyableEmail({ email, className }: CopyableEmailProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      window.prompt("Copy this email:", email);
    }
  }

  return (
    <div
      className={clsx(
        "flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-xl px-4 py-3",
        className
      )}
      style={{ background: "var(--bg-page)", border: "1px solid var(--border)" }}
    >
      <code
        className="flex-1 text-[15px] sm:text-[16px] font-semibold break-all text-left"
        style={{ color: "var(--text-primary)" }}
      >
        {email}
      </code>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="btn-outline px-4 py-2 text-[13px] font-medium flex-shrink-0"
      >
        {copied ? "Copied!" : "Copy email"}
      </button>
    </div>
  );
}
