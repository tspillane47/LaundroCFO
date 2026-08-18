"use client";

import clsx from "clsx";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { importCategoryOptionLabel } from "@/components/transactions/transactionReviewStyles";
import type { BankImportCategory } from "@/lib/financials";

type CategoryPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  value: BankImportCategory;
  categories: BankImportCategory[];
  onSelect: (category: BankImportCategory) => void;
};

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CategoryPickerSheet({
  open,
  onClose,
  value,
  categories,
  onSelect,
}: CategoryPickerSheetProps) {
  function handleSelect(category: BankImportCategory) {
    onSelect(category);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Choose category">
      <ul className="py-1">
        {categories.map((category) => {
          const selected = category === value;
          return (
            <li key={category}>
              <button
                type="button"
                className={clsx(
                  "flex w-full min-h-[52px] items-center justify-between gap-3 px-4 py-3 text-left text-[14px] transition-colors",
                  selected
                    ? "bg-[var(--bg-warning-tint)] font-semibold text-[var(--text-primary)]"
                    : "text-[var(--text-primary)] active:bg-white/5"
                )}
                onClick={() => handleSelect(category)}
              >
                <span className="min-w-0 flex-1 leading-snug">{importCategoryOptionLabel(category)}</span>
                {selected && (
                  <CheckIcon className="flex-shrink-0 text-[var(--text-warning)]" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
