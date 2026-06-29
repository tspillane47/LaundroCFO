import { Text, View, StyleSheet } from "@react-pdf/renderer";

/** Content width on LETTER pages with 40pt padding: 612 - 80 = 532 */
export const PDF_CONTENT_WIDTH = 532;
export const PDF_METRIC_COL4_WIDTH = 125;
export const PDF_METRIC_GAP = 8;

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
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1e293b",
  },
  dialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  dialWrap: {
    alignItems: "center",
    width: PDF_METRIC_COL4_WIDTH + 8,
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

export function PdfDialRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.dialRow}>{children}</View>;
}

export function PdfDialWrap({ children }: { children: React.ReactNode }) {
  return <View style={styles.dialWrap}>{children}</View>;
}
