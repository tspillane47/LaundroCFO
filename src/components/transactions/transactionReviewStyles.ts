import {
  BANK_IMPORT_CATEGORY_LABELS,
  type BankImportCategory,
} from "@/lib/financials";

/** Full-row background wash for uncategorized review rows (matches --bg-warning-tint). */
export const NEEDS_CATEGORY_ROW_CLASS = "needs-category-row";

/** Category dropdown integrated with the row's amber wash. */
export const NEEDS_CATEGORY_SELECT_CLASS = "needs-category-select";

/** Instructional placeholder for the category select when none is chosen yet. */
export const NEEDS_CATEGORY_PLACEHOLDER = "Choose a category…";

export function importCategoryOptionLabel(category: BankImportCategory): string {
  if (category === "needs_review") return NEEDS_CATEGORY_PLACEHOLDER;
  return BANK_IMPORT_CATEGORY_LABELS[category];
}

export const TRANSACTION_REVIEW_ACTION_HREF = "/transactions?tab=needs_review";

export const transactionReviewActionCardStyle = {
  background: "var(--bg-warning-tint)",
  border: "1px solid rgba(245, 158, 11, 0.15)",
} as const;
