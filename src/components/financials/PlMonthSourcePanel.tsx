"use client";

import { fmtDollar } from "@/lib/calculations";
import {
  formatPostedManualNote,
  type CategoryProvenance,
} from "@/lib/plProvenance";
import type { ScheduledVsActual } from "@/lib/scheduledVsActual";
import { MONTH_NAMES } from "@/lib/financials";

type PlMonthSourcePanelProps = {
  year: number;
  month: number;
  lines: CategoryProvenance[];
  rentComparison: ScheduledVsActual | null;
};

function isRevenueLine(field: CategoryProvenance["field"]): boolean {
  return (
    field === "revenue" ||
    field === "self_service_revenue" ||
    field === "wdf_revenue" ||
    field === "commercial_revenue" ||
    field === "vending_revenue" ||
    field === "other_revenue"
  );
}

function ProvenanceRow({ line }: { line: CategoryProvenance }) {
  return (
    <div className="py-2 border-b border-[var(--border)] last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-[var(--text-secondary)]">{line.label}</span>
        <span className="text-[12px] font-medium tabular-nums text-[var(--text-primary)]">
          {fmtDollar(line.stored)}
        </span>
      </div>
      {line.manual > 0 && (
        <div className="mt-1 text-[11px] text-amber-200">
          {formatPostedManualNote(line.posted, line.manual)}
        </div>
      )}
    </div>
  );
}

export function PlMonthSourcePanel({
  year,
  month,
  lines,
  rentComparison,
}: PlMonthSourcePanelProps) {
  const revenueLines = lines.filter((line) => isRevenueLine(line.field) && line.field !== "revenue");
  const revenueTotal = lines.find((line) => line.field === "revenue") ?? null;
  const expenseLines = lines.filter((line) => !isRevenueLine(line.field) && line.field !== "debt_service");
  const debtLine = lines.find((line) => line.field === "debt_service") ?? null;
  const hasManual = lines.some((line) => line.manual > 0);

  return (
    <div className="card space-y-4">
      <div>
        <div className="section-title">
          {MONTH_NAMES[month - 1]} {year} — source of each line
        </div>
        <p className="text-[12px] text-[var(--text-muted)] mt-1">
          Posted amounts come from bank transactions linked to this month. Anything above
          that is a manual P&amp;L entry that is not backed by a posted transaction.
        </p>
      </div>

      {rentComparison?.shouldWarn && (
        <div
          className="px-3 py-2.5 rounded-lg text-[12px]"
          style={{
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.25)",
            color: "#fbbf24",
          }}
        >
          Scheduled lease rent is {fmtDollar(rentComparison.scheduled)} but posted rent
          transactions this month are {fmtDollar(rentComparison.actual)}
          {rentComparison.actual <= 0
            ? " — no rent payment is on the books."
            : ` (${rentComparison.variancePct.toFixed(1)}% off the lease).`}
        </div>
      )}

      {rentComparison && rentComparison.scheduled > 0 && (
        <div className="table-scroll">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                <th className="py-2 pr-3 text-left font-medium">Rent</th>
                <th className="py-2 pr-3 text-right font-medium">Scheduled (lease)</th>
                <th className="py-2 pr-3 text-right font-medium">Actual (posted)</th>
                <th className="py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-3 text-[var(--text-secondary)]">Monthly rent</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmtDollar(rentComparison.scheduled)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmtDollar(rentComparison.actual)}</td>
                <td
                  className={`py-2 text-right tabular-nums font-semibold ${
                    rentComparison.shouldWarn ? "text-red-400" : "text-green-400"
                  }`}
                >
                  {rentComparison.variance === 0
                    ? "$0"
                    : `${rentComparison.variance > 0 ? "+" : "-"}${fmtDollar(Math.abs(rentComparison.variance))}`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {hasManual && (
        <div className="text-[11px] text-amber-200/90">
          Highlighted lines include an amount that was typed into the P&amp;L and never
          posted from a bank transaction.
        </div>
      )}

      {revenueLines.length > 0 || revenueTotal ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Revenue
          </div>
          {revenueLines.map((line) => (
            <ProvenanceRow key={line.field} line={line} />
          ))}
          {revenueTotal && <ProvenanceRow line={revenueTotal} />}
        </div>
      ) : null}

      {expenseLines.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Expenses
          </div>
          {expenseLines.map((line) => (
            <ProvenanceRow key={line.field} line={line} />
          ))}
        </div>
      )}

      {debtLine && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Debt service
          </div>
          <ProvenanceRow line={debtLine} />
        </div>
      )}
    </div>
  );
}

export function PlManualSourceNote({ line }: { line: CategoryProvenance | undefined }) {
  if (!line || line.manual <= 0) return null;
  return (
    <div className="mt-1 text-[10px] text-amber-200 leading-snug">
      {formatPostedManualNote(line.posted, line.manual)}
    </div>
  );
}
