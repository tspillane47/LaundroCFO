import { MONTH_SHORT } from "@/lib/financials";

/** Brand pairing used by Dashboard bars and Financials area/line charts. */
export const YEAR_CHART_REVENUE_COLOR = "#2563eb";
export const YEAR_CHART_EBITDA_COLOR = "#22c55e";

export const YEAR_CHART_REVENUE_GLOW =
  "drop-shadow(0 0 4px rgba(37, 99, 235, 0.9)) drop-shadow(0 0 10px rgba(37, 99, 235, 0.45))";
export const YEAR_CHART_EBITDA_GLOW =
  "drop-shadow(0 0 4px rgba(34, 197, 94, 0.9)) drop-shadow(0 0 10px rgba(34, 197, 94, 0.45))";

export const YEAR_CHART_HEIGHT = 280;
export const YEAR_CHART_MIN_WIDTH = 680;

/** Dashboard compact grouped-bar sizing — bold enough to read at a glance. */
export const DASHBOARD_CHART_BAR_SIZE = 28;
export const DASHBOARD_CHART_BAR_GAP = 4;
export const DASHBOARD_CHART_CATEGORY_GAP = "8%";

export type YearRevenueEbitdaPoint = {
  label: string;
  revenue: number | null;
  ebitda: number | null;
};

export function buildYearRevenueEbitdaChartData(
  yearRecords: Array<{ revenue: number; ebitda: number } | null>
): YearRevenueEbitdaPoint[] {
  return Array.from({ length: 12 }, (_, i) => {
    const record = yearRecords[i] ?? null;
    return {
      label: MONTH_SHORT[i],
      revenue: record ? record.revenue : null,
      ebitda: record ? record.ebitda : null,
    };
  });
}

export function formatCompactChartDollar(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const text = millions >= 10 ? millions.toFixed(0) : millions.toFixed(1).replace(/\.0$/, "");
    return `${sign}$${text}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs / 1_000)}k`;
  }
  return `${sign}$${Math.round(abs)}`;
}

export function yearChartValueDomain(data: YearRevenueEbitdaPoint[]): [number, number] {
  const values = data.flatMap((point) => [point.revenue, point.ebitda]).filter((v): v is number => v != null);
  if (values.length === 0) return [0, 1];

  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(max - min, 1);
  const pad = span * 0.18;
  return [min === 0 ? 0 : min - pad, max + pad];
}

export function yearChartHasNegative(data: YearRevenueEbitdaPoint[]): boolean {
  return data.some((point) => (point.revenue != null && point.revenue < 0) || (point.ebitda != null && point.ebitda < 0));
}

/** Keep real zeros; omit months with no record so Recharts will not draw through them. */
export function toYearChartPlotData(data: YearRevenueEbitdaPoint[]) {
  return data.map((point) => ({
    label: point.label,
    revenue: point.revenue ?? undefined,
    ebitda: point.ebitda ?? undefined,
  }));
}

export function yearChartDefinedPointCount(data: YearRevenueEbitdaPoint[]): number {
  return data.filter((point) => point.revenue != null || point.ebitda != null).length;
}
