import clsx from "clsx";
import { BANK_IMPORT_CATEGORY_LABELS, type BankImportCategory } from "@/lib/financials";

type RuleApplyPromptProps = {
  applyPrompt: {
    matchCount: number;
    category: BankImportCategory;
  } | null;
  applyResult: {
    updatedCount: number;
    skippedManualCount: number;
    category: BankImportCategory;
  } | null;
  postPrompt: {
    count: number;
    category: BankImportCategory;
  } | null;
  applying: boolean;
  posting: boolean;
  onApplyAll: () => void;
  onSkipApply: () => void;
  onPostAll: () => void;
  onReviewFirst: () => void;
};

export function RuleApplyPrompt({
  applyPrompt,
  applyResult,
  postPrompt,
  applying,
  posting,
  onApplyAll,
  onSkipApply,
  onPostAll,
  onReviewFirst,
}: RuleApplyPromptProps) {
  if (!applyPrompt && !applyResult && !postPrompt) return null;

  const categoryLabel = (category: BankImportCategory) => BANK_IMPORT_CATEGORY_LABELS[category];

  return (
    <div className="mb-4 space-y-3">
      {applyPrompt && (
        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[12px] text-adaptive-secondary">
          <p>
            This rule matches {applyPrompt.matchCount} unposted transaction
            {applyPrompt.matchCount === 1 ? "" : "s"} in your review queue. Apply category &apos;
            {categoryLabel(applyPrompt.category)}&apos; to all of them?
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              className="btn-primary text-[11px]"
              disabled={applying}
              onClick={onApplyAll}
            >
              {applying ? "Applying…" : "Apply to All"}
            </button>
            <button type="button" className="btn-outline text-[11px]" disabled={applying} onClick={onSkipApply}>
              Skip
            </button>
          </div>
        </div>
      )}

      {applyResult && (
        <div
          className="rounded-lg p-3 text-[12px]"
          style={{
            background: "var(--bg-success-tint)",
            color: "var(--text-success)",
          }}
        >
          Updated {applyResult.updatedCount} transaction{applyResult.updatedCount === 1 ? "" : "s"} to{" "}
          {categoryLabel(applyResult.category)}
          {applyResult.skippedManualCount > 0 && (
            <span className="block mt-1 text-[11px] opacity-90">
              {applyResult.skippedManualCount} transaction
              {applyResult.skippedManualCount === 1 ? " was" : "s were"} skipped because they were manually
              categorized
            </span>
          )}
        </div>
      )}

      {postPrompt && (
        <div className="p-4 rounded-lg bg-[var(--bg-card)]/80 border border-[var(--border)] text-[12px] text-[var(--text-primary)] shadow-sm">
          <p>
            Would you like to post all {postPrompt.count} transaction{postPrompt.count === 1 ? "" : "s"} to P&L
            now?
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              className="btn-primary text-[11px]"
              disabled={posting}
              onClick={onPostAll}
            >
              {posting ? "Posting…" : "Post All Now"}
            </button>
            <button
              type="button"
              className={clsx("btn-outline text-[11px]")}
              disabled={posting}
              onClick={onReviewFirst}
            >
              I&apos;ll review first
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
