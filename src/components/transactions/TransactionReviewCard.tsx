"use client";

import clsx from "clsx";
import { fmtDollar } from "@/lib/calculations";
import { ReadOnlyGuard } from "@/components/ui/ReadOnlyGuard";
import {
  NEEDS_CATEGORY_ROW_CLASS,
  NEEDS_CATEGORY_SELECT_CLASS,
  importCategoryOptionLabel,
} from "@/components/transactions/transactionReviewStyles";
import {
  BANK_IMPORT_CATEGORY_LABELS,
  getImportCategoriesForType,
  isCategoryReadyToPost,
  needsCategorySelection,
  normalizeVendorPattern,
  MONTH_SHORT,
  type BankImportCategory,
  type RuleMatchKind,
  type TransactionPlLink,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/financials";

export type TransactionReviewCardRow = {
  id: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  type: TransactionType;
  category: BankImportCategory;
  suggested: BankImportCategory;
  ruleApplied: RuleMatchKind;
  possibleDuplicate: boolean;
  status: TransactionStatus;
  excluded: boolean;
  exclusion_reason: string | null;
  original_category: string | null;
};

type StatusTab = "needs_review" | "posted" | "excluded" | "all";

function formatTransactionDate(dateStr: string): string {
  return new Date(dateStr.split("T")[0] + "T12:00:00").toLocaleDateString();
}

function formatPlLinkCategory(column: string): string {
  if (column in BANK_IMPORT_CATEGORY_LABELS) {
    return BANK_IMPORT_CATEGORY_LABELS[column as BankImportCategory];
  }
  return column.replace(/_/g, " ");
}

function StatusBadge({ status, excluded }: { status: TransactionStatus; excluded: boolean }) {
  if (excluded || status === "excluded") {
    return <span className="badge badge-red text-[10px]">Excluded</span>;
  }
  if (status === "posted") return <span className="badge badge-green text-[10px]">Posted</span>;
  if (status === "needs_review") return <span className="badge badge-amber text-[10px]">Needs Category</span>;
  if (status === "user_classified") return <span className="badge badge-blue text-[10px]">User Classified</span>;
  if (status === "system_classified") return <span className="badge badge-blue text-[10px]">Auto-Classified</span>;
  if (status === "reviewed") return <span className="badge text-[10px]">Reviewed</span>;
  return <span className="badge text-[10px]">{status}</span>;
}

function CategoryBadge({ category }: { category: BankImportCategory }) {
  if (category === "needs_review") {
    return <span className="badge badge-amber text-[10px]">{BANK_IMPORT_CATEGORY_LABELS[category]}</span>;
  }
  return <span className="badge badge-blue text-[10px]">{BANK_IMPORT_CATEGORY_LABELS[category]}</span>;
}

function TypeBadge({ type }: { type: TransactionType }) {
  return (
    <span className={clsx("badge text-[10px]", type === "income" ? "badge-green" : "badge-red")}>
      {type === "income" ? "Income" : "Expense"}
    </span>
  );
}

function RuleAppliedBadge({ kind }: { kind: RuleMatchKind }) {
  if (!kind) return null;
  return (
    <span className="badge badge-green text-[10px]">
      Rule Applied ({kind === "amount" ? "Amount" : "Vendor"})
    </span>
  );
}

export type TransactionReviewCardProps = {
  row: TransactionReviewCardRow;
  activeTab: StatusTab;
  selected: boolean;
  needsCategory: boolean;
  needsReview: boolean;
  posted: boolean;
  excluded: boolean;
  canWrite: boolean;
  posting: boolean;
  saving: boolean;
  plLink?: TransactionPlLink;
  onSelect: (checked: boolean) => void;
  onCategoryChange: (category: BankImportCategory) => void;
  onPost: () => void;
  onExclude: () => void;
  onSetRule: () => void;
  onReclassify: () => void;
  onDelete: () => void;
  ruleFormPanel?: React.ReactNode;
};

export function TransactionReviewCard({
  row,
  activeTab,
  selected,
  needsCategory,
  needsReview,
  posted,
  excluded,
  canWrite,
  posting,
  saving,
  plLink,
  onSelect,
  onCategoryChange,
  onPost,
  onExclude,
  onSetRule,
  onReclassify,
  onDelete,
  ruleFormPanel,
}: TransactionReviewCardProps) {
  const vendorLabel = normalizeVendorPattern(row.description) || "—";
  const rawDescription = row.description?.trim() || "(no description)";
  const showNeedsReviewActions =
    activeTab === "needs_review" || (activeTab === "all" && needsReview);
  const showPostedActions = activeTab === "posted" || (activeTab === "all" && posted);
  const showExcludedActions = activeTab === "excluded" && excluded;

  return (
    <article
      className={clsx(
        "rounded-xl border p-4 space-y-3",
        needsCategory ? NEEDS_CATEGORY_ROW_CLASS : "bg-[var(--bg-card2)]",
        needsCategory ? "border-amber-500/25" : "border-[var(--border)]"
      )}
    >
      <div className="flex items-start gap-3">
        <label className="flex-shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] -ml-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            disabled={row.possibleDuplicate}
            className="h-5 w-5 rounded border-white/20 disabled:opacity-40"
            aria-label={`Select ${row.description ?? "transaction"}`}
          />
        </label>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div
                className="text-[14px] font-semibold leading-snug text-[var(--text-primary)] break-words"
                title={vendorLabel}
              >
                {vendorLabel}
              </div>
              {rawDescription !== vendorLabel && (
                <div
                  className="text-[12px] text-[var(--text-secondary)] mt-0.5 break-words line-clamp-2"
                  title={rawDescription}
                >
                  {rawDescription}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 text-[15px] font-bold tabular-nums text-[var(--text-primary)]">
              {fmtDollar(row.amount)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[12px] text-[var(--text-secondary)]">
              {formatTransactionDate(row.transaction_date)}
            </span>
            <TypeBadge type={row.type} />
            <StatusBadge status={row.status} excluded={row.excluded} />
          </div>
          {posted && plLink && (
            <div className="text-[11px] text-adaptive-muted mt-1">
              Posted to {MONTH_SHORT[plLink.month - 1]} {plLink.year} · {formatPlLinkCategory(plLink.category)}
            </div>
          )}
          {excluded && row.exclusion_reason && (
            <div className="text-[11px] text-red-400/80 mt-1 break-words">{row.exclusion_reason}</div>
          )}
        </div>
      </div>

      <div>
        <div className="metric-label mb-1.5">Category</div>
        {excluded ? (
          <div className="text-[13px] text-[var(--text-secondary)]">
            {row.original_category
              ? BANK_IMPORT_CATEGORY_LABELS[row.original_category as BankImportCategory] ?? row.original_category
              : "—"}
          </div>
        ) : (
          <div className="space-y-2">
            <select
              value={row.category}
              onChange={(e) => onCategoryChange(e.target.value as BankImportCategory)}
              disabled={!canWrite}
              className={clsx(
                "select-tan w-full min-h-[44px] text-[13px]",
                needsCategorySelection(row.category) && NEEDS_CATEGORY_SELECT_CLASS
              )}
            >
              {getImportCategoriesForType(row.type).map((f) => (
                <option key={f} value={f}>
                  {importCategoryOptionLabel(f)}
                </option>
              ))}
            </select>
            {needsReview && (
              <div className="flex flex-wrap gap-1">
                <CategoryBadge category={row.suggested} />
                <RuleAppliedBadge kind={row.ruleApplied} />
              </div>
            )}
          </div>
        )}
      </div>

      {showNeedsReviewActions && (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <ReadOnlyGuard>
              <button
                type="button"
                className="btn-primary w-full text-[13px]"
                onClick={onPost}
                disabled={!isCategoryReadyToPost(row.category) || posting || row.status === "posted"}
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </ReadOnlyGuard>
            <ReadOnlyGuard>
              <button
                type="button"
                className="btn-outline w-full text-[13px] text-red-400 border-red-500/30"
                onClick={onExclude}
                disabled={posting}
              >
                Exclude
              </button>
            </ReadOnlyGuard>
          </div>
          <ReadOnlyGuard>
            <button
              type="button"
              className="w-full min-h-[44px] text-[12px] font-medium text-adaptive-info"
              onClick={onSetRule}
            >
              Set as Rule
            </button>
          </ReadOnlyGuard>
        </div>
      )}

      {showPostedActions && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <ReadOnlyGuard>
            <button
              type="button"
              className="btn-primary w-full text-[13px]"
              onClick={onReclassify}
              disabled={saving}
            >
              Reclassify
            </button>
          </ReadOnlyGuard>
          <ReadOnlyGuard>
            <button
              type="button"
              className="btn-outline w-full text-[13px] text-red-400 border-red-500/30"
              onClick={onExclude}
            >
              Exclude
            </button>
          </ReadOnlyGuard>
        </div>
      )}

      {showExcludedActions && (
        <ReadOnlyGuard>
          <button
            type="button"
            className="w-full min-h-[44px] rounded-lg text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            onClick={onDelete}
            disabled={saving || posting}
          >
            Delete
          </button>
        </ReadOnlyGuard>
      )}

      {ruleFormPanel && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">{ruleFormPanel}</div>
      )}
    </article>
  );
}
