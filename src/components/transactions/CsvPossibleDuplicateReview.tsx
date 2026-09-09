"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { fmtDollar } from "@/lib/calculations";
import {
  applyCsvPossibleDuplicateDecisions,
  csvDateOnly,
  formatCsvPossibleDuplicateSaveLabel,
  type CsvExactDuplicateKey,
  type CsvPossibleDuplicateDecision,
  type CsvPossibleDuplicateResult,
} from "@/lib/financials";

export type CsvPossibleDuplicateReviewRow = CsvExactDuplicateKey & {
  transaction_type?: string | null;
};

type CsvPossibleDuplicateReviewProps<T extends CsvPossibleDuplicateReviewRow> = {
  open: boolean;
  result: CsvPossibleDuplicateResult<T>;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (decisions: Record<number, CsvPossibleDuplicateDecision>) => void;
};

function formatReviewDate(value: string): string {
  return new Date(`${csvDateOnly(value)}T12:00:00`).toLocaleDateString();
}

function typeLabel(type: string | null | undefined): string {
  if (type === "income") return "Income";
  if (type === "expense") return "Expense";
  return type?.trim() ? type : "—";
}

function statusLabel(match: {
  id?: string | null;
  status?: string | null;
  excluded?: boolean | null;
}): string {
  if (!match.id) return "Also in this upload";
  if (match.excluded || match.status === "excluded") return "Excluded";
  if (match.status === "posted") return "Posted";
  if (match.status === "needs_review") return "Needs Review";
  if (match.status === "user_classified") return "User Classified";
  if (match.status === "system_classified") return "Auto-Classified";
  if (match.status === "reviewed") return "Reviewed";
  return match.status?.trim() ? match.status : "Saved";
}

function defaultDecisions(indexes: number[]): Record<number, CsvPossibleDuplicateDecision> {
  return Object.fromEntries(indexes.map((index) => [index, "skip"]));
}

function Side({
  title,
  date,
  amount,
  type,
  status,
  description,
  dateDiffers,
}: {
  title: string;
  date: string;
  amount: number;
  type: string | null | undefined;
  status: string;
  description: string | null;
  dateDiffers: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-card2)] p-3 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-adaptive-muted">{title}</div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div
          className={clsx(
            "text-[13px] font-medium",
            dateDiffers ? "text-amber-200" : "text-[var(--text-primary)]"
          )}
        >
          {formatReviewDate(date)}
          {dateDiffers && <span className="ml-2 text-[10px] font-normal text-amber-300/90">Different date</span>}
        </div>
        <div className="text-[13px] font-semibold text-[var(--text-primary)]">{fmtDollar(amount)}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className={clsx("badge text-[10px]", type === "income" ? "badge-green" : type === "expense" ? "badge-red" : "")}>
          {typeLabel(type)}
        </span>
        <span className="badge text-[10px]">{status}</span>
      </div>
      <div className="text-[12px] text-[var(--text-secondary)] break-words whitespace-pre-wrap">
        {description?.trim() ? description : "(no description)"}
      </div>
    </div>
  );
}

