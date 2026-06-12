import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import { fmtDollar, fmtMultiple, fmtPct } from "@/lib/calculations";
import type { PortfolioReportData } from "@/lib/getPortfolioReport";

export interface PortfolioReportProps {
  data: PortfolioReportData;
  generatedDate: string;
  userEmail?: string | null;
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F8FAFC", padding: 40, fontFamily: "Helvetica" },
  coverPage: { backgroundColor: "#0f1e3d", padding: 60, height: "100%" },
  coverTitle: { color: "white", fontSize: 36, fontWeight: "bold", marginBottom: 8 },
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
    marginTop: 20,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1e293b", marginBottom: 4 },
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
    backgroundColor: "white",
    border: "1 solid #e2e8f0",
    borderRadius: 6,
    padding: 12,
    margin: 4,
    flex: 1,
  },
  metricValue: { fontSize: 18, fontWeight: "bold", color: "#1e293b", marginBottom: 2 },
  metricLabel: {
    fontSize: 8,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  grid2: { flexDirection: "row", flexWrap: "wrap" },
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
  tableCell: { fontSize: 8, color: "#475569" },
  tableCellBold: { fontSize: 8, color: "#1e293b", fontWeight: "bold" },
  coverValue: { color: "white", fontSize: 48, fontWeight: "bold", marginTop: 24, marginBottom: 8 },
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(String(value).split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatAdj(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(2)}x`;
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
  width = "23%",
}: {
  label: string;
  value: string;
  valueColor?: string;
  width?: string;
}) {
  return (
    <View style={[styles.metricCard, { width }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
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
        <Text style={{ color: "#93c5fd", fontSize: 14, fontWeight: "bold", marginBottom: 48 }}>
          LAUNDROCFO
        </Text>
        <Text style={styles.coverTitle}>Portfolio Underwriting Report</Text>
        <Text style={styles.coverSubtitle}>
          {totals.storeCount} Store{totals.storeCount !== 1 ? "s" : ""} · Generated {generatedDate}
        </Text>
        {userEmail ? <Text style={styles.coverMeta}>{userEmail}</Text> : null}
        <Text style={styles.coverValue}>{fmtDollar(totals.portfolioNetWorth)}</Text>
        <Text style={{ color: "#94a3b8", fontSize: 14 }}>Portfolio Net Worth</Text>
        <View style={{ marginTop: 40 }}>
          <Text style={[styles.coverMeta, { marginTop: 16 }]}>
            CONFIDENTIAL — Prepared for lender review. Not for public distribution.
          </Text>
        </View>
      </Page>

      {/* Page 2 — Portfolio Summary */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Portfolio Summary</Text>
        <Text style={styles.bodyText}>
          Aggregated metrics across {totals.storeCount} store{totals.storeCount !== 1 ? "s" : ""}.
        </Text>
        <View style={styles.grid2}>
          <MetricTile label="Portfolio Value" value={fmtDollar(totals.portfolioValue)} valueColor="#15803d" />
          <MetricTile label="Portfolio Debt" value={fmtDollar(totals.portfolioDebt)} />
          <MetricTile label="Portfolio Equity" value={fmtDollar(totals.portfolioEquity)} />
          <MetricTile label="Portfolio Cash" value={fmtDollar(totals.portfolioCash)} />
          <MetricTile
            label="Global DSCR"
            value={totals.annualDebtService > 0 ? fmtMultiple(totals.globalDSCR) : "N/A"}
          />
          <MetricTile label="Global LTV" value={fmtPct(totals.globalLTV)} />
          <MetricTile label="Annual Revenue" value={fmtDollar(totals.annualRevenue)} />
          <MetricTile label="Annual EBITDA" value={fmtDollar(totals.annualEbitda)} />
        </View>
        <SectionHeader>Portfolio Net Worth</SectionHeader>
        <DataRow label="Portfolio Value" value={fmtDollar(totals.portfolioValue)} />
        <DataRow label="+ Cash" value={fmtDollar(totals.portfolioCash)} positive />
        <DataRow label="− Debt" value={`−${fmtDollar(totals.portfolioDebt).replace("$", "")}`} negative />
        <View style={styles.divider} />
        <DataRow
          label="= Portfolio Net Worth"
          value={fmtDollar(totals.portfolioNetWorth)}
          valueColor="#15803d"
        />
        <PageChrome />
      </Page>

      {/* Page 3 — Store Summary */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Store Summary</Text>
        <Text style={styles.bodyText}>Side-by-side comparison of all portfolio stores.</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCellBold, { width: "14%" }]}>Store</Text>
          <Text style={[styles.tableCellBold, { width: "12%" }]}>Revenue</Text>
          <Text style={[styles.tableCellBold, { width: "11%" }]}>EBITDA</Text>
          <Text style={[styles.tableCellBold, { width: "8%" }]}>DSCR</Text>
          <Text style={[styles.tableCellBold, { width: "12%" }]}>Value</Text>
          <Text style={[styles.tableCellBold, { width: "11%" }]}>Debt</Text>
          <Text style={[styles.tableCellBold, { width: "10%" }]}>Cash</Text>
          <Text style={[styles.tableCellBold, { width: "11%" }]}>Equity</Text>
          <Text style={[styles.tableCellBold, { width: "11%" }]}>Lease</Text>
        </View>
        {storeDetails.map((d) => (
          <View key={d.store.id} style={styles.tableRow}>
            <Text style={[styles.tableCellBold, { width: "14%" }]}>{d.store.name ?? "Store"}</Text>
            <Text style={[styles.tableCell, { width: "12%" }]}>{fmtDollar(d.annualRevenue)}</Text>
            <Text style={[styles.tableCell, { width: "11%" }]}>{fmtDollar(d.annualEbitda)}</Text>
            <Text style={[styles.tableCell, { width: "8%" }]}>
              {d.annualDebtService > 0 ? fmtMultiple(d.dscr) : "—"}
            </Text>
            <Text style={[styles.tableCell, { width: "12%" }]}>{fmtDollar(d.valuation.businessValue)}</Text>
            <Text style={[styles.tableCell, { width: "11%" }]}>{fmtDollar(d.debt)}</Text>
            <Text style={[styles.tableCell, { width: "10%" }]}>{fmtDollar(d.cash)}</Text>
            <Text style={[styles.tableCell, { width: "11%" }]}>{fmtDollar(d.equity)}</Text>
            <Text style={[styles.tableCell, { width: "11%" }]}>{d.leaseScore}/100</Text>
          </View>
        ))}
        <PageChrome />
      </Page>

      {/* Page 4 — Cash Flow & Credit Metrics */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Global Cash Flow & Credit Metrics</Text>
        <SectionHeader>Global Cash Flow</SectionHeader>
        <DataRow label="Revenue" value={fmtDollar(cashFlow.revenue)} />
        <DataRow label="Utilities" value={fmtDollar(cashFlow.utilities)} />
        <DataRow label="Rent" value={fmtDollar(cashFlow.rent)} />
        <DataRow label="Payroll" value={fmtDollar(cashFlow.payroll)} />
        <DataRow label="Repairs" value={fmtDollar(cashFlow.repairs)} />
        <DataRow label="Other Expenses" value={fmtDollar(cashFlow.otherExpenses)} />
        <DataRow label="EBITDA" value={fmtDollar(cashFlow.ebitda)} positive />
        <DataRow label="Debt Service" value={fmtDollar(cashFlow.debtService)} />
        <DataRow label="Cash Flow After Debt" value={fmtDollar(cashFlow.cashFlowAfterDebt)} positive />
        <SectionHeader>Credit Metrics</SectionHeader>
        <DataRow
          label="Global DSCR"
          value={totals.annualDebtService > 0 ? fmtMultiple(totals.globalDSCR) : "N/A"}
        />
        <Text style={[styles.bodyText, { fontSize: 8, marginTop: -4 }]}>
          Combined EBITDA ÷ total annual debt service across all stores.
        </Text>
        <DataRow label="Global LTV" value={fmtPct(totals.globalLTV)} />
        <Text style={[styles.bodyText, { fontSize: 8, marginTop: -4 }]}>
          Total debt as a percentage of total portfolio business value.
        </Text>
        <DataRow label="Debt Yield" value={totals.portfolioDebt > 0 ? fmtPct(totals.debtYield) : "N/A"} />
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
          <Text style={[styles.tableCellBold, { width: "22%" }]}>Store</Text>
          <Text style={[styles.tableCellBold, { width: "18%" }]}>Expiration</Text>
          <Text style={[styles.tableCellBold, { width: "16%" }]}>Yrs Left</Text>
          <Text style={[styles.tableCellBold, { width: "16%" }]}>Options</Text>
          <Text style={[styles.tableCellBold, { width: "14%" }]}>Score</Text>
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
              <Text style={[styles.tableCell, { width: "16%" }]}>
                {d.lease ? `${d.yearsRemaining.toFixed(1)}` : "—"}
              </Text>
              <Text style={[styles.tableCell, { width: "16%" }]}>
                {d.availableLeaseOptions > 0 ? String(d.availableLeaseOptions) : "—"}
              </Text>
              <Text style={[styles.tableCell, { width: "14%" }]}>{d.leaseScore}/100</Text>
            </View>
          );
        })}
        <SectionHeader>Equipment Summary</SectionHeader>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCellBold, { width: "20%" }]}>Store</Text>
          <Text style={[styles.tableCellBold, { width: "10%" }]}>Grade</Text>
          <Text style={[styles.tableCellBold, { width: "12%" }]}>Avg Age</Text>
          <Text style={[styles.tableCellBold, { width: "12%" }]}>Washers</Text>
          <Text style={[styles.tableCellBold, { width: "12%" }]}>Dryers</Text>
          <Text style={[styles.tableCellBold, { width: "16%" }]}>Largest</Text>
          <Text style={[styles.tableCellBold, { width: "12%" }]}>Score</Text>
        </View>
        {storeDetails.map((d) => {
          const equipMetrics = computeEquipmentMetrics(d.equipment as EquipmentRecord[]);
          return (
            <View key={`equip-${d.store.id}`} style={styles.tableRow}>
              <Text style={[styles.tableCellBold, { width: "20%" }]}>{d.store.name ?? "Store"}</Text>
              <Text style={[styles.tableCell, { width: "10%" }]}>{d.equipmentGrade}</Text>
              <Text style={[styles.tableCell, { width: "12%" }]}>
                {d.avgEquipmentAge.toFixed(1)} yrs
              </Text>
              <Text style={[styles.tableCell, { width: "12%" }]}>{equipMetrics.totalWashers}</Text>
              <Text style={[styles.tableCell, { width: "12%" }]}>{equipMetrics.totalDryers}</Text>
              <Text style={[styles.tableCell, { width: "16%" }]}>
                {getLargestMachine(d.equipment as EquipmentRecord[])}
              </Text>
              <Text style={[styles.tableCell, { width: "12%" }]}>{equipMetrics.qualityScore}/100</Text>
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
                label={`${adj.label}`}
                value={formatAdj(adj.value)}
                positive={adj.value >= 0}
                negative={adj.value < 0}
              />
            ))}
            <DataRow label="Final Multiple" value={fmtMultiple(d.valuation.finalMultiple)} valueColor="#1d4ed8" />
            <DataRow label="Business Value" value={fmtDollar(d.valuation.businessValue)} positive />
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
