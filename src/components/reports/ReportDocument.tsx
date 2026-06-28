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
import type { PortfolioTtmSummary, TtmMetrics } from "@/lib/financials";
import type { ValuationResult } from "@/lib/valuation";

export interface ReportProps {
  store: any;
  lease: any;
  leaseOptions: any[];
  equipment: any[];
  insurance: any[];
  realEstate: any;
  valuation: ValuationResult;
  portfolioStores: any[];
  storeTtm: TtmMetrics | null;
  portfolioTtm: PortfolioTtmSummary;
  generatedDate: string;
  executiveSummary: string;
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F8FAFC", padding: 40, fontFamily: "Helvetica" },
  coverPage: { backgroundColor: "#1a2b3c", padding: 50, height: "100%" },
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
    backgroundColor: "#1a2b3c",
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
  pageNumber: { position: "absolute", bottom: 30, right: 40, fontSize: 9, color: "#94a3b8" },
  footer: { position: "absolute", bottom: 30, left: 40, fontSize: 9, color: "#94a3b8" },
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
  boxText: { fontSize: 9, color: "#475569", lineHeight: 1.5 },
  tocItem: { fontSize: 11, color: "#475569", marginBottom: 6, flexDirection: "row", justifyContent: "space-between" },
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

function computeReportMetrics(props: ReportProps) {
  const { store, lease, leaseOptions, equipment, valuation, portfolioStores, storeTtm, portfolioTtm } =
    props;
  const storeName = store?.name ?? "Store";
  const address = store?.address ?? "";
  const sqft = store?.square_footage ?? 3500;
  const fallbackMonthlyRevenue = store?.monthly_revenue ?? 0;
  const fallbackMonthlyExpenses = store?.monthly_expenses ?? 0;
  const hasTtm = (storeTtm?.monthsUsed ?? 0) > 0;
  const monthlyRevenue = hasTtm
    ? storeTtm!.ttmRevenue / storeTtm!.monthsUsed
    : fallbackMonthlyRevenue;
  const monthlyExpenses = hasTtm
    ? (storeTtm!.ttmRevenue - storeTtm!.ttmEbitda) / storeTtm!.monthsUsed
    : fallbackMonthlyExpenses;
  const monthlyEbitda = hasTtm
    ? storeTtm!.ttmEbitda / storeTtm!.monthsUsed
    : monthlyRevenue - monthlyExpenses;
  const annualRevenue = hasTtm ? storeTtm!.ttmRevenue : monthlyRevenue * 12;
  const annualEbitda = hasTtm ? storeTtm!.ttmEbitda : monthlyEbitda * 12;
  const annualOperatingExpenses = hasTtm ? annualRevenue - annualEbitda : monthlyExpenses * 12;
  const ttmDebtService = storeTtm?.ttmDebtService ?? 0;
  const monthlyUtilities = store?.monthly_utilities ?? 0;
  const loanBalance = store?.loan_balance ?? 0;
  const isOwnerOccupied = store?.occupancy_type === "owner_occupied";

  const dscr = ttmDebtService > 0 ? (storeTtm?.dscr ?? 0) : 0;
  const portfolioEbitda = portfolioTtm.ttmEbitda;
  const portfolioDebtService = portfolioTtm.ttmDebtService;
  const globalDscr =
    portfolioDebtService > 0 ? calcGlobalDSCR(portfolioEbitda, portfolioDebtService) : dscr;

  const ebitdaMargin = hasTtm
    ? storeTtm!.ttmEbitdaMargin
    : calcEbitdaMargin(annualEbitda, annualRevenue);
  const revenuePerSF = calcRevenuePerSF(annualRevenue, sqft);
  const ebitdaPerSF = calcEbitdaPerSF(annualEbitda, sqft);
  const utilityRatio = calcUtilityRatio(monthlyUtilities * 12, annualRevenue);
  const debtYield = loanBalance > 0 ? calcDebtYield(annualEbitda, loanBalance) : 0;

  const equipRecords = (equipment ?? []) as EquipmentRecord[];
  const equipMetrics = computeEquipmentMetrics(equipRecords);

  const yearsRemaining = lease ? calcYearsRemaining(lease.lease_end_date) : 0;
  const availableOptions = (leaseOptions ?? []).filter((o) => o.status === "Available");
  const optionYears = availableOptions.reduce((s, o) => s + (o.option_years ?? 0), 0);
  const totalLeaseControl = isOwnerOccupied ? 15 : yearsRemaining + optionYears;

  const monthlyRent = lease?.monthly_rent ?? props.realEstate?.monthly_rent_charged ?? 0;
  const camCharges = lease?.cam_charges ?? 0;
  const annualOccupancyCost = (monthlyRent + camCharges) * 12;
  const rentToRevenue = calcRentToRevenue(monthlyRent * 12, annualRevenue);
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
    annualOperatingExpenses,
    ttmDebtService,
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
  };
}