export function CsvPossibleDuplicateReview<T extends CsvPossibleDuplicateReviewRow>({
  open,
  result,
  saving = false,
  onCancel,
  onConfirm,
}: CsvPossibleDuplicateReviewProps<T>) {
  const indexes = useMemo(
    () => result.possible.map((item) => item.stagedIndex),
    [result.possible]
  );
  const indexKey = indexes.join(",");
  const [decisions, setDecisions] = useState<Record<number, CsvPossibleDuplicateDecision>>(() =>
    defaultDecisions(indexes)
  );

  useEffect(() => {
    setDecisions(defaultDecisions(indexKey ? indexKey.split(",").map(Number) : []));
  }, [indexKey]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const applied = applyCsvPossibleDuplicateDecisions(result, decisions);
  const insertCount = applied.toInsert.length;
  const possibleSkipCount = applied.possibleSkippedCount;
  const saveLabel = formatCsvPossibleDuplicateSaveLabel(insertCount, possibleSkipCount);

  if (!open) return null;

  function handleSkipAll() {
    const confirmed = window.confirm(
      `Skip all ${result.possible.length} possible duplicate${result.possible.length === 1 ? "" : "s"}? They will not be saved.`
    );
    if (!confirmed) return;
    setDecisions(Object.fromEntries(indexes.map((index) => [index, "skip"])));
  }

  function handleInsertAll() {
    const confirmed = window.confirm(
      `Insert all ${result.possible.length} possible duplicate${result.possible.length === 1 ? "" : "s"} anyway? They may already exist in this store.`
    );
    if (!confirmed) return;
    setDecisions(Object.fromEntries(indexes.map((index) => [index, "insert"])));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-possible-duplicate-title"
        className="card max-w-4xl w-full max-h-[90vh] flex flex-col space-y-4"
      >
        <div>
          <h2 id="csv-possible-duplicate-title" className="text-[15px] font-semibold text-adaptive-primary">
            Possible duplicates
          </h2>
          <p className="text-[12px] text-adaptive-muted mt-1">
            These new CSV rows match an existing transaction in the same month for the same amount. Descriptions and
            types can differ. Skip is the default — insert anyway only if this is a real new transaction.
          </p>
          {result.exactSkip.length > 0 && (
            <p className="text-[12px] text-adaptive-muted mt-2">
              {result.exactSkip.length} exact duplicate{result.exactSkip.length === 1 ? "" : "s"} will be skipped
              automatically.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline text-[12px]" onClick={handleSkipAll} disabled={saving}>
            Skip all
          </button>
          <button type="button" className="btn-outline text-[12px]" onClick={handleInsertAll} disabled={saving}>
            Insert all
          </button>
        </div>

        <div className="overflow-y-auto space-y-4 pr-1">
          {result.possible.map((item, index) => {
            const decision = decisions[item.stagedIndex] ?? "skip";
            const datesDiffer = csvDateOnly(item.staged.transaction_date) !== csvDateOnly(item.match.transaction_date);
            const stagedType =
              "transaction_type" in item.staged
                ? (item.staged as CsvPossibleDuplicateReviewRow).transaction_type
                : null;
            return (
              <div
                key={`${item.stagedIndex}-${csvDateOnly(item.staged.transaction_date)}-${item.staged.amount}`}
                className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] font-medium text-amber-200">
                    Possible duplicate {index + 1} of {result.possible.length}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-[12px] font-medium border",
                        decision === "skip"
                          ? "bg-amber-500/20 text-amber-100 border-amber-500/40"
                          : "text-adaptive-muted border-[var(--border)]"
                      )}
                      onClick={() =>
                        setDecisions((prev) => ({ ...prev, [item.stagedIndex]: "skip" }))
                      }
                      disabled={saving}
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-[12px] font-medium border",
                        decision === "insert"
                          ? "bg-blue-500/20 text-adaptive-info border-blue-500/40"
                          : "text-adaptive-muted border-[var(--border)]"
                      )}
                      onClick={() =>
                        setDecisions((prev) => ({ ...prev, [item.stagedIndex]: "insert" }))
                      }
                      disabled={saving}
                    >
                      Insert anyway
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Side
                    title="New CSV row"
                    date={item.staged.transaction_date}
                    amount={item.staged.amount}
                    type={stagedType}
                    status="New (not saved)"
                    description={item.staged.description}
                    dateDiffers={datesDiffer}
                  />
                  <Side
                    title="Existing transaction"
                    date={item.match.transaction_date}
                    amount={item.match.amount}
                    type={item.match.transaction_type}
                    status={statusLabel(item.match)}
                    description={item.match.description}
                    dateDiffers={datesDiffer}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="btn-outline" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onConfirm(decisions)}
            disabled={saving}
          >
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
