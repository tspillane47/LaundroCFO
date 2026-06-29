import { Text, View, StyleSheet } from "@react-pdf/renderer";
import { SCORECARD_COLORS, type ScorecardVerdict } from "@/lib/scorecard";

/** Content width on LETTER pages with 40pt padding: 612 - 80 = 532 */
export const PDF_CONTENT_WIDTH = 532;
export const PDF_METRIC_COL4_WIDTH = 125;
export const PDF_METRIC_GAP = 8;
export const PDF_SCORECARD_WIDTH = 168;

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -(PDF_METRIC_GAP / 2),
  },
  card: {
    width: PDF_METRIC_COL4_WIDTH,
    marginHorizontal: PDF_METRIC_GAP / 2,
    marginBottom: PDF_METRIC_GAP,
    backgroundColor: "#ffffff",
    border: "1 solid #e2e8f0",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 7,
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0f172a",
  },
  scorecardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  scorecard: {
    width: PDF_SCORECARD_WIDTH,
    backgroundColor: "#ffffff",
    border: "1 solid #e2e8f0",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  scorecardLabel: {
    fontSize: 7,
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scorecardValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 6,
  },
  scorecardVerdictRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scorecardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  scorecardVerdict: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#0f172a",
  },
});

export function PdfMetricGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function PdfMetricTile({
  label,
  value,
  valueColor,
  width = PDF_METRIC_COL4_WIDTH,
}: {
  label: string;
  value: string;
  valueColor?: string;
  width?: number;
}) {
  return (
    <View style={[styles.card, { width }]}>
      <Text style={styles.label} wrap={false}>
        {label}
      </Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : {}]} wrap={false}>
        {value}
      </Text>
    </View>
  );
}

export function PdfScorecardRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.scorecardRow}>{children}</View>;
}

export function PdfScorecard({
  label,
  value,
  verdict,
}: {
  label: string;
  value: string;
  verdict: ScorecardVerdict;
}) {
  const accent = SCORECARD_COLORS[verdict];

  return (
    <View style={[styles.scorecard, { borderLeftWidth: 4, borderLeftColor: accent }]}>
      <Text style={styles.scorecardLabel} wrap={false}>
        {label}
      </Text>
      <Text style={styles.scorecardValue} wrap={false}>
        {value}
      </Text>
      <View style={styles.scorecardVerdictRow}>
        <View style={[styles.scorecardDot, { backgroundColor: accent }]} />
        <Text style={styles.scorecardVerdict} wrap={false}>
          {verdict}
        </Text>
      </View>
    </View>
  );
}
