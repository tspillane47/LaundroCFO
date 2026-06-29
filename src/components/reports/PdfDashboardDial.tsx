import { Svg, Path, Text, G, Circle, Line } from "@react-pdf/renderer";
import { PDF_CHART } from "@/components/reports/charts/chartUtils";

export type PdfDialZone = { start: number; end: number; color: string };

type PdfDashboardDialProps = {
  label: string;
  value: number | null;
  displayValue: string;
  min: number;
  max: number;
  zones: PdfDialZone[];
  width?: number;
  height?: number;
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function valueToAngle(value: number, min: number, max: number): number {
  const pct = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  return pct * 180;
}

function zoneColor(value: number, zones: PdfDialZone[]): string {
  for (const z of zones) {
    if (value >= z.start && value <= z.end) return z.color;
  }
  return zones[zones.length - 1]?.color ?? PDF_CHART.green;
}

export const PDF_DIAL_ZONES = {
  dscr: [
    { start: 0, end: 1.25, color: PDF_CHART.red },
    { start: 1.25, end: 1.5, color: PDF_CHART.amber },
    { start: 1.5, end: 3, color: PDF_CHART.green },
  ],
  ebitdaMargin: [
    { start: 0, end: 15, color: PDF_CHART.red },
    { start: 15, end: 22, color: PDF_CHART.amber },
    { start: 22, end: 40, color: PDF_CHART.green },
  ],
  equipmentScore: [
    { start: 0, end: 50, color: PDF_CHART.red },
    { start: 50, end: 70, color: PDF_CHART.amber },
    { start: 70, end: 100, color: PDF_CHART.green },
  ],
};

export function PdfDashboardDial({
  label,
  value,
  displayValue,
  min,
  max,
  zones,
  width = 155,
  height = 96,
}: PdfDashboardDialProps) {
  const cx = width / 2;
  const cy = height - 6;
  const r = Math.min(width, height) * 0.72;
  const strokeWidth = 9;
  const hasData = value != null;

  const zoneArcs = zones.map((z) => {
    const startAngle = valueToAngle(z.start, min, max);
    const endAngle = valueToAngle(z.end, min, max);
    if (endAngle <= startAngle) return null;
    return (
      <Path
        key={`${z.start}-${z.end}`}
        d={describeArc(cx, cy, r, startAngle, endAngle)}
        stroke={hasData ? z.color : PDF_CHART.slate200}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="butt"
      />
    );
  });

  const needleAngle = hasData ? 180 - valueToAngle(value, min, max) : 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleLen = r * 0.78;
  const needleX = cx + needleLen * Math.cos(needleRad);
  const needleY = cy + needleLen * Math.sin(needleRad);
  const valueColor = hasData ? zoneColor(value, zones) : PDF_CHART.slate400;

  return (
    <Svg width={width} height={height}>
      <Path
        d={describeArc(cx, cy, r, 0, 180)}
        stroke={PDF_CHART.slate200}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
      />
      {zoneArcs}
      {hasData && (
        <G>
          <Line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={PDF_CHART.navy} strokeWidth={2} />
          <Circle cx={cx} cy={cy} r={4} fill={PDF_CHART.navy} />
        </G>
      )}
      <Text
        x={cx}
        y={cy - 14}
        fill={valueColor}
        style={{ fontSize: 13, fontWeight: "bold", textAnchor: "middle" }}
      >
        {displayValue}
      </Text>
      <Text
        x={cx}
        y={height - 2}
        fill={PDF_CHART.slate600}
        style={{ fontSize: 7, textAnchor: "middle", textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {label}
      </Text>
    </Svg>
  );
}
