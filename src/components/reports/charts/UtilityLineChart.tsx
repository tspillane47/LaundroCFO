import { Svg, Rect, Line, Text, G } from "@react-pdf/renderer";
import { PDF_CHART, clamp, formatAxisCurrency, niceMax } from "./chartUtils";

export type UtilityChartPoint = {
  month: string;
  value: number;
};

type Props = {
  data: UtilityChartPoint[];
  label: string;
  color: string;
  width?: number;
  height?: number;
};

export function UtilityLineChart({ data, label, color, width = 480, height = 110 }: Props) {
  const hasValues = data.some((d) => d.value > 0);

  if (data.length === 0 || !hasValues) {
    return (
      <Svg width={width} height={height}>
        <Text x={width / 2 - 72} y={height / 2} fill={PDF_CHART.slate400} style={{ fontSize: 9 }}>
          No monthly data available
        </Text>
      </Svg>
    );
  }

  const padding = { top: 18, right: 12, bottom: 24, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = niceMax(Math.max(...data.map((d) => d.value), 1));
  const toY = (v: number) => padding.top + chartH - (v / maxVal) * chartH;
  const barWidth = Math.max(8, (chartW / data.length) * 0.55);
  const slotWidth = chartW / data.length;

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (maxVal * i) / yTicks);

  return (
    <Svg width={width} height={height}>
      <Text x={padding.left} y={12} fill={PDF_CHART.slate600} style={{ fontSize: 9, fontWeight: "bold" }}>
        {label}
      </Text>

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

      {data.map((d, i) => {
        const x = padding.left + slotWidth * i + (slotWidth - barWidth) / 2;
        const barH = clamp((d.value / maxVal) * chartH, 0, chartH);
        const y = padding.top + chartH - barH;
        return (
          <G key={`bar-${d.month}-${i}`}>
            <Rect x={x} y={y} width={barWidth} height={barH} fill={color} rx={2} />
            <Text
              x={x + barWidth / 2 - 8}
              y={height - 6}
              fill={PDF_CHART.slate600}
              style={{ fontSize: 7 }}
            >
              {d.month}
            </Text>
          </G>
        );
      })}
    </Svg>
  );
}
