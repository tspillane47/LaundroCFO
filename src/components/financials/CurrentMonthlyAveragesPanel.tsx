"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { fmtDollar, fmtPct } from "@/lib/calculations";
import { dscrTextColor, formatDscrDisplay } from "@/lib/financials";
import { metricValueStyle } from "@/lib/metricStyles";
import type { CurrentMonthlyAverages } from "@/lib/getCurrentMonthlyAverages";

type CurrentMonthlyAveragesPanelProps = {
  storeName: string;
  data: CurrentMonthlyAverages | null;
  loading?: boolean;
};

function periodSubtext(monthsUsed: number): string {
  if (monthsUsed === 12) return "Based on Trailing 12 Months (TTM)";
  return `Based on the last ${monthsUsed} month${monthsUsed === 1 ? "" : "s"}`;
}

function waterStatusBadgeClass(status: CurrentMonthlyAverages["waterKPI"]["status"]): string {
  if (status === "Healthy") return "badge-green";
  if (status === "Watch") return "badge-amber";
  return "badge-red";
}

function LineItem({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="py-1.5 text-[11px] border-b border-[var(--border)] last:border-0 min-w-0 space-y-1">
      <span className="block text-adaptive-muted leading-snug break-words" title={label}>
        {label}
      </span>
      <span className="flex items-center justify-end gap-1 flex-wrap min-w-0">
        {badge && (
          <span className="text-[8px] font-medium uppercase tracking-wide text-adaptive-muted bg-white/[0.04] px-1 py-0.5 rounded">
            {badge}
          </span>
        )}
        <span className="text-adaptive-secondary tabular-nums text-[11px] leading-none" title={value}>
          {value}
        </span>
      </span>
    </div>
  );
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="pt-2 mt-1 border-t border-[var(--border)] min-w-0 space-y-1">
      <span className="block text-[10px] font-semibold text-adaptive-secondary leading-snug break-words" title={label}>
        {label}
      </span>
      <span className="block text-[12px] font-bold text-adaptive-primary tabular-nums text-right leading-none" title={value}>
        {value}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-adaptive-muted mb-2">
      {children}
    </div>
  );
}

