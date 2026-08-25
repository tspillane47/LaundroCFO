"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDollar } from "@/lib/calculations";
import {
  formatCompactChartDollar,
  YEAR_CHART_BAR_GAP,
  YEAR_CHART_BAR_SIZE,
  YEAR_CHART_EBITDA_COLOR,
  YEAR_CHART_HEIGHT,
  YEAR_CHART_MIN_WIDTH,
  YEAR_CHART_REVENUE_COLOR,
  yearChartHasNegative,
  yearChartValueDomain,
  type YearRevenueEbitdaPoint,
} from "@/lib/yearRevenueEbitdaChart";

type BarShapeProps = {
  payload?: YearRevenueEbitdaPoint;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
};

type BarLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  fill?: string;
  payload?: YearRevenueEbitdaPoint;
  dataKey?: "revenue" | "ebitda";
};

function num(value: number | string | undefined, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number | null; name?: string; color?: string; dataKey?: string }[];
  label?: string;
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
      className="rounded-lg p-3 text-xs shadow-sm"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="mb-1" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
      {rows.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span style={{ color: "var(--text-secondary)" }}>{entry.name}:</span>
          <span className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {fmtDollar(entry.value as number)}
          </span>
        </div>
      ))}
      {margin != null && (
        <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t" style={{ borderColor: "var(--border)" }}>
          <span style={{ color: "var(--text-muted)" }}>EBITDA Margin</span>
          <span className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {margin.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

function PresentBar(props: BarShapeProps & { dataKey?: "revenue" | "ebitda" }) {
  const key = props.dataKey;
  if (!key || props.payload?.[key] == null) return null;

  const height = props.height ?? 0;
  const y = props.y ?? 0;
  const normalized =
    height < 0
      ? { ...props, y: y + height, height: Math.abs(height) }
      : props;

  return <Rectangle {...normalized} />;
}

function BarValueLabel({ x = 0, y = 0, width = 0, height = 0, value, fill, payload, dataKey }: BarLabelProps) {
  const raw = dataKey && payload && typeof payload === "object" ? payload[dataKey] : value;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;

  const cx = num(x) + num(width) / 2;
  const isNeg = n < 0;

  return (
    <text
      x={cx}
      y={isNeg ? num(y) + num(height) + 11 : num(y) - 6}
      textAnchor="middle"
      dominantBaseline={isNeg ? "hanging" : "auto"}
      fill={fill}
      fontSize={10}
      fontWeight={600}
      className="tabular-nums"
    >
      {formatCompactChartDollar(n)}
    </text>
  );
}

function SeriesLegend() {
  return (
    <div className="flex items-center justify-center gap-6 text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
      <span className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: YEAR_CHART_REVENUE_COLOR }} />
        Revenue
      </span>
      <span className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: YEAR_CHART_EBITDA_COLOR }} />
        EBITDA
      </span>
    </div>
  );
}

export function YearRevenueEbitdaChart({
  year,
  data,
}: {
  year: number;
  data: YearRevenueEbitdaPoint[];
}) {
  const domain = yearChartValueDomain(data);
  const hasNegative = yearChartHasNegative(data);
  const plotData = data.map((point) => ({
    ...point,
    revenue: point.revenue ?? undefined,
    ebitda: point.ebitda ?? undefined,
  }));

  return (
    <div className="card min-w-0">
      <div className="section-title">Revenue vs EBITDA — {year}</div>
      <div className="overflow-x-auto">
        <div
          className="w-full"
          style={{ height: YEAR_CHART_HEIGHT, minWidth: YEAR_CHART_MIN_WIDTH }}
        >
          <ResponsiveContainer width="100%" height={YEAR_CHART_HEIGHT} debounce={1}>
            <BarChart
              data={plotData}
              barGap={YEAR_CHART_BAR_GAP}
              barCategoryGap="22%"
              margin={{ top: 28, right: 8, left: 0, bottom: hasNegative ? 20 : 4 }}
            >
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                domain={domain}
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v) => formatCompactChartDollar(Number(v))}
              />
              {hasNegative && (
                <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />
              )}
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill={YEAR_CHART_REVENUE_COLOR}
                maxBarSize={YEAR_CHART_BAR_SIZE}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
                shape={(props: BarShapeProps) => <PresentBar {...props} dataKey="revenue" />}
              >
                <LabelList
                  dataKey="revenue"
                  content={(props) => (
                    <BarValueLabel {...props} dataKey="revenue" fill={YEAR_CHART_REVENUE_COLOR} />
                  )}
                />
              </Bar>
              <Bar
                dataKey="ebitda"
                name="EBITDA"
                fill={YEAR_CHART_EBITDA_COLOR}
                maxBarSize={YEAR_CHART_BAR_SIZE}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
                shape={(props: BarShapeProps) => <PresentBar {...props} dataKey="ebitda" />}
              >
                <LabelList
                  dataKey="ebitda"
                  content={(props) => (
                    <BarValueLabel {...props} dataKey="ebitda" fill={YEAR_CHART_EBITDA_COLOR} />
                  )}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-3">
        <SeriesLegend />
      </div>
    </div>
  );
}
