import { Svg, Path, Text, G } from "@react-pdf/renderer";
import { PDF_CHART } from "./chartUtils";

type Props = {
  dscr: number;
  width?: number;
  height?: number;
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function dscrColor(dscr: number): string {
  if (dscr >= 1.5) return PDF_CHART.green;
  if (dscr >= 1.25) return PDF_CHART.amber;
  return PDF_CHART.red;
}

function dscrNeedleAngle(dscr: number): number {
  const clamped = Math.min(2.5, Math.max(0, dscr));
  return 180 + (clamped / 2.5) * 180;
}

export function DSCRGauge({ dscr, width = 160, height = 100 }: Props) {
  const cx = width / 2;
  const cy = height - 8;
  const r = Math.min(width, height) * 0.42;

  const redArc = describeArc(cx, cy, r, 180, 234);
  const amberArc = describeArc(cx, cy, r, 234, 270);
  const greenArc = describeArc(cx, cy, r, 270, 360);

  const needleAngle = dscrNeedleAngle(dscr);
  const needleEnd = polarToCartesian(cx, cy, r - 6, needleAngle);

  return (
    <Svg width={width} height={height}>
      <Path d={redArc} stroke={PDF_CHART.red} strokeWidth={8} fill="none" strokeLinecap="butt" />
      <Path d={amberArc} stroke={PDF_CHART.amber} strokeWidth={8} fill="none" strokeLinecap="butt" />
      <Path d={greenArc} stroke={PDF_CHART.green} strokeWidth={8} fill="none" strokeLinecap="butt" />

      <Path
        d={`M ${cx} ${cy} L ${needleEnd.x} ${needleEnd.y}`}
        stroke={PDF_CHART.navy}
        strokeWidth={2}
      />
      <Path d={`M ${cx - 4} ${cy} A 4 4 0 1 0 ${cx + 4} ${cy} A 4 4 0 1 0 ${cx - 4} ${cy}`} fill={PDF_CHART.navy} />

      <Text
        x={cx - 18}
        y={cy - 10}
        fill={dscrColor(dscr)}
        style={{ fontSize: 14, fontWeight: "bold" }}
      >
        {dscr.toFixed(2)}x
      </Text>
      <Text x={cx - 14} y={cy + 4} fill={PDF_CHART.slate600} style={{ fontSize: 7 }}>
        DSCR
      </Text>
    </Svg>
  );
}
