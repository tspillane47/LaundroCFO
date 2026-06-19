import { Svg, Rect, Text, G } from "@react-pdf/renderer";
import { PDF_CHART } from "./chartUtils";

type Props = {
  lenderName: string;
  originalBalance: number;
  remainingBalance: number;
  width?: number;
  height?: number;
};

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function DebtAmortizationBar({
  lenderName,
  originalBalance,
  remainingBalance,
  width = 480,
  height = 36,
}: Props) {
  const original = Math.max(originalBalance, remainingBalance, 1);
  const paidPct = Math.max(0, Math.min(100, ((original - remainingBalance) / original) * 100));
  const remainingPct = 100 - paidPct;
  const remainingW = (remainingPct / 100) * width;

  return (
    <Svg width={width} height={height}>
      <Text x={0} y={9} fill={PDF_CHART.slate600} style={{ fontSize: 8 }}>
        {lenderName}
      </Text>
      <Text x={width - 120} y={9} fill={PDF_CHART.slate400} style={{ fontSize: 7 }}>
        {fmt(remainingBalance)} of {fmt(original)}
      </Text>

      <Rect x={0} y={14} width={width} height={10} fill={PDF_CHART.slate200} rx={2} />
      <Rect x={0} y={14} width={remainingW} height={10} fill={PDF_CHART.blueDark} rx={2} />

      <Text x={0} y={32} fill={PDF_CHART.slate400} style={{ fontSize: 6 }}>
        {remainingPct.toFixed(0)}% remaining
      </Text>
    </Svg>
  );
}
