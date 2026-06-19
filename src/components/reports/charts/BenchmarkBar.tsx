import { Svg, Rect, Line, Text, G } from "@react-pdf/renderer";
import {
  PDF_CHART,
  benchmarkPositionPct,
  benchmarkStatusColor,
  formatPct,
} from "./chartUtils";

type Props = {
  metric: string;
  store: number;
  unit: string;
  median: number;
  top25: number;
  bottom25: number;
  lowerIsBetter: boolean;
  width?: number;
  height?: number;
};

function fmtVal(value: number, unit: string): string {
  if (unit === "$") return `$${Math.round(value).toLocaleString("en-US")}`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (unit === "%") return formatPct(value);
  return `${value.toFixed(1)}${unit}`;
}

export function BenchmarkBar({
  metric,
  store,
  unit,
  median,
  top25,
  bottom25,
  lowerIsBetter,
  width = 480,
  height = 44,
}: Props) {
  const barY = 16;
  const barH = 8;
  const min = lowerIsBetter ? top25 : bottom25;
  const max = lowerIsBetter ? bottom25 : top25;
  const storePct = benchmarkPositionPct(store, min, max);
  const medianPct = benchmarkPositionPct(median, min, max);
  const statusColor = benchmarkStatusColor(store, top25, bottom25, lowerIsBetter);

  return (
    <Svg width={width} height={height}>
      <Text x={0} y={10} fill={PDF_CHART.slate600} style={{ fontSize: 8 }}>
        {metric}
      </Text>
      <Text x={width - 72} y={10} fill={statusColor} style={{ fontSize: 8, fontWeight: "bold" }}>
        {fmtVal(store, unit)}
      </Text>

      <Rect x={0} y={barY} width={width * 0.33} height={barH} fill="#fecaca" />
      <Rect x={width * 0.33} y={barY} width={width * 0.34} height={barH} fill="#fde68a" />
      <Rect x={width * 0.67} y={barY} width={width * 0.33} height={barH} fill="#bbf7d0" />

      <Line
        x1={(medianPct / 100) * width}
        y1={barY - 2}
        x2={(medianPct / 100) * width}
        y2={barY + barH + 2}
        stroke={PDF_CHART.navy}
        strokeWidth={1}
      />

      <Rect
        x={(storePct / 100) * width - 1}
        y={barY - 3}
        width={2}
        height={barH + 6}
        fill={PDF_CHART.white}
        stroke={PDF_CHART.navy}
        strokeWidth={0.5}
      />

      <Text x={0} y={height - 2} fill={PDF_CHART.slate400} style={{ fontSize: 6 }}>
        {lowerIsBetter ? "Best" : "Worst"} — {fmtVal(lowerIsBetter ? top25 : bottom25, unit)}
      </Text>
      <Text x={width / 2 - 20} y={height - 2} fill={PDF_CHART.slate400} style={{ fontSize: 6 }}>
        Median — {fmtVal(median, unit)}
      </Text>
      <Text x={width - 90} y={height - 2} fill={PDF_CHART.slate400} style={{ fontSize: 6 }}>
        {lowerIsBetter ? "Worst" : "Best"} — {fmtVal(lowerIsBetter ? bottom25 : top25, unit)}
      </Text>
    </Svg>
  );
}

export function StatusIndicator({ status }: { status: "green" | "amber" | "red" }) {
  const color =
    status === "green" ? PDF_CHART.greenDark : status === "amber" ? PDF_CHART.amber : PDF_CHART.red;
  return (
    <Svg width={10} height={10}>
      <Rect x={0} y={0} width={10} height={10} fill={color} rx={1} />
    </Svg>
  );
}

export function waterKpiStatusColor(status: "Healthy" | "Watch" | "High"): "green" | "amber" | "red" {
  if (status === "Healthy") return "green";
  if (status === "Watch") return "amber";
  return "red";
}
