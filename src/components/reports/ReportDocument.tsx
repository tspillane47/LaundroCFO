import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import {
  calcGlobalDSCR,
  calcDebtYield,
  calcEbitdaPerSF,
  calcEbitdaMargin,
  calcOccupancyCostRatio,
  calcRentToRevenue,
  calcRevenuePerSF,
  calcUtilityRatio,
  calcLeaseScore,
  leaseRiskLabel,
  fmtDollar,
  fmtMultiple,
  fmtPct,
} from "@/lib/calculations";
import type { ValuationResult } from "@/lib/valuation";
import type { ReportFinancialContext } from "@/lib/reportFinancials";
import type { LaundroCfoScoreResult } from "@/lib/laundroCfoScore";
import { buildEquitySnapshot } from "@/lib/getStoreReportData";
import {
  RevenueExpenseBarChart,
  CategoryBreakdownBar,
  BenchmarkBar,
  StatusIndicator,
  waterKpiStatusColor,
  benchmarkStatusColor,
  UtilityLineChart,
  PDF_CHART,
} from "@/components/reports/charts";

export interface ReportProps {
  store: any;
  lease: any;
  leaseOptions: any[];
  equipment: any[];
  insurance: any[];
  realEstate: any;
  valuation: ValuationResult;
  portfolioStores: any[];
  generatedDate: string;
  executiveSummary: string;
  financial: ReportFinancialContext;
  laundroCfoScore: LaundroCfoScoreResult;
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F8FAFC", padding: 40, fontFamily: "Helvetica" },
  coverPage: { backgroundColor: "#0f1e3d", padding: 50, height: "100%" },
  coverTitle: {
    color: "white",
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    fontWeight: "bold",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  coverTagline: { color: "#93c5fd", fontSize: 14, marginBottom: 8 },
  coverSubtitle: { color: "#93c5fd", fontSize: 16, marginBottom: 40 },
  coverMeta: { color: "#94a3b8", fontSize: 12, marginTop: 8 },
  sectionHeader: {
    backgroundColor: "#0f1e3d",
    color: "white",
    padding: "10 14",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 14,
    marginTop: 28,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1e293b", marginBottom: 8, marginTop: 4 },
  bodyText: { fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
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
  ratioCard: {
    backgroundColor: "white",
    border: "1 solid #e2e8f0",
    borderRadius: 6,
    padding: "10 8",
    width: "23%",
    minWidth: 120,
    marginBottom: 8,
  },
  ratioGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  metricValue: { fontSize: 18, fontWeight: "bold", color: "#1e293b", marginBottom: 2 },
  ratioValue: { fontSize: 20, fontWeight: "bold", color: "#1e293b", marginTop: 4 },
  metricLabel: {
    fontSize: 8,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ratioLabel: {
    fontSize: 8,
    color: "#64748b",
    letterSpacing: 0.3,
  },
  grid2: { flexDirection: "row", flexWrap: "wrap" },
  positiveText: { color: "#15803d" },
  negativeText: { color: "#b91c1c" },
  warningBox: {
    backgroundColor: "#fffbeb",
    border: "1 solid #fcd34d",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  successBox: {
    backgroundColor: "#f0fdf4",
    border: "1 solid #86efac",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  dangerBox: {
    backgroundColor: "#fef2f2",
    border: "1 solid #fca5a5",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  pageNumber: { position: "absolute", bottom: 24, right: 40, fontSize: 9, color: "#94a3b8" },
  footer: { position: "absolute", bottom: 24, left: 40, fontSize: 9, color: "#94a3b8" },
  divider: { borderBottom: "1 solid #e2e8f0", marginVertical: 12 },
  badge: {
    backgroundColor: "#dbeafe",
    borderRadius: 10,
    padding: "2 8",
    fontSize: 9,
    color: "#1d4ed8",
  },
  coverValue: { color: "white", fontSize: 48, fontWeight: "bold", marginTop: 24, marginBottom: 8 },
  coverBadge: {
    backgroundColor: "#1e3a5f",
    borderRadius: 20,
    padding: "6 14",
    fontSize: 12,
    color: "#93c5fd",
    alignSelf: "flex-start",
    marginTop: 12,
  },
  twoCol: { flexDirection: "row", gap: 16 },
  col: { flex: 1 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottom: "1 solid #e2e8f0",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottom: "1 solid #f1f5f9",
  },
  tableCell: { fontSize: 9, color: "#475569" },
  tableCellBold: { fontSize: 9, color: "#1e293b", fontWeight: "bold" },
  boxText: { fontSize: 9, color: "#475569", lineHeight: 1.5 },
  tocItem: { fontSize: 11, color: "#475569", marginBottom: 6, flexDirection: "row", justifyContent: "space-between" },
  scoreHeroGrade: { fontSize: 56, fontWeight: "bold", color: "#1d4ed8", lineHeight: 1 },
  scoreHeroValue: { fontSize: 22, fontWeight: "bold", color: "#1e293b", marginTop: 6 },
  chartContainer: { marginTop: 8, marginBottom: 4 },
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearsRemaining(endDate: string | null | undefined): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  return Math.max(0, (end.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000));
}

function formatAdj(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(2)}x`;
}

function financeabilityRating(dscr: number, globalDscr: number): string {
  if (dscr >= 1.5 && globalDscr >= 1.5) return "Strong";
  if (dscr >= 1.25 && globalDscr >= 1.25) return "Acceptable";
  if (dscr >= 1.0) return "Marginal";
  return "Weak";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Poor";
}

function ratioColor(value: number, good: number, warn: number, invert = false): string {
  if (invert) {
    if (value <= good) return "#15803d";
    if (value <= warn) return "#b45309";
    return "#b91c1c";
  }
  if (value >= good) return "#15803d";
  if (value >= warn) return "#b45309";
  return "#b91c1c";
}

function labelize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ServiceMixPct = {
  selfService: number;
  wdf: number;
  commercial: number;
  pickupDelivery: number;
};

function resolveServiceMix(
  store: any,
  revenueBreakdown: ReportProps["financial"]["revenueBreakdown"]
): ServiceMixPct | null {
  const storeMix = {
    selfService: store?.self_service_pct,
    wdf: store?.wdf_pct,
    commercial: store?.commercial_pct,
    pickupDelivery: store?.pickup_delivery_pct,
  };
  const hasStoreMix = Object.values(storeMix).some((v) => v != null && Number(v) > 0);
  if (hasStoreMix) {
    const wdf = Number(storeMix.wdf) || 0;
    const commercial = Number(storeMix.commercial) || 0;
    const pickupDelivery = Number(storeMix.pickupDelivery) || 0;
    const selfService =
      storeMix.selfService != null
        ? Number(storeMix.selfService)
        : Math.max(0, 100 - wdf - commercial - pickupDelivery);
    return { selfService, wdf, commercial, pickupDelivery };
  }

  if (revenueBreakdown.length === 0) return null;

  const lookup: Record<string, number> = {};
  for (const line of revenueBreakdown) {
    lookup[line.label] = line.pctOfTotal;
  }

  const selfService = lookup["Self-Service"] ?? 0;
  const wdf = lookup["WDF"] ?? 0;
  const commercial = lookup["Commercial"] ?? 0;
  const pickupDelivery = lookup["Other"] ?? lookup["Vending"] ?? 0;
  const total = selfService + wdf + commercial + pickupDelivery;
  if (total <= 0) return null;

  return { selfService, wdf, commercial, pickupDelivery };
}

function PageChrome({ storeName }: { storeName: string }) {
  return (
    <>
      <Text style={styles.footer} fixed>
        LaundroCFO — {storeName} — Confidential
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
  width = "48%",
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

function RatioMetricTile({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.ratioCard}>
      <Text style={styles.ratioLabel} hyphenationCallback={(word) => [word]}>
        {label}
      </Text>
      <Text
        style={[styles.ratioValue, valueColor ? { color: valueColor } : {}]}
        hyphenationCallback={(word) => [word]}
      >
        {value}
      </Text>
    </View>
  );
}

function computeReportMetrics(props: ReportProps) {
  const { store, lease, leaseOptions, equipment, valuation, portfolioStores, financial } = props;
  const storeName = store?.name ?? "Store";
  const address = store?.address ?? "";
  const sqft = store?.square_footage ?? 3500;
  const monthlyRevenue = financial.monthlyAverages.revenue;
  const monthlyExpenses = financial.monthlyAverages.expenses;
  const monthlyEbitda = financial.monthlyAverages.ebitda;
  const annualRevenue = financial.revenueTtmTotal;
  const annualEbitda = financial.ebitdaTtmTotal;
  const annualDebtService = financial.annualDebtService;
  const loanBalance = financial.totalOutstandingDebt;
  const isOwnerOccupied = store?.occupancy_type === "owner_occupied";

  const dscr = financial.dscr ?? 0;
  const portfolioEbitda = portfolioStores.reduce(
    (s, st) => s + ((st.monthly_revenue ?? 0) - (st.monthly_expenses ?? 0)) * 12,
    0
  );
  const portfolioDebtService = portfolioStores.reduce(
    (s, st) => s + (st.annual_debt_service ?? 0),
    0
  );
  const globalDscr =
    portfolioDebtService > 0 ? calcGlobalDSCR(portfolioEbitda, portfolioDebtService) : dscr;

  const ebitdaMargin = financial.ebitdaMargin;
  const revenuePerSF = calcRevenuePerSF(annualRevenue, sqft);
  const ebitdaPerSF = calcEbitdaPerSF(annualEbitda, sqft);
  const utilityRow = financial.benchmarkRows.find((r) => r.metric === "Utility Ratio");
  const utilityRatio = utilityRow?.store ?? calcUtilityRatio(store?.monthly_utilities ?? 0, monthlyRevenue);
  const debtYield = loanBalance > 0 ? calcDebtYield(annualEbitda, loanBalance) : 0;
  const equitySnapshot = buildEquitySnapshot(valuation.businessValue, loanBalance);

  const equipRecords = (equipment ?? []) as EquipmentRecord[];
  const equipMetrics = computeEquipmentMetrics(equipRecords);

  const yearsRemaining = lease ? calcYearsRemaining(lease.lease_end_date) : 0;
  const availableOptions = (leaseOptions ?? []).filter((o) => o.status === "Available");
  const optionYears = availableOptions.reduce((s, o) => s + (o.option_years ?? 0), 0);
  const totalLeaseControl = isOwnerOccupied ? 15 : yearsRemaining + optionYears;

  const monthlyRent = lease?.monthly_rent ?? props.realEstate?.monthly_rent_charged ?? 0;
  const camCharges = lease?.cam_charges ?? 0;
  const annualOccupancyCost = (monthlyRent + camCharges) * 12;
  const rentRow = financial.benchmarkRows.find((r) => r.metric === "Rent to Revenue");
  const ttmRentTotal = financial.expenseBreakdown.find((l) => l.label === "Rent")?.ttmTotal ?? 0;
  const rentToRevenue =
    rentRow?.store ??
    (annualRevenue > 0 && ttmRentTotal > 0
      ? calcRentToRevenue(ttmRentTotal, annualRevenue)
      : monthlyRent > 0
        ? calcRentToRevenue(monthlyRent * 12, annualRevenue)
        : 0);
  const occupancyCostRatio = calcOccupancyCostRatio(annualOccupancyCost, annualRevenue);

  const leaseScore = lease
    ? calcLeaseScore({
        yearsRemaining,
        renewalOptions: availableOptions.length,
        relocationClause: false,
        assignmentWithConsent: lease.assignment_rights === "With Consent",
        exclusiveUse: lease.exclusivity_clause ?? false,
      })
    : isOwnerOccupied
      ? 95
      : 0;

  const leaseExpires = parseDate(lease?.lease_end_date);
  const leaseExpiresStr = leaseExpires
    ? leaseExpires.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "—";

  const totalInsurancePremium = (props.insurance ?? []).reduce(
    (s, p) => s + (p.annual_premium ?? (p.monthly_premium ?? 0) * 12),
    0
  );

  return {
    storeName,
    address,
    sqft,
    monthlyRevenue,
    monthlyExpenses,
    monthlyEbitda,
    annualRevenue,
    annualEbitda,
    annualDebtService,
    loanBalance,
    isOwnerOccupied,
    dscr,
    globalDscr,
    portfolioEbitda,
    portfolioDebtService,
    ebitdaMargin,
    revenuePerSF,
    ebitdaPerSF,
    utilityRatio,
    debtYield,
    equipRecords,
    equipMetrics,
    yearsRemaining,
    availableOptions,
    totalLeaseControl,
    monthlyRent,
    camCharges,
    annualOccupancyCost,
    rentToRevenue,
    occupancyCostRatio,
    leaseScore,
    leaseExpiresStr,
    totalInsurancePremium,
    financeRating: financeabilityRating(dscr, globalDscr),
    valuation,
    equitySnapshot,
    surplusCashFlow: financial.surplusCashFlow,
    limitedData: financial.limitedData,
    hasMonthlyFinancials: financial.hasMonthlyFinancials,
    monthsUsed: financial.ttm.monthsUsed,
  };
}

function BreakdownTable({
  lines,
  totalLabel,
  totalTtm,
  totalMonthly,
}: {
  lines: { label: string; ttmTotal: number; monthlyAverage: number; pctOfTotal: number }[];
  totalLabel: string;
  totalTtm: number;
  totalMonthly: number;
}) {
  return (
    <>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellBold, { width: "28%" }]}>Category</Text>
        <Text style={[styles.tableCellBold, { width: "22%", textAlign: "right" }]}>TTM Total</Text>
        <Text style={[styles.tableCellBold, { width: "22%", textAlign: "right" }]}>Monthly Avg</Text>
        <Text style={[styles.tableCellBold, { width: "14%", textAlign: "right" }]}>% Mix</Text>
      </View>
      {lines.map((line) => (
        <View key={line.label} style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: "28%" }]}>{line.label}</Text>
          <Text style={[styles.tableCell, { width: "22%", textAlign: "right" }]}>{fmtDollar(line.ttmTotal)}</Text>
          <Text style={[styles.tableCell, { width: "22%", textAlign: "right" }]}>{fmtDollar(line.monthlyAverage)}</Text>
          <Text style={[styles.tableCell, { width: "14%", textAlign: "right" }]}>{fmtPct(line.pctOfTotal, 0)}</Text>
        </View>
      ))}
      <View style={[styles.tableRow, { backgroundColor: "#f8fafc" }]}>
        <Text style={[styles.tableCellBold, { width: "28%" }]}>{totalLabel}</Text>
        <Text style={[styles.tableCellBold, { width: "22%", textAlign: "right" }]}>{fmtDollar(totalTtm)}</Text>
        <Text style={[styles.tableCellBold, { width: "22%", textAlign: "right" }]}>{fmtDollar(totalMonthly)}</Text>
        <Text style={[styles.tableCellBold, { width: "14%", textAlign: "right" }]}>100%</Text>
      </View>
    </>
  );
}

export function ReportDocument(props: ReportProps) {
  const m = computeReportMetrics(props);
  const {
    executiveSummary,
    generatedDate,
    lease,
    realEstate,
    insurance,
    portfolioStores,
    store,
    financial,
    laundroCfoScore,
  } = props;

  return (
    <Document
      title={`LaundroCFO Underwriting Report — ${m.storeName}`}
      author="LaundroCFO"
      subject="Lender Underwriting Report"
    >
      {/* 1 — Cover Page */}
      <Page size="LETTER" style={styles.coverPage}>
        <Text style={{ color: "#93c5fd", fontSize: 14, fontWeight: "bold", marginBottom: 48 }}>
          LAUNDROCFO
        </Text>
        <Text style={styles.coverTitle}>Underwriting Report</Text>
        <Text style={styles.coverTagline}>Lender Valuation Summary</Text>
        <Text style={styles.coverSubtitle}>{m.storeName}</Text>
        {m.address ? <Text style={styles.coverMeta}>{m.address}</Text> : null}
        <Text style={styles.coverValue}>{fmtDollar(m.valuation.businessValue)}</Text>
        <Text style={{ color: "#94a3b8", fontSize: 14 }}>Estimated Business Value</Text>
        <View style={styles.coverBadge}>
          <Text>{fmtMultiple(m.valuation.finalMultiple)} EBITDA Multiple</Text>
        </View>
        <View style={{ marginTop: 40 }}>
          <Text style={styles.coverMeta}>Generated: {generatedDate}</Text>
          <Text style={[styles.coverMeta, { marginTop: 16 }]}>
            CONFIDENTIAL — Prepared for lender review. Not for public distribution.
          </Text>
          <Text style={[styles.coverMeta, { marginTop: 4 }]}>
            {m.sqft.toLocaleString()} SF · {m.equipMetrics.totalMachines} machines ·{" "}
            {m.isOwnerOccupied ? "Owner-Occupied" : "Leased"}
          </Text>
        </View>
        <View style={{ marginTop: 32 }}>
          <Text style={{ color: "#64748b", fontSize: 10, marginBottom: 8 }}>TABLE OF CONTENTS</Text>
          {[
            "Executive Summary",
            "Store Overview",
            "Financial Analysis",
            "Utility Analysis",
            "Benchmarking",
            "Lease Analysis",
            "Equipment Analysis",
            "Valuation Analysis",
            "Risk Assessment",
            "Insurance Summary",
            "Portfolio Summary",
            "Appendix",
          ].map((item, i) => (
            <View key={item} style={styles.tocItem}>
              <Text style={{ fontSize: 10, color: "#94a3b8" }}>{item}</Text>
              <Text style={{ fontSize: 10, color: "#64748b" }}>{i + 2}</Text>
            </View>
          ))}
        </View>
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 2 — Executive Summary */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <Text style={styles.bodyText}>{executiveSummary}</Text>
        <View style={styles.grid2}>
          <MetricTile label="Store Value" value={fmtDollar(m.valuation.businessValue)} valueColor="#15803d" />
          <MetricTile label="EBITDA Multiple" value={fmtMultiple(m.valuation.finalMultiple)} valueColor="#1d4ed8" />
          <MetricTile label="Annual EBITDA" value={fmtDollar(m.annualEbitda)} />
          <MetricTile
            label="EBITDA Margin"
            value={fmtPct(m.ebitdaMargin)}
            valueColor={ratioColor(m.ebitdaMargin, 25, 20)}
          />
        </View>
        <SectionHeader>Financeability Snapshot</SectionHeader>
        <DataRow
          label="Store DSCR"
          value={m.annualDebtService > 0 ? fmtMultiple(m.dscr) : "N/A"}
          valueColor={m.annualDebtService > 0 ? ratioColor(m.dscr, 1.5, 1.25) : undefined}
        />
        <DataRow
          label="Global DSCR"
          value={m.portfolioDebtService > 0 ? fmtMultiple(m.globalDscr) : "N/A"}
          valueColor={m.portfolioDebtService > 0 ? ratioColor(m.globalDscr, 1.5, 1.25) : undefined}
        />
        <DataRow label="Financeability Rating" value={m.financeRating} />
        {m.dscr >= 1.25 ? (
          <View style={styles.successBox}>
            <Text style={[styles.boxText, styles.positiveText]}>
              ✓ Meets minimum 1.25x DSCR threshold — suitable for SBA 7(a) or conventional commercial financing.
            </Text>
          </View>
        ) : m.annualDebtService > 0 ? (
          <View style={styles.dangerBox}>
            <Text style={[styles.boxText, styles.negativeText]}>
              ⚠ DSCR below 1.25x — address debt service before lender submission.
            </Text>
          </View>
        ) : null}
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 3 — Store Overview */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Store Overview</Text>
        <Text style={styles.bodyText}>
          Operational profile and market positioning for {m.storeName}.
        </Text>
        <SectionHeader>Property & Operations</SectionHeader>
        <DataRow label="Store Name" value={m.storeName} />
        <DataRow label="Address" value={m.address || "—"} />
        <DataRow label="Square Footage" value={`${m.sqft.toLocaleString()} SF`} />
        <DataRow label="Occupancy Type" value={m.isOwnerOccupied ? "Owner-Occupied" : "Leased"} />
        <DataRow label="Total Machines" value={String(m.equipMetrics.totalMachines)} />
        <DataRow
          label="Washers / Dryers"
          value={`${m.equipMetrics.totalWashers} / ${m.equipMetrics.totalDryers}`}
        />
        <SectionHeader>Market & Qualitative Factors</SectionHeader>
        <DataRow label="Market Density" value={labelize(store?.market_density ?? store?.location_type)} />
        <DataRow label="Store Condition" value={labelize(store?.store_condition)} />
        <DataRow label="Revenue Trend" value={labelize(store?.revenue_trend)} />
        <DataRow label="Competition Level" value={labelize(store?.competition_level)} />
        {store?.last_retool_year && (
          <DataRow label="Last Retool" value={`${store.last_retool_year}${store.retool_type ? ` — ${store.retool_type}` : ""}`} />
        )}
        {(() => {
          const serviceMix = resolveServiceMix(store, financial.revenueBreakdown);
          if (!serviceMix) return null;
          return (
            <>
              <SectionHeader>Service Mix</SectionHeader>
              <DataRow label="Self Service" value={fmtPct(serviceMix.selfService, 0)} />
              <DataRow label="Wash-Dry-Fold" value={fmtPct(serviceMix.wdf, 0)} />
              <DataRow label="Commercial" value={fmtPct(serviceMix.commercial, 0)} />
              <DataRow label="Pickup & Delivery" value={fmtPct(serviceMix.pickupDelivery, 0)} />
            </>
          );
        })()}
        <View style={styles.successBox}>
          <Text style={styles.boxText}>
            Revenue per SF of ${m.revenuePerSF.toFixed(2)} and EBITDA per SF of ${m.ebitdaPerSF.toFixed(2)}{" "}
            {m.revenuePerSF >= 150 ? "indicate strong productivity relative to industry benchmarks." : "should be benchmarked against comparable stores in the market."}
          </Text>
        </View>
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 4 — Financial Analysis */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Financial Analysis</Text>
        <Text style={styles.bodyText}>
          {m.hasMonthlyFinancials
            ? `Trailing ${m.monthsUsed}-month financial profile from monthly P&L records.`
            : "Limited data — figures below use owner-reported profile fields until monthly financials are entered."}
        </Text>
        {m.limitedData && (
          <View style={styles.warningBox}>
            <Text style={styles.boxText}>
              ⚠ Limited financial history on file. Enter at least 6 months of monthly financials for full TTM accuracy.
            </Text>
          </View>
        )}
        <SectionHeader>Income Statement — TTM vs Monthly Average</SectionHeader>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCellBold, { width: "40%" }]}>Line Item</Text>
          <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right" }]}>TTM Total</Text>
          <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right" }]}>Monthly Avg</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: "40%" }]}>Revenue</Text>
          <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right" }]}>{fmtDollar(m.annualRevenue)}</Text>
          <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right" }]}>{fmtDollar(m.monthlyRevenue)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: "40%" }]}>Operating Expenses</Text>
          <Text style={[styles.tableCell, { width: "30%", textAlign: "right" }]}>{fmtDollar(financial.expenseTtmTotal)}</Text>
          <Text style={[styles.tableCell, { width: "30%", textAlign: "right" }]}>{fmtDollar(m.monthlyExpenses)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCellBold, { width: "40%" }]}>EBITDA</Text>
          <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right", color: "#15803d" }]}>{fmtDollar(m.annualEbitda)}</Text>
          <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right", color: "#15803d" }]}>{fmtDollar(m.monthlyEbitda)}</Text>
        </View>
        <DataRow label="EBITDA Margin" value={fmtPct(m.ebitdaMargin)} valueColor={ratioColor(m.ebitdaMargin, 25, 20)} />

        {financial.revenueBreakdown.length > 0 && (
          <>
            <SectionHeader>Revenue Breakdown</SectionHeader>
            <BreakdownTable
              lines={financial.revenueBreakdown}
              totalLabel="Total Revenue"
              totalTtm={financial.revenueTtmTotal}
              totalMonthly={m.monthlyRevenue}
            />
            <View style={styles.chartContainer} wrap={false}>
              <CategoryBreakdownBar
                segments={financial.revenueBreakdown.map((l) => ({
                  label: l.label,
                  value: l.ttmTotal,
                  pct: l.pctOfTotal,
                }))}
                title="Revenue Mix"
                width={500}
                height={88}
              />
            </View>
          </>
        )}

        {financial.expenseBreakdown.length > 0 && (
          <>
            <SectionHeader>Expense Breakdown</SectionHeader>
            <BreakdownTable
              lines={financial.expenseBreakdown}
              totalLabel="Total Expenses"
              totalTtm={financial.expenseTtmTotal}
              totalMonthly={m.monthlyExpenses}
            />
            <View style={styles.chartContainer} wrap={false}>
              <CategoryBreakdownBar
                segments={financial.expenseBreakdown.map((l) => ({
                  label: l.label,
                  value: l.ttmTotal,
                  pct: l.pctOfTotal,
                }))}
                title="Expense Mix"
                width={500}
                height={88}
              />
            </View>
          </>
        )}

        <SectionHeader>Water KPI</SectionHeader>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <StatusIndicator status={waterKpiStatusColor(financial.waterKPI.status)} />
          <Text style={styles.bodyText}>
            Water cost is {fmtPct(financial.waterKPI.ratio * 100)} of Self-Service Revenue —{" "}
            {financial.waterKPI.status} ({financial.waterKPI.status === "Healthy" ? "<15%" : financial.waterKPI.status === "Watch" ? "15–20%" : ">20%"})
          </Text>
        </View>
        <DataRow label="Avg Monthly Water" value={fmtDollar(financial.waterKPI.waterMonthlyAverage)} />
        <DataRow label="Avg Self-Service Revenue" value={fmtDollar(financial.waterKPI.selfServiceMonthlyAverage)} />

        <SectionHeader>TTM Revenue Trend</SectionHeader>
        <View style={styles.chartContainer} wrap={false}>
          <RevenueExpenseBarChart data={financial.ttmChartData} width={500} height={160} />
        </View>
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 4b — Debt & Underwriting Ratios */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Financial Analysis — Debt & Coverage</Text>
        <SectionHeader>Loan Detail</SectionHeader>
        {financial.loans.length === 0 ? (
          <Text style={styles.bodyText}>No active loans on file.</Text>
        ) : (
          <>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellBold, { width: "18%" }]}>Lender</Text>
              <Text style={[styles.tableCellBold, { width: "14%", textAlign: "right" }]}>Original</Text>
              <Text style={[styles.tableCellBold, { width: "14%", textAlign: "right" }]}>Balance</Text>
              <Text style={[styles.tableCellBold, { width: "10%", textAlign: "right" }]}>Rate</Text>
              <Text style={[styles.tableCellBold, { width: "14%", textAlign: "right" }]}>Payment</Text>
              <Text style={[styles.tableCellBold, { width: "14%", textAlign: "right" }]}>Term Left</Text>
            </View>
            {financial.loans.map((loan) => (
              <View key={loan.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: "18%" }]}>{loan.lenderName}</Text>
                <Text style={[styles.tableCell, { width: "14%", textAlign: "right" }]}>{fmtDollar(loan.originalBalance)}</Text>
                <Text style={[styles.tableCell, { width: "14%", textAlign: "right" }]}>{fmtDollar(loan.estimatedBalance)}</Text>
                <Text style={[styles.tableCell, { width: "10%", textAlign: "right" }]}>{loan.interestRate.toFixed(2)}%</Text>
                <Text style={[styles.tableCell, { width: "14%", textAlign: "right" }]}>{fmtDollar(loan.monthlyPayment)}/mo</Text>
                <Text style={[styles.tableCell, { width: "14%", textAlign: "right" }]}>{loan.remainingMonths} mo</Text>
              </View>
            ))}
          </>
        )}
        <DataRow label="Total Monthly Debt Service" value={fmtDollar(financial.totalMonthlyDebtService)} />
        <DataRow label="Annual Debt Service" value={m.annualDebtService > 0 ? fmtDollar(m.annualDebtService) : "Not reported"} />
        <DataRow
          label="DSCR"
          value={m.annualDebtService > 0 ? fmtMultiple(m.dscr) : "N/A"}
          valueColor={m.annualDebtService > 0 ? ratioColor(m.dscr, 1.5, 1.25) : undefined}
        />
        <DataRow label="Surplus Cash Flow" value={fmtDollar(m.surplusCashFlow)} positive={m.surplusCashFlow >= 0} negative={m.surplusCashFlow < 0} />

        <SectionHeader>Underwriting Ratios</SectionHeader>
        <View style={styles.ratioGrid}>
          <RatioMetricTile
            label="DSCR"
            value={m.annualDebtService > 0 ? fmtMultiple(m.dscr) : "N/A"}
            valueColor={m.annualDebtService > 0 ? ratioColor(m.dscr, 1.5, 1.25) : undefined}
          />
          <RatioMetricTile
            label="Global DSCR"
            value={m.portfolioDebtService > 0 ? fmtMultiple(m.globalDscr) : "N/A"}
            valueColor={m.portfolioDebtService > 0 ? ratioColor(m.globalDscr, 1.5, 1.25) : undefined}
          />
          <RatioMetricTile
            label="EBITDA Margin"
            value={fmtPct(m.ebitdaMargin)}
            valueColor={ratioColor(m.ebitdaMargin, 25, 20)}
          />
          <RatioMetricTile
            label="Debt Yield"
            value={m.loanBalance > 0 ? fmtPct(m.debtYield) : "N/A"}
            valueColor={m.loanBalance > 0 ? ratioColor(m.debtYield, 12, 8) : undefined}
          />
          <RatioMetricTile
            label="Rent/Rev"
            value={fmtPct(m.rentToRevenue)}
            valueColor={ratioColor(m.rentToRevenue, 0, 15, true)}
          />
          <RatioMetricTile
            label="Util/Rev"
            value={fmtPct(m.utilityRatio)}
            valueColor={ratioColor(m.utilityRatio, 0, 17, true)}
          />
          <RatioMetricTile label="Rev/SF" value={`$${m.revenuePerSF.toFixed(2)}`} />
          <RatioMetricTile label="EBITDA/SF" value={`$${m.ebitdaPerSF.toFixed(2)}`} />
        </View>
        {m.utilityRatio > 17 && (
          <View style={styles.warningBox}>
            <Text style={styles.boxText}>
              ⚠ Utility ratio at {fmtPct(m.utilityRatio)} — monitor against 20% alert threshold. Industry top quartile targets below 15%.
            </Text>
          </View>
        )}
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 5 — Utility Analysis */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Utility Analysis</Text>
        <Text style={styles.bodyText}>
          Trailing twelve-month utility costs from monthly utility records, with industry comparison.
        </Text>

        <SectionHeader>Water KPI</SectionHeader>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <StatusIndicator status={waterKpiStatusColor(financial.waterKPI.status)} />
          <Text style={styles.bodyText}>
            Water ÷ Self-Service Revenue = {fmtPct(financial.waterKPI.ratio * 100)} —{" "}
            {financial.waterKPI.status}
          </Text>
        </View>

        {financial.utilityReport.chartSeries.length > 0 ? (
          <>
            <SectionHeader>TTM Utility Costs</SectionHeader>
            {financial.utilityReport.chartSeries.map((series) => (
              <View key={series.field} style={styles.chartContainer} wrap={false}>
                <UtilityLineChart
                  data={series.data}
                  label={`${series.label} Cost TTM`}
                  color={
                    series.field === "water"
                      ? PDF_CHART.blue
                      : series.field === "gas"
                        ? PDF_CHART.amber
                        : PDF_CHART.greenDark
                  }
                  width={500}
                  height={100}
                />
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.bodyText}>No utility cost data on file for the trailing twelve months.</Text>
        )}

        {financial.utilityReport.summaryRows.length > 0 && (
          <>
            <SectionHeader>Utility Summary</SectionHeader>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellBold, { width: "18%" }]}>Utility</Text>
              <Text style={[styles.tableCellBold, { width: "20%", textAlign: "right" }]}>TTM Total</Text>
              <Text style={[styles.tableCellBold, { width: "18%", textAlign: "right" }]}>Monthly Avg</Text>
              <Text style={[styles.tableCellBold, { width: "16%", textAlign: "right" }]}>% Revenue</Text>
              <Text style={[styles.tableCellBold, { width: "28%", textAlign: "right" }]}>Status</Text>
            </View>
            {financial.utilityReport.summaryRows.map((row) => (
              <View key={row.label} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: "18%" }]}>{row.label}</Text>
                <Text style={[styles.tableCell, { width: "20%", textAlign: "right" }]}>{fmtDollar(row.ttmTotal)}</Text>
                <Text style={[styles.tableCell, { width: "18%", textAlign: "right" }]}>{fmtDollar(row.monthlyAverage)}</Text>
                <Text style={[styles.tableCell, { width: "16%", textAlign: "right" }]}>{fmtPct(row.pctOfRevenue)}</Text>
                <Text style={[styles.tableCell, { width: "28%", textAlign: "right" }]}>{row.status}</Text>
              </View>
            ))}
          </>
        )}
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 6 — Benchmarking */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Benchmarking</Text>
        <Text style={styles.bodyText}>
          Store performance vs industry benchmarks (median and top quartile).
        </Text>
        <SectionHeader>LaundroCFO Score</SectionHeader>
        <View style={{ flexDirection: "row", gap: 16, marginBottom: 16, alignItems: "center" }}>
          <View style={[styles.metricCard, { width: "34%", alignItems: "center", paddingVertical: 16 }]}>
            <Text style={styles.metricLabel}>Overall Grade</Text>
            <Text style={styles.scoreHeroGrade}>{laundroCfoScore.grade}</Text>
            <Text style={styles.scoreHeroValue}>{laundroCfoScore.total}/100</Text>
          </View>
          <View style={{ flex: 1 }}>
            {(
              [
                ["Financial Performance", laundroCfoScore.categories.financialPerformance],
                ["Debt & Coverage", laundroCfoScore.categories.debtCoverage],
                ["Asset Quality", laundroCfoScore.categories.assetQuality],
                ["Profile Completeness", laundroCfoScore.categories.profileCompleteness],
              ] as const
            ).map(([label, cat]) => (
              <DataRow key={label} label={label} value={`${cat.score}/${cat.max}`} />
            ))}
          </View>
        </View>
        <SectionHeader>Industry Benchmarks</SectionHeader>
        {financial.benchmarkRows.map((row) =>
          row.store != null ? (
            <View key={row.metric} style={{ marginBottom: 6 }}>
              <BenchmarkBar
                metric={row.metric}
                store={row.store}
                unit={row.unit}
                median={row.median}
                top25={row.top25}
                bottom25={row.bottom25}
                lowerIsBetter={row.lowerIsBetter}
                width={500}
              />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                <StatusIndicator
                  status={
                    benchmarkStatusColor(row.store, row.top25, row.bottom25, row.lowerIsBetter) ===
                    "#15803d"
                      ? "green"
                      : benchmarkStatusColor(row.store, row.top25, row.bottom25, row.lowerIsBetter) ===
                          "#ef4444"
                        ? "red"
                        : "amber"
                  }
                />
                <Text style={[styles.boxText, { fontSize: 8 }]}>
                  {row.lowerIsBetter
                    ? row.store <= row.top25
                      ? "Top quartile"
                      : row.store <= row.median
                        ? "Above median"
                        : row.store <= row.bottom25
                          ? "Below median"
                          : "Bottom quartile"
                    : row.store >= row.top25
                      ? "Top quartile"
                      : row.store >= row.median
                        ? "Above median"
                        : row.store >= row.bottom25
                          ? "Below median"
                          : "Bottom quartile"}
                </Text>
              </View>
            </View>
          ) : (
            <DataRow key={row.metric} label={row.metric} value="Insufficient data" />
          )
        )}
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 6 — Lease Analysis */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Lease Analysis</Text>
        {m.isOwnerOccupied ? (
          <>
            <Text style={styles.bodyText}>Fee-simple ownership — no third-party lease obligation.</Text>
            <SectionHeader>Real Estate Ownership</SectionHeader>
            <DataRow label="Property Address" value={realEstate?.property_address ?? m.address ?? "—"} />
            <DataRow label="Estimated Value" value={realEstate?.estimated_value ? fmtDollar(realEstate.estimated_value) : "—"} />
            <DataRow label="Loan Balance" value={realEstate?.current_loan_balance != null ? fmtDollar(realEstate.current_loan_balance) : "—"} />
            <DataRow
              label="Building Equity"
              value={
                realEstate?.estimated_value != null && realEstate?.current_loan_balance != null
                  ? fmtDollar(realEstate.estimated_value - realEstate.current_loan_balance)
                  : "—"
              }
              positive
            />
            <View style={styles.successBox}>
              <Text style={[styles.boxText, styles.positiveText]}>
                ✓ Owner-occupied structure eliminates lease rollover risk and adds hard asset collateral.
              </Text>
            </View>
          </>
        ) : lease ? (
          <>
            <Text style={styles.bodyText}>Primary lease terms and site control assessment.</Text>
            <SectionHeader>Lease Terms</SectionHeader>
            <DataRow label="Landlord" value={lease.landlord ?? "—"} />
            <DataRow label="Tenant Entity" value={lease.tenant_entity ?? "—"} />
            <DataRow label="Expires" value={`${m.leaseExpiresStr} (${m.yearsRemaining.toFixed(1)} yrs)`} />
            <DataRow label="Monthly Rent" value={lease.monthly_rent ? fmtDollar(lease.monthly_rent) : "—"} />
            <DataRow label="CAM Charges" value={m.camCharges > 0 ? `${fmtDollar(m.camCharges)}/mo` : "—"} />
            <DataRow label="Annual Occupancy Cost" value={fmtDollar(m.annualOccupancyCost)} />
            <DataRow label="Occupancy Cost Ratio" value={fmtPct(m.occupancyCostRatio)} valueColor={ratioColor(m.occupancyCostRatio, 0, 15, true)} />
            <DataRow label="Rent-to-Revenue" value={fmtPct(m.rentToRevenue)} valueColor={ratioColor(m.rentToRevenue, 0, 15, true)} />
            <DataRow label="Lease Score" value={`${m.leaseScore}/100 — ${scoreLabel(m.leaseScore)}`} valueColor={m.leaseScore >= 75 ? "#15803d" : "#b45309"} />
            <DataRow label="Total Site Control" value={`${m.totalLeaseControl.toFixed(1)} years`} />
            <DataRow label="Exclusivity" value={lease.exclusivity_clause ? "Yes" : "No"} />
            <DataRow label="Assignment Rights" value={lease.assignment_rights ?? "—"} />
            <DataRow label="Personal Guaranty" value={lease.personal_guaranty ? "Yes" : "No"} />
            {m.availableOptions.length > 0 && (
              <>
                <SectionHeader>Renewal Options</SectionHeader>
                {m.availableOptions.map((opt: any) => (
                  <DataRow
                    key={opt.id ?? opt.option_number}
                    label={`Option ${opt.option_number ?? "—"}`}
                    value={`${opt.option_years ?? 0} yrs · ${opt.notice_days ?? 0} day notice`}
                  />
                ))}
              </>
            )}
            <View style={m.yearsRemaining >= 7 ? styles.successBox : m.yearsRemaining >= 3 ? styles.warningBox : styles.dangerBox}>
              <Text style={styles.boxText}>
                {m.yearsRemaining >= 7
                  ? `✓ ${leaseRiskLabel(m.yearsRemaining)} — ${m.totalLeaseControl.toFixed(1)} years site control.`
                  : `⚠ ${leaseRiskLabel(m.yearsRemaining)} — short remaining term is an underwriting concern.`}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.warningBox}>
            <Text style={styles.boxText}>No lease data on file. Add occupancy details in LaundroCFO.</Text>
          </View>
        )}
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 7 — Equipment Analysis */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Equipment Analysis</Text>
        <Text style={styles.bodyText}>Fleet composition and replacement risk for collateral review.</Text>
        <View style={styles.ratioGrid}>
          <RatioMetricTile label="Machines" value={String(m.equipMetrics.totalMachines)} />
          <RatioMetricTile label="Avg Age" value={`${m.equipMetrics.weightedAvgAge.toFixed(1)} yrs`} />
          <RatioMetricTile
            label="Equip Score"
            value={`${m.equipMetrics.qualityScore}/100`}
            valueColor={m.equipMetrics.qualityScore >= 75 ? "#15803d" : "#b45309"}
          />
          <RatioMetricTile label="Grade" value={m.equipMetrics.grade} />
          <RatioMetricTile label="Under 10yr" value={fmtPct(m.equipMetrics.pctUnder10Years, 0)} />
          <RatioMetricTile label="200G" value={fmtPct(m.equipMetrics.pct200GWashers, 0)} />
          <RatioMetricTile label="Replacement" value={fmtDollar(m.equipMetrics.estimatedReplacementValue)} />
          <RatioMetricTile
            label="W/D"
            value={`${m.equipMetrics.totalWashers}/${m.equipMetrics.totalDryers}`}
          />
        </View>
        <SectionHeader>Fleet Detail</SectionHeader>
        {m.equipRecords.length === 0 ? (
          <Text style={styles.bodyText}>No equipment inventory on file.</Text>
        ) : (
          <>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellBold, { width: "18%" }]}>Type</Text>
              <Text style={[styles.tableCellBold, { width: "22%" }]}>Mfr</Text>
              <Text style={[styles.tableCellBold, { width: "14%" }]}>Size</Text>
              <Text style={[styles.tableCellBold, { width: "10%" }]}>Qty</Text>
              <Text style={[styles.tableCellBold, { width: "12%" }]}>Year</Text>
              <Text style={[styles.tableCellBold, { width: "14%" }]}>Cond.</Text>
              <Text style={[styles.tableCellBold, { width: "10%", textAlign: "right" }]}>200G</Text>
            </View>
            {m.equipRecords.map((item) => (
              <View key={item.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: "18%" }]}>{item.machine_type}</Text>
                <Text style={[styles.tableCell, { width: "22%" }]}>{item.manufacturer}</Text>
                <Text style={[styles.tableCell, { width: "14%" }]}>{item.machine_size}</Text>
                <Text style={[styles.tableCell, { width: "10%" }]}>{item.quantity}</Text>
                <Text style={[styles.tableCell, { width: "12%" }]}>{item.installation_year}</Text>
                <Text style={[styles.tableCell, { width: "14%" }]}>{item.condition}</Text>
                <Text style={[styles.tableCell, { width: "10%", textAlign: "right" }]}>
                  {item.high_speed_extract ? "Yes" : "—"}
                </Text>
              </View>
            ))}
          </>
        )}
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 7 — Valuation Analysis */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Valuation Analysis</Text>
        <Text style={styles.bodyText}>EBITDA multiple model with equipment, lease, market, and operations adjustments.</Text>
        <SectionHeader>Multiple Build-Up</SectionHeader>
        <DataRow label="Base Multiple" value={fmtMultiple(m.valuation.baseMultiple)} />
        {m.valuation.adjustments.map((adj) => (
          <DataRow
            key={`${adj.label}-${adj.category}`}
            label={`${adj.label} — ${adj.reason}`}
            value={formatAdj(adj.value)}
            positive={adj.value >= 0}
            negative={adj.value < 0}
          />
        ))}
        <View style={styles.divider} />
        <DataRow label="Final Multiple" value={fmtMultiple(m.valuation.finalMultiple)} valueColor="#1d4ed8" />
        <DataRow label="× Annual EBITDA" value={fmtDollar(m.annualEbitda)} />
        <DataRow label="= Business Value" value={fmtDollar(m.valuation.businessValue)} positive />
        <SectionHeader>Equity Snapshot</SectionHeader>
        <DataRow label="Store Value" value={fmtDollar(m.equitySnapshot.storeValue)} />
        <DataRow label="Total Debt" value={fmtDollar(m.equitySnapshot.debt)} />
        <DataRow label="Equity (Value − Debt)" value={fmtDollar(m.equitySnapshot.equity)} positive={m.equitySnapshot.equity >= 0} />
        <DataRow label="Monthly EBITDA" value={fmtDollar(m.monthlyEbitda)} />
        <DataRow label="Monthly Debt Service" value={fmtDollar(financial.totalMonthlyDebtService)} />
        <DataRow label="Surplus Cash Flow" value={fmtDollar(m.surplusCashFlow)} positive={m.surplusCashFlow >= 0} negative={m.surplusCashFlow < 0} />
        {m.isOwnerOccupied && m.valuation.realEstateValue > 0 && (
          <>
            <DataRow label="Real Estate Value" value={fmtDollar(m.valuation.realEstateValue)} />
            <DataRow label="Combined Value" value={fmtDollar(m.valuation.combinedValue)} positive />
          </>
        )}
        <SectionHeader>Improvement Opportunities</SectionHeader>
        {m.valuation.improvements.length === 0 ? (
          <Text style={styles.bodyText}>Store is well-optimized across key value factors.</Text>
        ) : (
          m.valuation.improvements.map((item) => (
            <View key={item.action} style={styles.successBox}>
              <Text style={[styles.boxText, { fontWeight: "bold", color: "#1e293b" }]}>{item.action}</Text>
              <Text style={[styles.boxText, styles.positiveText]}>+{fmtDollar(item.estimatedGain)} estimated gain</Text>
            </View>
          ))
        )}
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 8 — Risk Assessment */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Risk Assessment</Text>
        <SectionHeader>Value Drivers</SectionHeader>
        {m.valuation.valueDrivers.length === 0 ? (
          <Text style={styles.bodyText}>No major value drivers identified.</Text>
        ) : (
          m.valuation.valueDrivers.map((driver) => (
            <View key={driver} style={styles.successBox}>
              <Text style={[styles.boxText, styles.positiveText]}>✓ {driver}</Text>
            </View>
          ))
        )}
        <SectionHeader>Value Risks</SectionHeader>
        {m.valuation.valueRisks.length === 0 ? (
          <Text style={styles.bodyText}>No significant risks flagged.</Text>
        ) : (
          m.valuation.valueRisks.map((risk) => (
            <View key={risk} style={styles.warningBox}>
              <Text style={styles.boxText}>⚠ {risk}</Text>
            </View>
          ))
        )}
        <SectionHeader>Underwriting Risk Matrix</SectionHeader>
        <DataRow label="DSCR Risk" value={m.dscr >= 1.25 || m.annualDebtService === 0 ? "Low" : "High"} valueColor={m.dscr >= 1.25 || m.annualDebtService === 0 ? "#15803d" : "#b91c1c"} />
        <DataRow label="Lease / Site Control" value={m.totalLeaseControl >= 7 ? "Low" : m.totalLeaseControl >= 3 ? "Moderate" : "High"} />
        <DataRow label="Equipment Age Risk" value={m.equipMetrics.weightedAvgAge < 10 ? "Low" : "Moderate"} />
        <DataRow label="Utility Cost Risk" value={m.utilityRatio > 20 ? "High" : m.utilityRatio > 17 ? "Moderate" : "Low"} />
        <DataRow label="Margin Risk" value={m.ebitdaMargin >= 22 ? "Low" : m.ebitdaMargin >= 18 ? "Moderate" : "High"} />
        <SectionHeader>Underwriter Recommendation</SectionHeader>
        <Text style={styles.bodyText}>
          {m.financeRating === "Strong"
            ? "Recommend proceeding with standard SBA 7(a) or conventional commercial loan structure. Store demonstrates lender-ready metrics across DSCR, site control, and operating performance."
            : m.financeRating === "Acceptable"
              ? "Store meets minimum underwriting thresholds. Recommend conventional financing with standard covenants and utility cost monitoring."
              : "Additional due diligence recommended. Address flagged risks before lender submission."}
        </Text>
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 9 — Insurance Summary */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Insurance Summary</Text>
        <Text style={styles.bodyText}>Active coverage relevant to lender collateral requirements.</Text>
        {(!insurance || insurance.length === 0) ? (
          <View style={styles.warningBox}>
            <Text style={styles.boxText}>
              No active policies on file. Lenders require property, liability, and business interruption coverage.
            </Text>
          </View>
        ) : (
          <>
            <DataRow label="Total Annual Premium" value={fmtDollar(m.totalInsurancePremium)} />
            <DataRow label="Active Policies" value={String(insurance.length)} />
            {insurance.map((policy: any) => (
              <View key={policy.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 4, marginTop: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "bold", color: "#1e293b" }}>
                    {policy.policy_type ?? "Policy"}
                  </Text>
                  <Text style={styles.badge}>{policy.carrier ?? "N/A"}</Text>
                </View>
                <DataRow label="Policy #" value={policy.policy_number ?? "—"} />
                <DataRow label="Premium" value={fmtDollar(policy.annual_premium ?? (policy.monthly_premium ?? 0) * 12)} />
                {policy.building_coverage != null && <DataRow label="Building" value={fmtDollar(policy.building_coverage)} />}
                {policy.liability_per_occurrence != null && <DataRow label="Liability" value={fmtDollar(policy.liability_per_occurrence)} />}
                {policy.equipment_coverage != null && <DataRow label="Equipment" value={fmtDollar(policy.equipment_coverage)} />}
                {policy.business_interruption && <DataRow label="Business Interruption" value={policy.business_interruption_amount ? fmtDollar(policy.business_interruption_amount) : "Included"} />}
              </View>
            ))}
          </>
        )}
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 10 — Portfolio Summary */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Portfolio Summary</Text>
        {portfolioStores.length <= 1 ? (
          <Text style={styles.bodyText}>
            Single-store portfolio. Global DSCR equals store-level DSCR.
          </Text>
        ) : (
          <>
            <Text style={styles.bodyText}>
              {portfolioStores.length}-store portfolio — global DSCR reflects combined cash flow coverage.
            </Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellBold, { width: "30%" }]}>Store</Text>
              <Text style={[styles.tableCellBold, { width: "22%" }]}>EBITDA</Text>
              <Text style={[styles.tableCellBold, { width: "18%" }]}>DSCR</Text>
              <Text style={[styles.tableCellBold, { width: "30%", textAlign: "right" }]}>Est. Value</Text>
            </View>
            {portfolioStores.map((ps: any) => {
              const psEbitda =
                ps.id === store?.id
                  ? m.annualEbitda
                  : ((ps.monthly_revenue ?? 0) - (ps.monthly_expenses ?? 0)) * 12;
              const psDscr = (ps.annual_debt_service ?? 0) > 0 ? psEbitda / ps.annual_debt_service : 0;
              return (
                <View key={ps.id} style={styles.tableRow}>
                  <Text style={[styles.tableCellBold, { width: "30%" }]}>
                    {ps.name ?? "Store"}{ps.id === store?.id ? " *" : ""}
                  </Text>
                  <Text style={[styles.tableCell, { width: "22%" }]}>{fmtDollar(psEbitda)}</Text>
                  <Text style={[styles.tableCell, { width: "18%" }]}>
                    {(ps.annual_debt_service ?? 0) > 0 ? fmtMultiple(psDscr) : "—"}
                  </Text>
                  <Text style={[styles.tableCell, { width: "30%", textAlign: "right" }]}>
                    {fmtDollar(psEbitda * m.valuation.finalMultiple)}
                  </Text>
                </View>
              );
            })}
          </>
        )}
        <DataRow label="Portfolio EBITDA" value={fmtDollar(m.portfolioEbitda)} />
        <DataRow label="Portfolio Debt Service" value={m.portfolioDebtService > 0 ? fmtDollar(m.portfolioDebtService) : "—"} />
        <DataRow label="Global DSCR" value={m.portfolioDebtService > 0 ? fmtMultiple(m.globalDscr) : "N/A"} valueColor={ratioColor(m.globalDscr, 1.5, 1.25)} />
        <DataRow label="Combined Est. Value" value={fmtDollar(portfolioStores.reduce((s, ps) => s + (((ps.monthly_revenue ?? 0) - (ps.monthly_expenses ?? 0)) * 12) * m.valuation.finalMultiple, 0))} positive />
        <PageChrome storeName={m.storeName} />
      </Page>

      {/* 11 — Appendix */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Appendix</Text>
        <SectionHeader>Valuation Methodology</SectionHeader>
        <Text style={styles.bodyText}>
          Business value is estimated using an EBITDA multiple model. A base multiple of 4.0x is adjusted for equipment age and quality, lease term and site control, market density, store condition, revenue trend, competition, service mix diversification, and recent retool investment. Final multiples are constrained between 2.5x and 6.5x. Real estate value is added separately for owner-occupied properties.
        </Text>
        <SectionHeader>Data Sources</SectionHeader>
        <Text style={styles.bodyText}>
          Financial data: monthly_financials P&L records and monthly_utilities breakdown from LaundroCFO, with TTM aggregation where available. Debt: active store_loans records. Lease data: Occupancy module. Equipment: equipment inventory records. Insurance: active policy records. All figures should be independently verified during lender due diligence.
        </Text>
        <SectionHeader>Glossary</SectionHeader>
        <DataRow label="EBITDA" value="Earnings before interest, taxes, depreciation, and amortization" />
        <DataRow label="DSCR" value="Debt Service Coverage Ratio — EBITDA ÷ annual debt service" />
        <DataRow label="Global DSCR" value="Portfolio-wide EBITDA ÷ total debt service" />
        <DataRow label="Occupancy Cost" value="Rent + CAM as % of revenue" />
        <DataRow label="Debt Yield" value="EBITDA ÷ outstanding loan balance" />
        <SectionHeader>Disclaimer</SectionHeader>
        <Text style={[styles.bodyText, { fontSize: 8, color: "#94a3b8" }]}>
          This report is generated by LaundroCFO based on owner-reported data. It supports lender due diligence but does not constitute an appraisal, legal opinion, or lending commitment. LaundroCFO makes no warranties as to accuracy or completeness. All figures must be independently verified prior to any credit decision. Report generated {generatedDate}.
        </Text>
        <PageChrome storeName={m.storeName} />
      </Page>
    </Document>
  );
}

export default ReportDocument;
