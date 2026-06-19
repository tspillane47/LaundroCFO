import { Svg, Rect, Text, G } from "@react-pdf/renderer";
import { PDF_CHART, CATEGORY_COLORS } from "./chartUtils";

export type CategorySegment = {
  label: string;
  value: number;
  pct: number;
};

type Props = {
  segments: CategorySegment[];
  width?: number;
  height?: number;
  title?: string;
};

export function CategoryBreakdownBar({ segments, width = 480, height = 88, title }: Props) {
  const active = segments.filter((s) => s.value > 0);
  const total = active.reduce((s, seg) => s + seg.value, 0);

  if (total <= 0) {
    return (
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Text x={0} y={14} fill={PDF_CHART.slate400} style={{ fontSize: 8 }}>
          {title ? `${title}: ` : ""}No category data
        </Text>
      </Svg>
    );
  }

  const titleHeight = title ? 14 : 0;
  const barY = titleHeight + 6;
  const barH = 16;
  const legendStartY = barY + barH + 10;
  let x = 0;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {title ? (
        <Text x={0} y={10} fill={PDF_CHART.navy} style={{ fontSize: 8, fontWeight: "bold" }}>
          {title}
        </Text>
      ) : null}

      {active.map((seg, i) => {
        const segW = Math.max(2, (seg.value / total) * width);
        const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
        const el = (
          <G key={`${seg.label}-${i}`}>
            <Rect x={x} y={barY} width={segW} height={barH} fill={color} rx={1} />
          </G>
        );
        x += segW;
        return el;
      })}

      {active.slice(0, 6).map((seg, i) => {
        const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
        const row = Math.floor(i / 3);
        const col = i % 3;
        const lx = col * 160;
        const ly = legendStartY + row * 12;
        return (
          <G key={`legend-${seg.label}`}>
            <Rect x={lx} y={ly - 7} width={8} height={8} fill={color} />
            <Text x={lx + 12} y={ly} fill={PDF_CHART.slate600} style={{ fontSize: 7 }}>
              {seg.label} {seg.pct.toFixed(0)}%
            </Text>
          </G>
        );
      })}
    </Svg>
  );
}
