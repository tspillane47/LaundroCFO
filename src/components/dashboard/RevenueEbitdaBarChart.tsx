"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDollar } from "@/lib/calculations";
import { useContainerSize } from "@/lib/useContainerSize";
import { INSUFFICIENT_HISTORY_MESSAGE } from "@/lib/valuationHistory";
import {
  DASHBOARD_CHART_BAR_GAP,
  DASHBOARD_CHART_BAR_SIZE,
  DASHBOARD_CHART_CATEGORY_GAP,
  YEAR_CHART_EBITDA_COLOR,
  YEAR_CHART_EBITDA_GLOW,
  YEAR_CHART_REVENUE_COLOR,
  YEAR_CHART_REVENUE_GLOW,
  formatCompactChartDollar,
} from "@/lib/yearRevenueEbitdaChart";

const REVENUE_BAR_FILL = "rgba(37, 99, 235, 0.82)";
const REVENUE_BAR_STROKE = "rgba(147, 197, 253, 0.95)";
const EBITDA_BAR_FILL = "rgba(34, 197, 94, 0.82)";
const EBITDA_BAR_STROKE = "rgba(134, 239, 172, 0.95)";

function GlowBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  filter?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill, filter, stroke, strokeWidth } = props;
  if (!width || !height) return null;
  const absH = Math.abs(height);
  const top = height < 0 ? y + height : y;
  return (
    <g filter={filter}>
      <Rectangle
        x={x}
        y={top}
        width={width}
        height={absH}
        radius={[6, 6, 0, 0]}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </g>
  );
}

function RevenueEbitdaTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const revenue = payload.find((p) => p.dataKey === "revenue")?.value;
  const ebitda = payload.find((p) => p.dataKey === "ebitda")?.value;
  const margin = revenue && revenue > 0 && ebitda != null ? (ebitda / revenue) * 100 : null;

  return (
    <div
      className="rounded-xl px-3.5 py-2.5 text-xs min-w-[156px]"
      style={{
        background: "rgba(10, 15, 28, 0.72)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(37, 99, 235, 0.5)",
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(37, 99, 235, 0.12), 0 0 20px rgba(37, 99, 235, 0.18)",
        color: "#f1f5f9",
      }}
    >
      <div className="text-[11px] font-semibold mb-2 tracking-wide uppercase" style={{ color: YEAR_CHART_REVENUE_COLOR }}>
        {label}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span
              className="w-2.5 h-2.5 rounded-[3px] shrink-0"
              style={{
                background: REVENUE_BAR_FILL,
                border: `1px solid ${REVENUE_BAR_STROKE}`,
                boxShadow: "0 0 8px rgba(37, 99, 235, 0.7)",
              }}
            />
            Revenue
          </span>
          <span className="font-semibold tabular-nums text-white">{revenue != null ? fmtDollar(revenue) : "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span
              className="w-2.5 h-2.5 rounded-[3px] shrink-0"
              style={{
                background: EBITDA_BAR_FILL,
                border: `1px solid ${EBITDA_BAR_STROKE}`,
                boxShadow: "0 0 8px rgba(34, 197, 94, 0.7)",
              }}
            />
            EBITDA
          </span>
          <span className="font-semibold tabular-nums" style={{ color: YEAR_CHART_EBITDA_COLOR }}>
            {ebitda != null ? fmtDollar(ebitda) : "—"}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-4 pt-1.5 mt-0.5 border-t"
          style={{ borderColor: "rgba(37, 99, 235, 0.22)" }}
        >
          <span className="text-slate-400">EBITDA Margin</span>
          <span className="font-semibold tabular-nums" style={{ color: YEAR_CHART_EBITDA_COLOR }}>
            {margin != null ? `${margin.toFixed(1)}%` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RevenueEbitdaBarChart({
  data,
  hasFinancialData,
}: {
  data: Array<{ month: string; revenue: number; ebitda: number }>;
  hasFinancialData: boolean;
}) {
  const { ref: plotRef, width: plotWidth } = useContainerSize();

  return (
    <div className="card chart-neon-card" data-testid="dashboard-revenue-ebitda-chart">
      <div className="section-title">Revenue vs EBITDA</div>
      <div ref={plotRef} className="h-[220px]">
        {data.length > 0 ? (
          <BarChart
            width={Math.max(plotWidth, 320)}
            height={220}
            data={data}
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
            barCategoryGap={DASHBOARD_CHART_CATEGORY_GAP}
            barGap={DASHBOARD_CHART_BAR_GAP}
          >
              <defs>
                <linearGradient id="dashRevBarFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={YEAR_CHART_REVENUE_COLOR} stopOpacity={1} />
                  <stop offset="100%" stopColor={YEAR_CHART_REVENUE_COLOR} stopOpacity={0.62} />
                </linearGradient>
                <linearGradient id="dashEbitdaBarFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={YEAR_CHART_EBITDA_COLOR} stopOpacity={1} />
                  <stop offset="100%" stopColor={YEAR_CHART_EBITDA_COLOR} stopOpacity={0.62} />
                </linearGradient>
                <filter id="dashRevBarGlow" x="-40%" y="-20%" width="180%" height="150%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor={YEAR_CHART_REVENUE_COLOR} floodOpacity="0.9" />
                  <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor={YEAR_CHART_REVENUE_COLOR} floodOpacity="0.35" />
                </filter>
                <filter id="dashEbitdaBarGlow" x="-40%" y="-20%" width="180%" height="150%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor={YEAR_CHART_EBITDA_COLOR} floodOpacity="0.9" />
                  <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor={YEAR_CHART_EBITDA_COLOR} floodOpacity="0.35" />
                </filter>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--text-muted)"
                strokeOpacity={0.12}
                strokeDasharray="3 6"
              />
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />
              <YAxis
                tickFormatter={(v) => formatCompactChartDollar(Number(v))}
                tick={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickCount={5}
              />
              <Tooltip content={<RevenueEbitdaTooltip />} cursor={false} wrapperStyle={{ outline: "none" }} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill="url(#dashRevBarFill)"
                stroke={REVENUE_BAR_STROKE}
                strokeWidth={1.5}
                maxBarSize={DASHBOARD_CHART_BAR_SIZE}
                radius={[6, 6, 0, 0]}
                style={{ filter: YEAR_CHART_REVENUE_GLOW }}
                shape={(props: { x?: number; y?: number; width?: number; height?: number; fill?: string }) => (
                  <GlowBar {...props} filter="url(#dashRevBarGlow)" stroke={REVENUE_BAR_STROKE} strokeWidth={1.5} />
                )}
                isAnimationActive={false}
              />
              <Bar
                dataKey="ebitda"
                name="EBITDA"
                fill="url(#dashEbitdaBarFill)"
                stroke={EBITDA_BAR_STROKE}
                strokeWidth={1.5}
                maxBarSize={DASHBOARD_CHART_BAR_SIZE}
                radius={[6, 6, 0, 0]}
                style={{ filter: YEAR_CHART_EBITDA_GLOW }}
                shape={(props: { x?: number; y?: number; width?: number; height?: number; fill?: string }) => (
                  <GlowBar {...props} filter="url(#dashEbitdaBarGlow)" stroke={EBITDA_BAR_STROKE} strokeWidth={1.5} />
                )}
                isAnimationActive={false}
              />
            </BarChart>
        ) : (
          <div className="flex items-center justify-center h-full text-[13px] text-center px-4" style={{ color: "var(--text-muted)" }}>
            {hasFinancialData ? INSUFFICIENT_HISTORY_MESSAGE : "Add monthly financials to see revenue and EBITDA."}
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-6 mt-3 text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-2">
          <span
            className="w-3.5 h-3.5 rounded-[4px] shrink-0"
            style={{
              background: REVENUE_BAR_FILL,
              border: `1.5px solid ${REVENUE_BAR_STROKE}`,
              boxShadow: "0 0 10px rgba(37, 99, 235, 0.75)",
            }}
          />
          Revenue
        </span>
        <span className="flex items-center gap-2">
          <span
            className="w-3.5 h-3.5 rounded-[4px] shrink-0"
            style={{
              background: EBITDA_BAR_FILL,
              border: `1.5px solid ${EBITDA_BAR_STROKE}`,
              boxShadow: "0 0 10px rgba(34, 197, 94, 0.75)",
            }}
          />
          EBITDA
        </span>
      </div>
    </div>
  );
}
