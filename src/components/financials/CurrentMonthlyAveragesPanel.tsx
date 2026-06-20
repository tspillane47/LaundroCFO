"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { fmtDollar, fmtMultiple, fmtPct } from "@/lib/calculations";
import { dscrTextColor } from "@/lib/financials";
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

function LineItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px] border-b border-white/[0.04] last:border-0 min-w-0">
      <span className="text-slate-400 truncate" title={label}>{label}</span>
      <span className="text-slate-200 tabular-nums shrink-0 whitespace-nowrap" title={value}>{value}</span>
    </div>
  );
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-white/[0.08] min-w-0">
      <span className="text-[12px] font-semibold text-slate-200 truncate" title={label}>{label}</span>
      <span className="text-[13px] font-bold text-slate-100 tabular-nums shrink-0 whitespace-nowrap" title={value}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
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
    <div className="py-3 overflow-hidden min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </div>
      <div
        className={clsx("font-bold tabular-nums leading-none", valueClassName ?? "text-slate-100")}
        style={metricValueStyle(value, { base: 28, compact: 22, xs: 18, inheritColor: !!valueClassName })}
        title={value}
      >
        {value}
      </div>
      {sub && <div className="text-[12px] text-slate-500 mt-1.5 truncate" title={sub}>{sub}</div>}
    </div>
  );
}

function visibleCategories(items: CurrentMonthlyAverages["revenue"]["byCategory"]) {
  return items.filter((item) => Math.abs(item.monthlyAverage) >= 0.005);
}

export function CurrentMonthlyAveragesPanel({
  storeName,
  data,
  loading = false,
}: CurrentMonthlyAveragesPanelProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Loading averages…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <div className="section-title">Current Monthly Averages</div>
        <p className="text-[12px] text-slate-500">
          Add financial data to see monthly averages for {storeName || "this store"}.
        </p>
      </div>
    );
  }

  const revenueLines = visibleCategories(data.revenue.byCategory);
  const expenseLines = visibleCategories(data.expenses.byCategory);
  const surplusColor =
    data.surplusCashFlow >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="card space-y-5">
      <div>
        <div className="section-title">Current Monthly Averages</div>
        <div className="text-[13px] font-medium text-slate-200 mt-0.5">{storeName}</div>
        <div className="text-[11px] text-slate-500 mt-1">{periodSubtext(data.monthsUsed)}</div>
      </div>

      <div>
        <SectionLabel>Revenue</SectionLabel>
        <div className="space-y-0">
          {revenueLines.map((item) => (
            <LineItem key={item.category} label={item.category} value={fmtDollar(item.monthlyAverage)} />
          ))}
          {revenueLines.length === 0 && (
            <p className="text-[12px] text-slate-500 py-1">No revenue categories recorded.</p>
          )}
          <TotalLine label="Average Monthly Revenue" value={fmtDollar(data.revenue.total)} />
        </div>
      </div>

      <div>
        <SectionLabel>Expenses</SectionLabel>
        <div className="space-y-0">
          {expenseLines.map((item) => (
            <LineItem key={item.category} label={item.category} value={fmtDollar(item.monthlyAverage)} />
          ))}
          {expenseLines.length === 0 && (
            <p className="text-[12px] text-slate-500 py-1">No expense categories recorded.</p>
          )}
          <TotalLine label="Average Monthly Expenses" value={fmtDollar(data.expenses.total)} />
        </div>
      </div>

      <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-1">
        <HeroMetric
          label="Average Monthly EBITDA"
          value={fmtDollar(data.ebitda.monthly)}
          sub={`EBITDA Margin ${fmtPct(data.ebitda.margin * 100)}`}
          valueClassName="text-green-400"
        />
      </div>

      <div>
        <SectionLabel>Monthly Debt Service</SectionLabel>
        {data.debt.loans.length === 0 ? (
          <p className="text-[12px] text-slate-500">No Active Debt</p>
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

      <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-1">
        <HeroMetric
          label="Surplus Cash Flow"
          value={fmtDollar(data.surplusCashFlow)}
          sub="EBITDA minus debt service"
          valueClassName={surplusColor}
        />
      </div>

      {data.dscr != null && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-1">
          <HeroMetric
            label="Current DSCR (based on active loan terms)"
            value={fmtMultiple(data.dscr)}
            valueClassName={dscrTextColor(data.dscr)}
          />
        </div>
      )}

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

      <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/[0.06]">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Water KPI
          </div>
          <div className="text-[16px] font-bold tabular-nums text-slate-100">
            {fmtPct(data.waterKPI.ratio * 100)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Water ÷ self-service revenue</div>
        </div>
        <span className={clsx("badge text-[10px]", waterStatusBadgeClass(data.waterKPI.status))}>
          {data.waterKPI.status}
        </span>
      </div>
    </div>
  );
}
