"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Optional id for aria-labelledby */
  titleId?: string;
};

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function BottomSheet({ open, onClose, title, children, titleId = "bottom-sheet-title" }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) {
      setMounted(false);
      return;
    }

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => setMounted(true));

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        className={clsx(
          "absolute inset-0 bg-black/60 transition-opacity duration-300",
          mounted ? "opacity-100" : "opacity-0"
        )}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          "absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl transition-transform duration-300 ease-out",
          mounted ? "translate-y-0" : "translate-y-full"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-[var(--border)] px-4 pb-3 pt-4">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-[15px] font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            <button
              type="button"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-white/5"
              onClick={onClose}
              aria-label="Cancel"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