function HeroMetric({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="py-2 overflow-hidden min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-adaptive-muted mb-1 leading-snug break-words">
        {label}
      </div>
      <div
        className={clsx("font-bold tabular-nums leading-none text-right", valueClassName ?? "text-adaptive-primary")}
        style={metricValueStyle(value, { base: 20, compact: 16, xs: 14, inheritColor: !!valueClassName })}
        title={value}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-adaptive-muted mt-1 leading-snug break-words text-right" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}

const RENT_CATEGORY = "Rent";

function visibleCategories(items: CurrentMonthlyAverages["revenue"]["byCategory"]) {
  return items.filter((item) => Math.abs(item.monthlyAverage) >= 0.005);
}

type ExpenseDisplayLine = {
  category: string;
  value: string;
  badge?: string;
};

function expenseLinesForDisplay(data: CurrentMonthlyAverages): ExpenseDisplayLine[] {
  const lines: ExpenseDisplayLine[] = [];

  for (const item of data.expenses.byCategory) {
    if (item.category === RENT_CATEGORY) {
      if (data.rentSource === "none") {
        lines.push({ category: RENT_CATEGORY, value: "—" });
      } else if (data.rentSource === "lease") {
        lines.push({
          category: RENT_CATEGORY,
          value: fmtDollar(item.monthlyAverage),
          badge: "From lease",
        });
      } else if (Math.abs(item.monthlyAverage) >= 0.005) {
        lines.push({ category: RENT_CATEGORY, value: fmtDollar(item.monthlyAverage) });
      }
      continue;
    }

    if (Math.abs(item.monthlyAverage) >= 0.005) {
      lines.push({ category: item.category, value: fmtDollar(item.monthlyAverage) });
    }
  }

  return lines;
}

export function CurrentMonthlyAveragesPanel({
  storeName,
  data,
  loading = false,
}: CurrentMonthlyAveragesPanelProps) {
  if (loading) {
    return (
      <div className="card h-full">
        <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Loading averages…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card h-full">
        <div className="section-title">Current Monthly Averages</div>
        <p className="text-[12px] text-adaptive-muted">
          Add financial data to see monthly averages for {storeName || "this store"}.
        </p>
      </div>
    );
  }

  const revenueLines = visibleCategories(data.revenue.byCategory);
  const expenseLines = expenseLinesForDisplay(data);
  const surplusColor =
    data.surplusCashFlow >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="card h-full min-w-0 overflow-hidden space-y-4">
      <div className="min-w-0">
        <div className="section-title">Current Monthly Averages</div>
        <div className="text-[12px] font-medium text-adaptive-secondary mt-0.5 truncate" title={storeName}>
          {storeName}
        </div>
        <div className="text-[10px] text-adaptive-muted mt-1 leading-snug">{periodSubtext(data.monthsUsed)}</div>
      </div>

      <div>
        <SectionLabel>Revenue</SectionLabel>
        <div className="space-y-0">
          {revenueLines.map((item) => (
            <LineItem key={item.category} label={item.category} value={fmtDollar(item.monthlyAverage)} />
          ))}
          {revenueLines.length === 0 && (
            <p className="text-[12px] text-adaptive-muted py-1">No revenue categories recorded.</p>
          )}
          <TotalLine label="Average Monthly Revenue" value={fmtDollar(data.revenue.total)} />
        </div>
      </div>

      <div>
        <SectionLabel>Expenses</SectionLabel>
        <div className="space-y-0">
          {expenseLines.map((item) => (
            <LineItem
              key={item.category}
              label={item.category}
              value={item.value}
              badge={item.badge}
            />
          ))}
          {expenseLines.length === 0 && (
            <p className="text-[12px] text-adaptive-muted py-1">No expense categories recorded.</p>
          )}
          <TotalLine label="Average Monthly Expenses" value={fmtDollar(data.expenses.total)} />
        </div>
      </div>

      <div className="rounded-lg bg-[var(--bg-card2)] border border-[var(--border)] px-2.5 py-1 min-w-0">
        <HeroMetric
          label="Average Monthly EBITDA"
          value={fmtDollar(data.ebitda.monthly)}
          sub={`EBITDA Margin ${fmtPct(data.ebitda.margin * 100)}`}
          valueClassName="positive"
        />
      </div>

      <div>
        <SectionLabel>Monthly Debt Service</SectionLabel>
        {data.debt.loans.length === 0 ? (
          <p className="text-[12px] text-adaptive-muted">No Active Debt</p>
        ) : (
          <div className="space-y-0">
            {data.debt.loans.map((loan) => (
              <LineItem
                key={loan.name}
                label={loan.name}
                value={fmtDollar(loan.monthlyPayment)}
              />
            ))}
            <TotalLine
              label="Total Debt Service"
              value={fmtDollar(data.debt.totalMonthlyDebtService)}
            />
          </div>
        )}
      </div>

      <div className="rounded-lg bg-[var(--bg-card2)] border border-[var(--border)] px-2.5 py-1 min-w-0">
        <HeroMetric
          label="Surplus Cash Flow"
          value={fmtDollar(data.surplusCashFlow)}
          sub="EBITDA minus debt service"
          valueClassName={surplusColor}
        />
      </div>

      <div className="rounded-lg bg-[var(--bg-card2)] border border-[var(--border)] px-2.5 py-1 min-w-0">
        <HeroMetric
          label="Current DSCR"
          sub="Based on active loan terms"
          value={formatDscrDisplay(data.dscr, data.debt.totalMonthlyDebtService * 12)}
          valueClassName={dscrTextColor(data.dscr, data.debt.totalMonthlyDebtService > 0)}
        />
      </div>

      {data.equity && (
        <div>
          <SectionLabel>Equity Snapshot</SectionLabel>
          <div className="space-y-0">
            <LineItem label="Store Value" value={fmtDollar(data.equity.storeValue)} />
            <LineItem label="Debt" value={fmtDollar(data.equity.debt)} />
            <TotalLine label="Store Equity" value={fmtDollar(data.equity.equity)} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1 border-t border-[var(--border)] min-w-0">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-adaptive-muted mb-1">
            Water KPI
          </div>
          <div className="text-[14px] font-bold tabular-nums text-adaptive-primary text-right">
            {fmtPct(data.waterKPI.ratio * 100)}
          </div>
          <div className="text-[10px] text-adaptive-muted mt-0.5 leading-snug">
            Water ÷ self-service revenue
          </div>
        </div>
        <span className={clsx("badge text-[9px] self-end", waterStatusBadgeClass(data.waterKPI.status))}>
          {data.waterKPI.status}
        </span>
      </div>
    </div>
  );
}
