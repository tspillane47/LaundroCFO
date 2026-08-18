"use client";

import clsx from "clsx";
import { ReadOnlyGuard } from "@/components/ui/ReadOnlyGuard";

type StatusTab = "needs_review" | "posted" | "excluded" | "all";

export type TransactionReviewMobileBulkBarProps = {
  selectedCount: number;
  activeTab: StatusTab;
  posting: boolean;
  saving: boolean;
  postDisabled: boolean;
  excludeDisabled: boolean;
  deleteDisabled: boolean;
  onPost: () => void;
  onExclude: () => void;
  onDelete: () => void;
};

export function TransactionReviewMobileBulkBar({
  selectedCount,
  activeTab,
  posting,
  saving,
  postDisabled,
  excludeDisabled,
  deleteDisabled,
  onPost,
  onExclude,
  onDelete,
}: TransactionReviewMobileBulkBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={clsx(
        "md:hidden fixed bottom-0 left-0 right-0 z-40",
        "border-t border-[var(--border)] bg-[var(--bg-card)] shadow-[0_-4px_24px_rgba(0,0,0,0.35)]",
        "px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      )}
      role="toolbar"
      aria-label="Bulk transaction actions"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-[13px] font-semibold text-adaptive-info tabular-nums">
          {selectedCount} selected
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {activeTab === "excluded" ? (
          <ReadOnlyGuard>
            <button
              type="button"
              className="col-span-2 min-h-[44px] rounded-lg text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              onClick={onDelete}
              disabled={deleteDisabled || saving || posting}
            >
              Delete
            </button>
          </ReadOnlyGuard>
        ) : (
          <>
            {activeTab === "needs_review" && (
              <ReadOnlyGuard>
                <button
                  type="button"
                  className="btn-primary w-full text-[13px]"
                  onClick={onPost}
                  disabled={postDisabled || posting || saving}
                >
                  {posting ? "Posting…" : "Post"}
                </button>
              </ReadOnlyGuard>
            )}
            <ReadOnlyGuard>
              <button
                type="button"
                className={clsx(
                  "btn-outline w-full text-[13px] text-red-400 border-red-500/30",
                  activeTab !== "needs_review" && "col-span-2"
                )}
                onClick={onExclude}
                disabled={excludeDisabled || saving || posting}
              >
                Exclude
              </button>
            </ReadOnlyGuard>
          </>
        )}
      </div>
    </div>
  );
}
