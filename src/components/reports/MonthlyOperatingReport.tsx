import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { fmtDollar, fmtMultiple, fmtPct } from "@/lib/calculations";
import type { MonthlyOperatingReportData } from "@/lib/getMonthlyOperatingReportData";
import { benchmarks as industryBenchmarks } from "@/lib/data";
import {
  RevenueExpenseBarChart,
  BenchmarkBar,
  DSCRGauge,
  DebtAmortizationBar,
  StatusIndicator,
  waterKpiStatusColor,
} from "@/components/reports/charts";

export type MonthlyOperatingReportProps = {
  data: MonthlyOperatingReportData;
  storeName: string;
  generatedDate: string;
};

const styles = StyleSheet.create({
  page: { backgroundColor: "#F8FAFC", padding: 40, fontFamily: "Helvetica" },
  coverPage: { backgroundColor: "#0f1e3d", padding: 50, height: "100%" },
  coverTitle: { color: "white", fontSize: 28, fontFamily: "Helvetica-Bold", fontWeight: "bold", marginBottom: 8 },
  coverSubtitle: { color: "#93c5fd", fontSize: 16, marginBottom: 40 },
  coverMeta: { color: "#94a3b8", fontSize: 12, marginTop: 8 },
  sectionHeader: {
    backgroundColor: "#0f1e3d",
    color: "white",
    padding: "8 12",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1e293b", marginBottom: 4 },
  bodyText: { fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 8 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottom: "1 solid #e2e8f0",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottom: "1 solid #f1f5f9",
  },
  tableCell: { fontSize: 9, color: "#475569" },
  tableCellBold: { fontSize: 9, color: "#1e293b", fontWeight: "bold" },
  pageNumber: { position: "absolute", bottom: 30, right: 40, fontSize: 9, color: "#94a3b8" },
  footer: { position: "absolute", bottom: 30, left: 40, fontSize: 9, color: "#94a3b8" },
  positiveText: { color: "#15803d" },
  negativeText: { color: "#b91c1c" },
});

function PageChrome({ storeName }: { storeName: string }) {
  return (
    <>
      <Text style={styles.footer} fixed>
        LaundroCFO — {storeName} — Internal Use
      </Text>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        fixed
      />
    </>
  );
}

function SectionHeader({ children }: { children: string }) {
  return <Text style={styles.sectionHeader}>{children}</Text>;
}

function fmtChange(dollar: number, pct: number | null): string {
  const sign = dollar >= 0 ? "+" : "−";
  const pctStr = pct != null ? ` (${sign}${Math.abs(pct).toFixed(1)}%)` : "";
  return `${sign}${fmtDollar(Math.abs(dollar)).replace("$", "")}${pctStr}`;
}

function ComparisonTable({
  lines,
  summary,
}: {
  lines: MonthlyOperatingReportData["revenueLines"];
  summary: MonthlyOperatingReportData["summary"];
}) {
  return (
    <>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellBold, { width: "26%" }]}>Line Item</Text>
        <Text style={[styles.tableCellBold, { width: "16%", textAlign: "right" }]}>Month</Text>
        <Text style={[styles.tableCellBold, { width: "16%", textAlign: "right" }]}>Prior Mo</Text>
        <Text style={[styles.tableCellBold, { width: "18%", textAlign: "right" }]}>Change</Text>
        <Text style={[styles.tableCellBold, { width: "16%", textAlign: "right" }]}>YTD</Text>
      </View>
      {lines.map((line) => (
        <View key={line.label} style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: "26%" }]}>{line.label}</Text>
          <Text style={[styles.tableCell, { width: "16%", textAlign: "right" }]}>{fmtDollar(line.current)}</Text>
          <Text style={[styles.tableCell, { width: "16%", textAlign: "right" }]}>{fmtDollar(line.prior)}</Text>
          <Text
            style={[
              styles.tableCellBold,
              { width: "18%", textAlign: "right" },
              line.changeDollar >= 0 ? styles.positiveText : styles.negativeText,
            ]}
          >
            {fmtChange(line.changeDollar, line.changePct)}
          </Text>
          <Text style={[styles.tableCell, { width: "16%", textAlign: "right" }]}>{fmtDollar(line.ytd)}</Text>
        </View>
      ))}
      <View style={[styles.tableRow, { backgroundColor: "#f8fafc" }]}>
        <Text style={[styles.tableCellBold, { width: "26%" }]}>{summary.revenue.label}</Text>
        <Text style={[styles.tableCellBold, { width: "16%", textAlign: "right" }]}>{fmtDollar(summary.revenue.current)}</Text>
        <Text style={[styles.tableCellBold, { width: "16%", textAlign: "right" }]}>{fmtDollar(summary.revenue.prior)}</Text>
        <Text style={[styles.tableCellBold, { width: "18%", textAlign: "right" }]}>
          {fmtChange(summary.revenue.changeDollar, summary.revenue.changePct)}
        </Text>
        <Text style={[styles.tableCellBold, { width: "16%", textAlign: "right" }]}>{fmtDollar(summary.revenue.ytd)}</Text>
      </View>
    </>
  );
}

