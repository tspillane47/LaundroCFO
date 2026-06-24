import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import type { PortfolioReportData } from "@/lib/getPortfolioReport";

export interface PortfolioReportProps {
  data: PortfolioReportData;
  generatedDate: string;
  userEmail?: string | null;
}

const fmtCurrency = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtMultiple = (n: number) => n.toFixed(2) + "x";
const fmtPercent = (n: number) => n.toFixed(1) + "%";

const styles = StyleSheet.create({
  page: { backgroundColor: "#F8FAFC", padding: 40, fontFamily: "Helvetica" },
  coverPage: {
    backgroundColor: "#0a1628",
    padding: 50,
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  coverLogo: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#60a5fa",
    letterSpacing: 2,
    marginBottom: 60,
  },
  coverTitleRow: { marginBottom: 8 },
  coverTitle: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  coverDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginVertical: 30,
    width: "100%",
  },
  coverInfoGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  coverInfoCol: { width: "31%" },
  coverInfoLabel: {
    fontSize: 10,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  coverInfoValue: { fontSize: 13, color: "#ffffff", fontWeight: "bold" },
  coverHeroSection: { marginTop: "auto", paddingTop: 40 },
  coverHeroLabel: {
    fontSize: 11,
    color: "#93c5fd",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  coverHeroValue: {
    fontSize: 44,
    fontWeight: "bold",
    color: "#4ade80",
    letterSpacing: -1,
  },
  coverFooter: { fontSize: 9, color: "#64748b", marginTop: 30 },
  sectionHeader: {
    backgroundColor: "#1E3A1E",
    color: "white",
    padding: "8 12",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 20,
  },
  sectionTitle: { fontSize: 20, fontWeight: "bold", color: "#1e293b", marginBottom: 4 },
  bodyText: { fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottom: "1 solid #e2e8f0",
  },
  rowLabel: { fontSize: 10, color: "#64748b", flex: 1 },
  rowValue: { fontSize: 10, color: "#1e293b", fontWeight: "bold", textAlign: "right" },
  metricCard: {
    width: "23%",
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    padding: "10 12",
    marginBottom: 10,
    marginRight: "2%",
  },
  metricCardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  metricValue: { fontSize: 18, fontWeight: "bold", color: "#1e293b" },
  metricLabel: {
    fontSize: 8,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  positiveText: { color: "#15803d" },
  negativeText: { color: "#b91c1c" },
  pageNumber: { position: "absolute", bottom: 30, right: 40, fontSize: 9, color: "#94a3b8" },
  footer: { position: "absolute", bottom: 30, left: 40, fontSize: 9, color: "#94a3b8" },
  divider: { borderBottom: "1 solid #e2e8f0", marginVertical: 12 },
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
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#64748b",
    textTransform: "uppercase",
  },
  tableCell: { fontSize: 9, color: "#1e293b" },
  tableCellBold: { fontSize: 9, color: "#1e293b", fontWeight: "bold" },
  tableCellRight: { fontSize: 9, color: "#1e293b", textAlign: "right" },
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(String(value).split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatAdj(value: number): string {
  return (value >= 0 ? "+" : "") + value.toFixed(2) + "x";
}

function parseMachineCapacity(size: string): number {
  const match = size.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getLargestMachine(equipment: EquipmentRecord[]): string {
  if (!equipment.length) return "—";
  let max = 0;
  let label = "—";
  for (const e of equipment) {
    const cap = parseMachineCapacity(e.machine_size);
    if (cap > max) {
      max = cap;
      label = e.machine_size;
    }
  }
  return label;
}

function PageChrome() {
  return (
    <>
      <Text style={styles.footer} fixed>
        LaundroCFO — Portfolio Report — Confidential
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

function DataRow({
  label,
  value,
  valueColor,
  positive,
  negative,
}: {
  label: string;
  value: string;
  valueColor?: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const colorStyle = valueColor
    ? { color: valueColor }
    : positive
      ? styles.positiveText
      : negative
        ? styles.negativeText
        : undefined;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={colorStyle ? [styles.rowValue, colorStyle] : styles.rowValue}>{value}</Text>
    </View>
  );
}

function MetricTile({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

function CoverInfoCol({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.coverInfoCol}>
      <Text style={styles.coverInfoLabel}>{label}</Text>
      <Text style={styles.coverInfoValue}>{value}</Text>
    </View>
  );
}

export function PortfolioReportDocument({ data, generatedDate, userEmail }: PortfolioReportProps) {
  const { totals, cashFlow, storeDetails } = data;

  return (
    <Document
      title="LaundroCFO Portfolio Underwriting Report"
      author="LaundroCFO"
      subject="Portfolio Lender Underwriting Report"
    >
      {/* Page 1 — Cover */}
      <Page size="LETTER" style={styles.coverPage}>
        <Text style={styles.coverLogo}>LAUNDROCFO</Text>

        <View style={styles.coverTitleRow}>
          <Text style={styles.coverTitle}>Portfolio Underwriting Report</Text>
        </View>

        <View style={styles.coverDivider} />

        <View style={styles.coverInfoGrid}>
          <CoverInfoCol label="Prepared For" value={userEmail ?? "—"} />
          <CoverInfoCol label="Generated" value={generatedDate} />
          <CoverInfoCol
            label="Stores"
            value={String(totals.storeCount)}
          />
        </View>

        <View style={styles.coverInfoGrid}>
          <CoverInfoCol label="Portfolio Value" value={fmtCurrency(totals.portfolioValue)} />
          <CoverInfoCol label="Portfolio Debt" value={fmtCurrency(totals.portfolioDebt)} />
          <CoverInfoCol label="Portfolio Equity" value={fmtCurrency(totals.portfolioEquity)} />
        </View>

        <View style={styles.coverHeroSection}>
          <Text style={styles.coverHeroLabel}>Portfolio Net Worth</Text>
          <Text style={styles.coverHeroValue}>{fmtCurrency(totals.portfolioNetWorth)}</Text>
        </View>

        <Text style={styles.coverFooter}>
          CONFIDENTIAL — Prepared for lender review. Not for public distribution.
        </Text>
      </Page>

      {/* Page 2 — Portfolio Summary */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Portfolio Summary</Text>
        <Text style={styles.bodyText}>
          Aggregated metrics across {totals.storeCount} store{totals.storeCount !== 1 ? "s" : ""}.
        </Text>
        <View style={styles.metricCardGrid}>
          <MetricTile label="Portfolio Value" value={fmtCurrency(totals.portfolioValue)} valueColor="#15803d" />
          <MetricTile label="Portfolio Debt" value={fmtCurrency(totals.portfolioDebt)} />
          <MetricTile label="Portfolio Equity" value={fmtCurrency(totals.portfolioEquity)} />
          <MetricTile label="Portfolio Cash" value={fmtCurrency(totals.portfolioCash)} />
          <MetricTile
            label="Global DSCR"
            value={totals.annualDebtService > 0 ? fmtMultiple(totals.globalDSCR) : "N/A"}
          />
          <MetricTile label="Global LTV" value={fmtPercent(totals.globalLTV)} />
          <MetricTile label="Annual Revenue" value={fmtCurrency(totals.annualRevenue)} />
          <MetricTile label="Annual EBITDA" value={fmtCurrency(totals.annualEbitda)} />
        </View>
        <SectionHeader>Portfolio Net Worth</SectionHeader>
        <DataRow label="Portfolio Value" value={fmtCurrency(totals.portfolioValue)} />
        <DataRow label="+ Cash" value={fmtCurrency(totals.portfolioCash)} positive />
        <DataRow label="− Debt" value={`−${fmtCurrency(totals.portfolioDebt).replace("$", "")}`} negative />
        <View style={styles.divider} />
        <DataRow
          label="= Portfolio Net Worth"
          value={fmtCurrency(totals.portfolioNetWorth)}
          valueColor="#15803d"
        />
        <PageChrome />
      </Page>

      {/* Page 3 — Store Summary */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Store Summary</Text>
        <Text style={styles.bodyText}>Side-by-side comparison of all portfolio stores.</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { width: "18%" }]}>Store</Text>
          <Text style={[styles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>Revenue</Text>
          <Text style={[styles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>EBITDA</Text>
          <Text style={[styles.tableHeaderCell, { width: "8%", textAlign: "right" }]}>DSCR</Text>
          <Text style={[styles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>Value</Text>
          <Text style={[styles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>Debt</Text>
          <Text style={[styles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>Cash</Text>
          <Text style={[styles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>Equity</Text>
          <Text style={[styles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>Lease</Text>
        </View>
        {storeDetails.map((d) => (
          <View key={d.store.id} style={styles.tableRow}>
            <Text style={[styles.tableCellBold, { width: "18%" }]}>{d.store.name ?? "Store"}</Text>
            <Text style={[styles.tableCellRight, { width: "10%" }]}>{fmtCurrency(d.annualRevenue)}</Text>
            <Text style={[styles.tableCellRight, { width: "10%" }]}>{fmtCurrency(d.annualEbitda)}</Text>
            <Text style={[styles.tableCellRight, { width: "8%" }]}>
              {d.annualDebtService > 0 ? fmtMultiple(d.dscr) : "—"}
            </Text>
            <Text style={[styles.tableCellRight, { width: "10%" }]}>{fmtCurrency(d.valuation.businessValue)}</Text>
            <Text style={[styles.tableCellRight, { width: "10%" }]}>{fmtCurrency(d.debt)}</Text>
            <Text style={[styles.tableCellRight, { width: "10%" }]}>{fmtCurrency(d.cash)}</Text>
            <Text style={[styles.tableCellRight, { width: "10%" }]}>{fmtCurrency(d.equity)}</Text>
            <Text style={[styles.tableCellRight, { width: "10%" }]}>{`${d.leaseScore}/100`}</Text>
          </View>
        ))}
        <PageChrome />
      </Page>

      {/* Page 4 — Cash Flow & Credit Metrics */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Global Cash Flow & Credit Metrics</Text>
        <SectionHeader>Global Cash Flow</SectionHeader>
        <DataRow label="Revenue" value={fmtCurrency(cashFlow.revenue)} />
        <DataRow label="Utilities" value={fmtCurrency(cashFlow.utilities)} />
        <DataRow label="Rent" value={fmtCurrency(cashFlow.rent)} />
        <DataRow label="Payroll" value={fmtCurrency(cashFlow.payroll)} />
        <DataRow label="Repairs" value={fmtCurrency(cashFlow.repairs)} />
        <DataRow label="Other Expenses" value={fmtCurrency(cashFlow.otherExpenses)} />
        <DataRow label="EBITDA" value={fmtCurrency(cashFlow.ebitda)} positive />
        <DataRow label="Debt Service" value={fmtCurrency(cashFlow.debtService)} />
        <DataRow label="Cash Flow After Debt" value={fmtCurrency(cashFlow.cashFlowAfterDebt)} positive />
        <SectionHeader>Credit Metrics</SectionHeader>
        <DataRow
          label="Global DSCR"
          value={totals.annualDebtService > 0 ? fmtMultiple(totals.globalDSCR) : "N/A"}
        />
        <Text style={[styles.bodyText, { fontSize: 8, marginTop: -4 }]}>
          Combined EBITDA ÷ total annual debt service across all stores.
        </Text>
        <DataRow label="Global LTV" value={fmtPercent(totals.globalLTV)} />
        <Text style={[styles.bodyText, { fontSize: 8, marginTop: -4 }]}>
          Total debt as a percentage of total portfolio business value.
        </Text>
        <DataRow label="Debt Yield" value={totals.portfolioDebt > 0 ? fmtPercent(totals.debtYield) : "N/A"} />
        <Text style={[styles.bodyText, { fontSize: 8, marginTop: -4 }]}>
          Annual EBITDA ÷ total outstanding debt.
        </Text>
        <DataRow
          label="Debt / EBITDA"
          value={totals.annualEbitda > 0 ? fmtMultiple(totals.debtToEbitda) : "N/A"}
        />
        <Text style={[styles.bodyText, { fontSize: 8, marginTop: -4 }]}>
          Total debt relative to annual EBITDA — lower is better.
        </Text>
        <PageChrome />
      </Page>

      {/* Page 5 — Lease & Equipment Summary */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Lease & Equipment Summary</Text>
        <SectionHeader>Lease Summary</SectionHeader>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { width: "22%" }]}>Store</Text>
          <Text style={[styles.tableHeaderCell, { width: "18%" }]}>Expiration</Text>
          <Text style={[styles.tableHeaderCell, { width: "16%", textAlign: "right" }]}>Yrs Left</Text>
          <Text style={[styles.tableHeaderCell, { width: "16%", textAlign: "right" }]}>Options</Text>
          <Text style={[styles.tableHeaderCell, { width: "14%", textAlign: "right" }]}>Score</Text>
        </View>
        {storeDetails.map((d) => {
          const expires = parseDate(d.lease?.lease_end_date);
          const expiresStr = expires
            ? expires.toLocaleDateString("en-US", { month: "short", year: "numeric" })
            : d.store.occupancy_type === "owner_occupied"
              ? "Owner-Occ."
              : "—";
          return (
            <View key={`lease-${d.store.id}`} style={styles.tableRow}>
              <Text style={[styles.tableCellBold, { width: "22%" }]}>{d.store.name ?? "Store"}</Text>
              <Text style={[styles.tableCell, { width: "18%" }]}>{expiresStr}</Text>
              <Text style={[styles.tableCellRight, { width: "16%" }]}>
                {d.lease ? d.yearsRemaining.toFixed(1) : "—"}
              </Text>
              <Text style={[styles.tableCellRight, { width: "16%" }]}>
                {d.availableLeaseOptions > 0 ? String(d.availableLeaseOptions) : "—"}
              </Text>
              <Text style={[styles.tableCellRight, { width: "14%" }]}>{`${d.leaseScore}/100`}</Text>
            </View>
          );
        })}
        <SectionHeader>Equipment Summary</SectionHeader>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { width: "20%" }]}>Store</Text>
          <Text style={[styles.tableHeaderCell, { width: "10%" }]}>Grade</Text>
          <Text style={[styles.tableHeaderCell, { width: "12%", textAlign: "right" }]}>Avg Age</Text>
          <Text style={[styles.tableHeaderCell, { width: "12%", textAlign: "right" }]}>Washers</Text>
          <Text style={[styles.tableHeaderCell, { width: "12%", textAlign: "right" }]}>Dryers</Text>
          <Text style={[styles.tableHeaderCell, { width: "16%" }]}>Largest</Text>
          <Text style={[styles.tableHeaderCell, { width: "12%", textAlign: "right" }]}>Score</Text>
        </View>
        {storeDetails.map((d) => {
          const equipMetrics = computeEquipmentMetrics(d.equipment as EquipmentRecord[]);
          return (
            <View key={`equip-${d.store.id}`} style={styles.tableRow}>
              <Text style={[styles.tableCellBold, { width: "20%" }]}>{d.store.name ?? "Store"}</Text>
              <Text style={[styles.tableCell, { width: "10%" }]}>{d.equipmentGrade}</Text>
              <Text style={[styles.tableCellRight, { width: "12%" }]}>
                {`${d.avgEquipmentAge.toFixed(1)} yrs`}
              </Text>
              <Text style={[styles.tableCellRight, { width: "12%" }]}>{String(equipMetrics.totalWashers)}</Text>
              <Text style={[styles.tableCellRight, { width: "12%" }]}>{String(equipMetrics.totalDryers)}</Text>
              <Text style={[styles.tableCell, { width: "16%" }]}>
                {getLargestMachine(d.equipment as EquipmentRecord[])}
              </Text>
              <Text style={[styles.tableCellRight, { width: "12%" }]}>{`${equipMetrics.qualityScore}/100`}</Text>
            </View>
          );
        })}
        <PageChrome />
      </Page>

      {/* Page 6 — Appendix */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Appendix — Valuation Breakdowns</Text>
        <Text style={styles.bodyText}>
          Per-store EBITDA multiple build-up. Final multiples constrained between 2.5x and 6.5x.
        </Text>
        {storeDetails.map((d) => (
          <View key={`val-${d.store.id}`} wrap={false} style={{ marginBottom: 16 }}>
            <SectionHeader>{d.store.name ?? "Store"}</SectionHeader>
            <DataRow label="Base Multiple" value={fmtMultiple(d.valuation.baseMultiple)} />
            {(d.valuation.adjustments ?? []).slice(0, 6).map((adj: { label: string; reason: string; value: number; category: string }) => (
              <DataRow
                key={`${adj.label}-${adj.category}`}
                label={adj.label}
                value={formatAdj(adj.value)}
                positive={adj.value >= 0}
                negative={adj.value < 0}
              />
            ))}
            <DataRow label="Final Multiple" value={fmtMultiple(d.valuation.finalMultiple)} valueColor="#1d4ed8" />
            <DataRow label="Business Value" value={fmtCurrency(d.valuation.businessValue)} positive />
          </View>
        ))}
        <Text style={[styles.bodyText, { fontSize: 8, color: "#94a3b8", marginTop: 12 }]}>
          Report generated {generatedDate}. All figures based on owner-reported data and should be independently verified.
        </Text>
        <PageChrome />
      </Page>
    </Document>
  );
}

export default PortfolioReportDocument;
