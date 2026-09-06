"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDollar } from "@/lib/calculations";
import { useContainerSize } from "@/lib/useContainerSize";
import {
  thisMonthEmptyMessage,
  thisMonthTickInterval,
  type ThisMonthChartModel,
} from "@/lib/thisMonthChart";
import {
  formatCompactChartDollar,
  toYearChartPlotData,
  YEAR_CHART_EBITDA_COLOR,
  YEAR_CHART_EBITDA_GLOW,
  YEAR_CHART_REVENUE_COLOR,
  YEAR_CHART_REVENUE_GLOW,
  yearChartHasNegative,
  yearChartValueDomain,
} from "@/lib/yearRevenueEbitdaChart";

export const THIS_MONTH_CHART_HEIGHT = 240;
export const THIS_MONTH_CHART_MIN_WIDTH = 320;

function ChartTooltip({
  active,
  payload,
  label,
  monthLabel,
}: {
  active?: boolean;
  payload?: { value?: number | null; name?: string; color?: string; dataKey?: string }[];
  label?: string;
  monthLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((entry) => entry.value != null);
  if (rows.length === 0) return null;

  const revenue = rows.find((entry) => entry.dataKey === "revenue")?.value;
  const ebitda = rows.find((entry) => entry.dataKey === "ebitda")?.value;
  const margin =
    revenue != null && revenue > 0 && ebitda != null ? (ebitda / revenue) * 100 : null;

  return (
    <div
      className="rounded-xl px-3.5 py-2.5 text-xs min-w-[156px]"
      style={{
        background: "rgba(10, 15, 28, 0.78)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(37, 99, 235, 0.45)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(37, 99, 235, 0.16)",
        color: "#f1f5f9",
      }}
    >
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: YEAR_CHART_REVENUE_COLOR }}>
        {monthLabel} {label}
      </div>
      {rows.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-semibold tabular-nums text-white">
            {fmtDollar(entry.value as number)}
          </span>
        </div>
      ))}
      {margin != null && (
        <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t" style={{ borderColor: "rgba(37, 99, 235, 0.22)" }}>
          <span className="text-slate-400">EBITDA Margin</span>
          <span className="font-semibold tabular-nums" style={{ color: YEAR_CHART_EBITDA_COLOR }}>
            {margin.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

function SeriesLegend() {
  return (
    <div className="flex items-center justify-center gap-6 text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
      <span className="flex items-center gap-2">
        <span
          className="w-5 h-[3px] rounded-full shrink-0"
          style={{
            background: YEAR_CHART_REVENUE_COLOR,
            boxShadow: "0 0 8px rgba(37, 99, 235, 0.85)",
          }}
        />
        Revenue
      </span>
      <span className="flex items-center gap-2">
        <span
          className="w-5 h-[3px] rounded-full shrink-0"
          style={{
            background: YEAR_CHART_EBITDA_COLOR,
            boxShadow: "0 0 8px rgba(34, 197, 94, 0.85)",
          }}
        />
        EBITDA
      </span>
    </div>
  );
}

export function ThisMonthChart({
  model,
}: {
  model: ThisMonthChartModel;
}) {
  const domain = yearChartValueDomain(model.points);
  const hasNegative = yearChartHasNegative(model.points);
  const plotData = toYearChartPlotData(model.points);
  const { ref: plotRef, width: plotWidth } = useContainerSize();
  const chartWidth = Math.max(plotWidth, THIS_MONTH_CHART_MIN_WIDTH);
  const showChart = model.hasCategorizedActivity && model.points.length > 0;

  return (
    <div className="card chart-neon-card min-w-0" data-testid="dashboard-this-month-chart">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div className="section-title mb-0">This Month</div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {model.monthLabel} · {model.throughLabel} · cumulative, no forecast
          </div>
        </div>
        <div className="text-[20px] font-bold tabular-nums" style={{ color: YEAR_CHART_REVENUE_COLOR }}>
          {showChart ? fmtDollar(model.latestRevenue) : "—"}
        </div>
      </div>
      <div className="overflow-x-auto">
      <div
        ref={plotRef}
        className="w-full"
        style={{ height: THIS_MONTH_CHART_HEIGHT, minWidth: THIS_MONTH_CHART_MIN_WIDTH }}
      >
        {showChart ? (
          <AreaChart
            width={chartWidth}
            height={THIS_MONTH_CHART_HEIGHT}
            data={plotData}
            margin={{ top: 12, right: 8, left: 0, bottom: hasNegative ? 12 : 4 }}
          >
            <defs>
              <linearGradient id="thisMonthRevAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={YEAR_CHART_REVENUE_COLOR} stopOpacity={0.32} />
                <stop offset="100%" stopColor={YEAR_CHART_REVENUE_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="thisMonthEbitdaAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={YEAR_CHART_EBITDA_COLOR} stopOpacity={0.28} />
                <stop offset="100%" stopColor={YEAR_CHART_EBITDA_COLOR} stopOpacity={0} />
              </linearGradient>
              <filter id="thisMonthRevLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={YEAR_CHART_REVENUE_COLOR} floodOpacity="0.95" />
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={YEAR_CHART_REVENUE_COLOR} floodOpacity="0.4" />
              </filter>
              <filter id="thisMonthEbitdaLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={YEAR_CHART_EBITDA_COLOR} floodOpacity="0.95" />
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={YEAR_CHART_EBITDA_COLOR} floodOpacity="0.4" />
              </filter>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.08)" strokeDasharray="3 6" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              interval={thisMonthTickInterval(model.points.length)}
            />
            <YAxis
              domain={domain}
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v) => formatCompactChartDollar(Number(v))}
            />
            {hasNegative && <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />}
            <Tooltip
              content={<ChartTooltip monthLabel={model.monthLabel} />}
              cursor={{ stroke: "rgba(148,163,184,0.25)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke={YEAR_CHART_REVENUE_COLOR}
              strokeWidth={2.75}
              fill="url(#thisMonthRevAreaFill)"
              connectNulls={false}
              dot={false}
              activeDot={{ r: 5, fill: YEAR_CHART_REVENUE_COLOR, stroke: "#93c5fd", strokeWidth: 2 }}
              style={{ filter: YEAR_CHART_REVENUE_GLOW }}
              filter="url(#thisMonthRevLineGlow)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="ebitda"
              name="EBITDA"
              stroke={YEAR_CHART_EBITDA_COLOR}
              strokeWidth={2.75}
              fill="url(#thisMonthEbitdaAreaFill)"
              connectNulls={false}
              dot={false}
              activeDot={{ r: 5, fill: YEAR_CHART_EBITDA_COLOR, stroke: "#86efac", strokeWidth: 2 }}
              style={{ filter: YEAR_CHART_EBITDA_GLOW }}
              filter="url(#thisMonthEbitdaLineGlow)"
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <div className="flex items-center justify-center h-full text-[13px] text-center px-4" style={{ color: "var(--text-muted)" }}>
            {thisMonthEmptyMessage(model)}
          </div>
        )}
      </div>
      </div>
      <div className="mt-3">
        <SeriesLegend />
      </div>
    </div>
  );
}