export function ReportDocument(props: ReportProps) {
  const m = computeReportMetrics(props);
  const { executiveSummary, generatedDate, lease, realEstate, insurance, portfolioStores, store, portfolioTtm } =
    props;

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
          value={m.ttmDebtService > 0 ? fmtMultiple(m.dscr) : "N/A"}
          valueColor={m.ttmDebtService > 0 ? ratioColor(m.dscr, 1.5, 1.25) : undefined}
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
        ) : m.ttmDebtService > 0 ? (
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
        <SectionHeader>Service Mix</SectionHeader>
        <DataRow label="Self Service" value={fmtPct(store?.self_service_pct ?? 70, 0)} />
        <DataRow label="Wash-Dry-Fold" value={fmtPct(store?.wdf_pct ?? 0, 0)} />
        <DataRow label="Commercial" value={fmtPct(store?.commercial_pct ?? 0, 0)} />
        <DataRow label="Pickup & Delivery" value={fmtPct(store?.pickup_delivery_pct ?? 0, 0)} />
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
        <Text style={styles.bodyText}>Trailing twelve-month financial profile from monthly P&L data.</Text>
        <SectionHeader>Income Statement</SectionHeader>
        <DataRow label="Annual Revenue" value={fmtDollar(m.annualRevenue)} />
        <DataRow label="Annual Operating Expenses" value={fmtDollar(m.annualOperatingExpenses)} />
        <DataRow label="Annual EBITDA" value={fmtDollar(m.annualEbitda)} positive />
        <DataRow label="EBITDA Margin" value={fmtPct(m.ebitdaMargin)} valueColor={ratioColor(m.ebitdaMargin, 25, 20)} />
        <DataRow label="Monthly Revenue (avg)" value={fmtDollar(m.monthlyRevenue)} />
        <DataRow label="Monthly EBITDA (avg)" value={fmtDollar(m.monthlyEbitda)} />
        <DataRow label="TTM Debt Service" value={m.ttmDebtService > 0 ? fmtDollar(m.ttmDebtService) : "Not reported"} />
        <DataRow label="Loan Balance" value={m.loanBalance > 0 ? fmtDollar(m.loanBalance) : "Not reported"} />
        <SectionHeader>Underwriting Ratios</SectionHeader>
        <View style={styles.grid2}>
          <MetricTile label="DSCR" value={m.ttmDebtService > 0 ? fmtMultiple(m.dscr) : "N/A"} valueColor={m.ttmDebtService > 0 ? ratioColor(m.dscr, 1.5, 1.25) : undefined} width="23%" />
          <MetricTile label="Global DSCR" value={m.portfolioDebtService > 0 ? fmtMultiple(m.globalDscr) : "N/A"} valueColor={m.portfolioDebtService > 0 ? ratioColor(m.globalDscr, 1.5, 1.25) : undefined} width="23%" />
          <MetricTile label="EBITDA Margin" value={fmtPct(m.ebitdaMargin)} valueColor={ratioColor(m.ebitdaMargin, 25, 20)} width="23%" />
          <MetricTile label="Rent / Revenue" value={fmtPct(m.rentToRevenue)} valueColor={ratioColor(m.rentToRevenue, 0, 15, true)} width="23%" />
          <MetricTile label="Utility / Revenue" value={fmtPct(m.utilityRatio)} valueColor={ratioColor(m.utilityRatio, 0, 17, true)} width="23%" />
          <MetricTile label="Revenue / SF" value={`$${m.revenuePerSF.toFixed(2)}`} width="23%" />
          <MetricTile label="EBITDA / SF" value={`$${m.ebitdaPerSF.toFixed(2)}`} width="23%" />
          <MetricTile label="Debt Yield" value={m.loanBalance > 0 ? fmtPct(m.debtYield) : "N/A"} valueColor={m.loanBalance > 0 ? ratioColor(m.debtYield, 12, 8) : undefined} width="23%" />
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

      {/* 5 — Lease Analysis */}
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
            <DataRow label="Landlord" value={lease.landlord_name ?? "—"} />
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

      {/* 6 — Equipment Analysis */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Equipment Analysis</Text>
        <Text style={styles.bodyText}>Fleet composition and replacement risk for collateral review.</Text>
        <View style={styles.grid2}>
          <MetricTile label="Total Machines" value={String(m.equipMetrics.totalMachines)} width="23%" />
          <MetricTile label="Avg Age" value={`${m.equipMetrics.weightedAvgAge.toFixed(1)} yrs`} width="23%" />
          <MetricTile label="Equipment Score" value={`${m.equipMetrics.qualityScore}/100`} valueColor={m.equipMetrics.qualityScore >= 75 ? "#15803d" : "#b45309"} width="23%" />
          <MetricTile label="Quality Grade" value={m.equipMetrics.grade} width="23%" />
          <MetricTile label="Under 10yr" value={fmtPct(m.equipMetrics.pctUnder10Years, 0)} width="23%" />
          <MetricTile label="200G Washers" value={fmtPct(m.equipMetrics.pct200GWashers, 0)} width="23%" />
          <MetricTile label="Replacement Est." value={fmtDollar(m.equipMetrics.estimatedReplacementValue)} width="48%" />
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
        <DataRow label="DSCR Risk" value={m.dscr >= 1.25 || m.ttmDebtService === 0 ? "Low" : "High"} valueColor={m.dscr >= 1.25 || m.ttmDebtService === 0 ? "#15803d" : "#b91c1c"} />
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
              const psTtm = portfolioTtm.byStoreId[ps.id];
              const psEbitda = psTtm?.ttmEbitda ?? 0;
              const psDebtService = psTtm?.ttmDebtService ?? 0;
              const psDscr = psDebtService > 0 ? (psTtm?.dscr ?? 0) : 0;
              return (
                <View key={ps.id} style={styles.tableRow}>
                  <Text style={[styles.tableCellBold, { width: "30%" }]}>
                    {ps.name ?? "Store"}{ps.id === store?.id ? " *" : ""}
                  </Text>
                  <Text style={[styles.tableCell, { width: "22%" }]}>{fmtDollar(psEbitda)}</Text>
                  <Text style={[styles.tableCell, { width: "18%" }]}>
                    {psDebtService > 0 ? fmtMultiple(psDscr) : "—"}
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
        <DataRow label="Combined Est. Value" value={fmtDollar(portfolioStores.reduce((s, ps) => s + (portfolioTtm.byStoreId[ps.id]?.ttmEbitda ?? 0) * m.valuation.finalMultiple, 0))} positive />
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
          Financial data: trailing twelve-month P&L from monthly_financials (revenue, operating expenses, and debt service). Lease data: Occupancy module. Equipment: equipment inventory records. Insurance: active policy records. All figures should be independently verified during lender due diligence.
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