const KEY_METRIC_BENCHMARKS: Record<
  string,
  { median: number; top25: number; bottom25: number; lowerIsBetter: boolean; unit: string }
> = Object.fromEntries(
  industryBenchmarks.map((b) => [
    b.metric,
    { median: b.median, top25: b.top25, bottom25: b.bottom25, lowerIsBetter: b.lowerIsBetter, unit: b.unit },
  ])
);

export function MonthlyOperatingReport({ data, storeName, generatedDate }: MonthlyOperatingReportProps) {
  const { financial, summary, keyMetrics } = data;

  const metricDefs = [
    { label: "EBITDA Margin", value: summary.ebitdaMargin, benchmarkKey: "EBITDA Margin" },
    { label: "DSCR", value: keyMetrics.dscr, benchmarkKey: "DSCR" },
    { label: "Rent to Revenue", value: keyMetrics.rentToRevenue, benchmarkKey: "Rent to Revenue" },
    { label: "Utility Ratio", value: keyMetrics.utilityRatio, benchmarkKey: "Utility Ratio" },
    { label: "Revenue per Machine", value: keyMetrics.revenuePerMachine, benchmarkKey: "Revenue per Machine" },
  ];

  return (
    <Document title={`Monthly Operating Report — ${storeName}`} author="LaundroCFO">
      <Page size="LETTER" style={styles.coverPage}>
        <Text style={{ color: "#93c5fd", fontSize: 14, fontWeight: "bold", marginBottom: 48 }}>LAUNDROCFO</Text>
        <Text style={styles.coverTitle}>Monthly Operating Report</Text>
        <Text style={styles.coverSubtitle}>{storeName}</Text>
        <Text style={styles.coverMeta}>Report Period: {data.reportMonthLabel}</Text>
        <Text style={styles.coverMeta}>Generated: {generatedDate}</Text>
        <Text style={[styles.coverMeta, { marginTop: 24 }]}>Internal use — owner monthly review</Text>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Revenue & Expense Summary</Text>
        <Text style={styles.bodyText}>Monthly P&L for {data.reportMonthLabel} with prior-month comparison and YTD totals.</Text>
        {financial.limitedData && (
          <Text style={[styles.bodyText, { color: "#b45309" }]}>Limited trailing data on file — verify figures against source records.</Text>
        )}
        <SectionHeader>Revenue</SectionHeader>
        <ComparisonTable lines={data.revenueLines} summary={data.summary} />
        <SectionHeader>Expenses</SectionHeader>
        <ComparisonTable lines={data.expenseLines} summary={data.summary} />
        <SectionHeader>Summary</SectionHeader>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCellBold, { width: "40%" }]}>EBITDA</Text>
          <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right", color: "#15803d" }]}>
            {fmtDollar(summary.ebitda.current)}
          </Text>
          <Text style={[styles.tableCell, { width: "30%", textAlign: "right" }]}>
            Margin {fmtPct(summary.ebitdaMargin)} (prior {fmtPct(summary.priorEbitdaMargin)})
          </Text>
        </View>
        <PageChrome storeName={storeName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>TTM Trend</Text>
        <Text style={styles.bodyText}>Trailing twelve months ending {data.reportMonthLabel}.</Text>
        <RevenueExpenseBarChart data={financial.ttmChartData} width={500} height={200} />
        <PageChrome storeName={storeName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Utility Breakdown</Text>
        <Text style={styles.bodyText}>Utility costs for {data.reportMonthLabel} as % of revenue.</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCellBold, { width: "40%" }]}>Utility</Text>
          <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right" }]}>Amount</Text>
          <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right" }]}>% Revenue</Text>
        </View>
        {data.utilityLines.map((u) => (
          <View key={u.label} style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: "40%" }]}>{u.label}</Text>
            <Text style={[styles.tableCell, { width: "30%", textAlign: "right" }]}>{fmtDollar(u.amount)}</Text>
            <Text style={[styles.tableCell, { width: "30%", textAlign: "right" }]}>{fmtPct(u.pctOfRevenue)}</Text>
          </View>
        ))}
        <SectionHeader>Water KPI</SectionHeader>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <StatusIndicator status={waterKpiStatusColor(financial.waterKPI.status)} />
          <Text style={styles.bodyText}>
            Water / Self-Service: {fmtPct(financial.waterKPI.ratio * 100)} — {financial.waterKPI.status}
          </Text>
        </View>
        <PageChrome storeName={storeName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Key Metrics</Text>
        {metricDefs.map((def) => {
          const bench = KEY_METRIC_BENCHMARKS[def.benchmarkKey];
          if (def.value == null || !bench) {
            return (
              <Text key={def.label} style={styles.bodyText}>
                {def.label}: Insufficient data
              </Text>
            );
          }
          return (
            <View key={def.label} style={{ marginBottom: 8 }}>
              <BenchmarkBar
                metric={def.label}
                store={def.value}
                unit={bench.unit}
                median={bench.median}
                top25={bench.top25}
                bottom25={bench.bottom25}
                lowerIsBetter={bench.lowerIsBetter}
                width={500}
              />
            </View>
          );
        })}
        <PageChrome storeName={storeName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Debt & Cash Flow</Text>
        <SectionHeader>Loan Detail</SectionHeader>
        {financial.loans.length === 0 ? (
          <Text style={styles.bodyText}>No active loans on file.</Text>
        ) : (
          financial.loans.map((loan) => (
            <View key={loan.id} style={{ marginBottom: 10 }}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCellBold, { width: "25%" }]}>{loan.lenderName}</Text>
                <Text style={[styles.tableCell, { width: "25%", textAlign: "right" }]}>{fmtDollar(loan.monthlyPayment)}/mo</Text>
                <Text style={[styles.tableCell, { width: "25%", textAlign: "right" }]}>{loan.interestRate.toFixed(2)}%</Text>
                <Text style={[styles.tableCell, { width: "25%", textAlign: "right" }]}>{loan.remainingMonths} mo left</Text>
              </View>
              <DebtAmortizationBar
                lenderName=""
                originalBalance={loan.originalBalance}
                remainingBalance={loan.estimatedBalance}
                width={500}
                height={28}
              />
            </View>
          ))
        )}
        <SectionHeader>Cash Flow</SectionHeader>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: "50%" }]}>Monthly EBITDA</Text>
          <Text style={[styles.tableCellBold, { width: "50%", textAlign: "right" }]}>{fmtDollar(financial.monthlyEbitda)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: "50%" }]}>Monthly Debt Service</Text>
          <Text style={[styles.tableCellBold, { width: "50%", textAlign: "right" }]}>{fmtDollar(financial.totalMonthlyDebtService)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCellBold, { width: "50%" }]}>Surplus Cash Flow</Text>
          <Text style={[styles.tableCellBold, { width: "50%", textAlign: "right", color: financial.surplusCashFlow >= 0 ? "#15803d" : "#b91c1c" }]}>
            {fmtDollar(financial.surplusCashFlow)}
          </Text>
        </View>
        {keyMetrics.dscr != null && keyMetrics.dscr > 0 && (
          <>
            <SectionHeader>DSCR Gauge</SectionHeader>
            <DSCRGauge dscr={keyMetrics.dscr} width={180} height={110} />
            <Text style={[styles.bodyText, { marginTop: 4 }]}>DSCR: {fmtMultiple(keyMetrics.dscr)}</Text>
          </>
        )}
        <PageChrome storeName={storeName} />
      </Page>
    </Document>
  );
}

export default MonthlyOperatingReport;
