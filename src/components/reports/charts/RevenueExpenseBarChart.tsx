import { Svg, Rect, Line, Path, Text, G } from "@react-pdf/renderer";
import { PDF_CHART, clamp, formatAxisCurrency, niceMax } from "./chartUtils";

export type RevenueExpenseChartPoint = {
  label: string;
  revenue: number;
  ebitda: number;
};

type Props = {
  data: RevenueExpenseChartPoint[];
  width?: number;
  height?: number;
};

export function RevenueExpenseBarChart({ data, width = 480, height = 180 }: Props) {
  if (data.length === 0) {
    return (
      <Svg width={width} height={height}>
        <Text x={width / 2 - 60} y={height / 2} fill={PDF_CHART.slate400} style={{ fontSize: 9 }}>
          No chart data available
        </Text>
      </Svg>
    );
  }

  const padding = { top: 12, right: 12, bottom: 28, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = niceMax(Math.max(...data.flatMap((d) => [d.revenue, d.ebitda]), 1));
  const minVal = Math.min(0, ...data.map((d) => d.ebitda));
  const range = maxVal - minVal || 1;

  const toY = (v: number) => padding.top + chartH - ((v - minVal) / range) * chartH;
  const barWidth = Math.max(8, (chartW / data.length) * 0.55);
  const slotWidth = chartW / data.length;

  const ebitdaPoints = data
    .map((d, i) => {
      const x = padding.left + slotWidth * i + slotWidth / 2;
      const y = toY(d.ebitda);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => minVal + (range * i) / yTicks);

  return (
    <Svg width={width} height={height}>
      {ticks.map((tick, i) => {
        const y = toY(tick);
        return (
          <G key={`yt-${i}`}>
            <Line
              x1={padding.left}
              y1={y}
              x2={padding.left + chartW}
              y2={y}
              stroke={PDF_CHART.slate200}
              strokeWidth={0.5}
            />
            <Text x={4} y={y + 3} fill={PDF_CHART.slate400} style={{ fontSize: 7 }}>
              {formatAxisCurrency(tick)}
            </Text>
          </G>
        );
      })}

      {minVal < 0 && (
        <Line
          x1={padding.left}
          y1={toY(0)}
          x2={padding.left + chartW}
          y2={toY(0)}
          stroke={PDF_CHART.slate400}
          strokeWidth={0.75}
        />
      )}

      {data.map((d, i) => {
        const x = padding.left + slotWidth * i + (slotWidth - barWidth) / 2;
        const barH = clamp(((d.revenue - minVal) / range) * chartH, 0, chartH);
        const y = padding.top + chartH - barH;
        return (
          <G key={`bar-${d.label}-${i}`}>
            <Rect x={x} y={y} width={barWidth} height={barH} fill={PDF_CHART.blue} rx={2} />
            <Text
              x={x + barWidth / 2 - 8}
              y={height - 8}
              fill={PDF_CHART.slate600}
              style={{ fontSize: 7 }}
            >
              {d.label}
            </Text>
          </G>
        );
      })}

      <Path d={ebitdaPoints} stroke={PDF_CHART.green} strokeWidth={2} fill="none" />

      {data.map((d, i) => {
        const x = padding.left + slotWidth * i + slotWidth / 2;
        const y = toY(d.ebitda);
        return <Rect key={`dot-${i}`} x={x - 2.5} y={y - 2.5} width={5} height={5} fill={PDF_CHART.green} rx={2.5} />;
      })}
    </Svg>
  );
}
