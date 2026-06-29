"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { pdf } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { getStoreValuation } from "@/lib/getStoreValuation";
import type { ValuationResult } from "@/lib/valuation";
import { computeEquipmentMetrics, type EquipmentRecord } from "@/lib/equipment";
import {
  calcGlobalDSCR,
  calcDebtYield,
  calcEbitdaMargin,
  calcOccupancyCostRatio,
  calcRentToRevenue,
  calcRevenuePerSF,
  calcEbitdaPerSF,
  calcUtilityRatio,
  calcLeaseScore,
  fmtDollar,
  fmtMultiple,
  fmtPct,
} from "@/lib/calculations";
import { ReportDocument, type ReportProps } from "@/components/reports/ReportDocument";
import {
  PortfolioReportDocument,
} from "@/components/reports/PortfolioReportDocument";
import { generateExecutiveSummary } from "@/components/reports/generateExecutiveSummary";
import { getPortfolioReport, type PortfolioReportData } from "@/lib/getPortfolioReport";
import {
  buildPortfolioTtmCashFlow,
  buildPortfolioTtmSummary,
  EMPTY_PORTFOLIO_TTM_CASH_FLOW,
  EMPTY_TTM_METRICS,
  fetchAnnualDebtServiceByStore,
  fetchMonthlyFinancialsForStores,
  type PortfolioTtmCashFlow,
  type PortfolioTtmSummary,
  type TtmMetrics,
} from "@/lib/financials";
import { KpiCard } from "@/components/ui/KpiCard";
import { MetricTooltip } from "@/components/ui/MetricTooltip";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearsRemaining(endDate: string | null): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  return Math.max(0, (end.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000));
}

function financeabilityRating(dscr: number | null, globalDscr: number | null): string {
  if (dscr == null || globalDscr == null) return "—";
  if (dscr >= 1.5 && globalDscr >= 1.5) return "Strong";
  if (dscr >= 1.25 && globalDscr >= 1.25) return "Acceptable";
  if (dscr >= 1.0) return "Marginal";
  return "Weak";
}

function ratioColorClass(value: number, good: number, warn: number, invert = false): string {
  if (invert) {
    if (value <= good) return "text-green-400";
    if (value <= warn) return "text-amber-400";
    return "text-red-400";
  }
  if (value >= good) return "text-green-400";
  if (value >= warn) return "text-amber-400";
  return "text-red-400";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Poor";
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold text-gray-700 dark:text-slate-500 uppercase tracking-widest mb-3 pb-2.5 border-b border-white/[0.06]">
      {children}
    </div>
  );
}

function PreviewRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-gray-700 dark:text-gray-300">{label}</span>
      <span className={clsx("font-semibold", className ?? "text-gray-900 dark:text-white")}>{value}</span>
    </div>
  );
}

type ReportMode = "store" | "portfolio";

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

function formatLeaseExpiration(lease: any, isOwnerOccupied: boolean): string {
  if (isOwnerOccupied) return "Owner-Occ.";
  if (!lease?.lease_end_date) return "—";
  const d = parseDate(lease.lease_end_date);
  return d ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";
}

export default function ReportsPage() {
  const supabase = createClient();
  const { stores, selectedStore, loading: storesLoading } = useStores();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [store, setStore] = useState<any>(null);
  const [lease, setLease] = useState<any>(null);
  const [leaseOptions, setLeaseOptions] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [insurance, setInsurance] = useState<any[]>([]);
  const [realEstate, setRealEstate] = useState<any>(null);
  const [totalLeaseControl, setTotalLeaseControl] = useState(0);
  const [valuation, setValuation] = useState<ValuationResult | null>(null);
  const [storeTtm, setStoreTtm] = useState<TtmMetrics | null>(null);
  const [portfolioTtm, setPortfolioTtm] = useState<PortfolioTtmSummary | null>(null);
  const [portfolioCashFlow, setPortfolioCashFlow] = useState<PortfolioTtmCashFlow | null>(null);

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareExpires, setShareExpires] = useState("");
  const [copied, setCopied] = useState(false);
  const [reportMode, setReportMode] = useState<ReportMode>("store");
  const [portfolioData, setPortfolioData] = useState<PortfolioReportData | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (storesLoading) return;

      if (!selectedStore?.id) {
        setStoreTtm(null);
        setPortfolioTtm(null);
        setPortfolioCashFlow(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email ?? null);
      }

      const { data: storeData } = await supabase
        .from("stores")
        .select("*")
        .eq("id", selectedStore.id)
        .single();

      if (!storeData) {
        setLoading(false);
        return;
      }

      setStore(storeData);

      const storeValuation = await getStoreValuation(storeData.id);
      setValuation(storeValuation);

      const storeIds = stores.length > 0 ? stores.map((s) => s.id) : [storeData.id];

      const [{ data: equipmentData }, { data: policiesData }, financialsData, annualDebtByStore] =
        await Promise.all([
          supabase.from("equipment_inventory").select("*").eq("store_id", storeData.id),
          supabase
            .from("insurance_policies")
            .select("*")
            .eq("store_id", storeData.id)
            .eq("is_active", true),
          fetchMonthlyFinancialsForStores(supabase, storeIds),
          fetchAnnualDebtServiceByStore(supabase, storeIds),
        ]);

      setEquipment((equipmentData ?? []) as EquipmentRecord[]);
      setInsurance(policiesData ?? []);

      const portfolioSummary = buildPortfolioTtmSummary(financialsData, storeIds, annualDebtByStore);
      setStoreTtm(portfolioSummary.byStoreId[storeData.id] ?? EMPTY_TTM_METRICS);
      setPortfolioTtm(portfolioSummary);
      setPortfolioCashFlow(buildPortfolioTtmCashFlow(financialsData, storeIds, annualDebtByStore));

      const ownerOccupied = storeData.occupancy_type === "owner_occupied";

      if (ownerOccupied) {
        const { data: reData } = await supabase
          .from("real_estate")
          .select("*")
          .eq("store_id", storeData.id)
          .limit(1)
          .maybeSingle();
        setRealEstate(reData);
        setLease(null);
        setLeaseOptions([]);
        setTotalLeaseControl(15);
      } else {
        setRealEstate(null);
        const { data: leaseData } = await supabase
          .from("leases")
          .select("*")
          .eq("store_id", storeData.id)
          .limit(1)
          .maybeSingle();

        if (leaseData) {
          setLease(leaseData);
          const remaining = calcYearsRemaining(leaseData.lease_end_date);
          const { data: optionsData } = await supabase
            .from("lease_options")
            .select("*")
            .eq("lease_id", leaseData.id)
            .order("option_number", { ascending: true });
          setLeaseOptions(optionsData ?? []);
          const optionYears = (optionsData ?? [])
            .filter((o) => o.status === "Available")
            .reduce((s, o) => s + (o.option_years ?? 0), 0);
          setTotalLeaseControl(remaining + optionYears);
        } else {
          setLease(null);
          setLeaseOptions([]);
          setTotalLeaseControl(0);
        }
      }

      setLoading(false);
    }

    load();
  }, [selectedStore?.id, stores, storesLoading, supabase]);

  useEffect(() => {
    async function loadPortfolio() {
      if (reportMode !== "portfolio" || !userId) return;

      setPortfolioLoading(true);
      setError("");
      try {
        const { data: userStores } = await supabase
          .from("stores")
          .select("id")
          .eq("user_id", userId)
          .eq("archived", false);

        const storeIds = (userStores ?? []).map((s) => s.id);
        const [financialsData, annualDebtByStore] = await Promise.all([
          fetchMonthlyFinancialsForStores(supabase, storeIds),
          fetchAnnualDebtServiceByStore(supabase, storeIds),
        ]);
        const cashFlow = buildPortfolioTtmCashFlow(financialsData, storeIds, annualDebtByStore);
        setPortfolioCashFlow(cashFlow);
        const data = await getPortfolioReport(userId, { financialsData, annualDebtByStore });
        setPortfolioData({ ...data, cashFlow });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load portfolio report");
        setPortfolioData(null);
      } finally {
        setPortfolioLoading(false);
      }
    }

    loadPortfolio();
  }, [reportMode, userId, supabase]);

  useEffect(() => {
    if (reportMode !== "store") return;
    async function ensureUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email ?? null);
      }
    }
    ensureUser();
  }, [reportMode, supabase]);

  const equipMetrics = useMemo(() => computeEquipmentMetrics(equipment), [equipment]);

  const generatedDate = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  const executiveSummary = useMemo(() => {
    if (!store || !valuation) return "";
    return generateExecutiveSummary({ store, lease, leaseOptions, equipment, valuation, storeTtm });
  }, [store, lease, leaseOptions, equipment, valuation, storeTtm]);

  const metrics = useMemo(() => {
    if (!store || !valuation) return null;

    const monthlyRevenue = store.monthly_revenue ?? 0;
    const monthlyExpenses = store.monthly_expenses ?? 0;
    const monthlyEbitda = monthlyRevenue - monthlyExpenses;
    const annualRevenue =
      storeTtm && storeTtm.monthsUsed > 0 ? storeTtm.ttmRevenue : monthlyRevenue * 12;
    const annualEbitda =
      storeTtm && storeTtm.monthsUsed > 0 ? storeTtm.ttmEbitda : monthlyEbitda * 12;
    const ttmDebtService = storeTtm?.ttmDebtService ?? 0;
    const monthlyUtilities = store.monthly_utilities ?? 0;
    const loanBalance = store.loan_balance ?? 0;
    const sqft = store.square_footage ?? 3500;
    const isOwnerOccupied = store.occupancy_type === "owner_occupied";

    const dscr = ttmDebtService > 0 ? (storeTtm?.dscr ?? null) : null;
    const portfolioTtmEbitda = portfolioTtm?.ttmEbitda ?? 0;
    const portfolioTtmDebtService = portfolioTtm?.ttmDebtService ?? 0;
    const globalDscr =
      portfolioTtmDebtService > 0
        ? calcGlobalDSCR(portfolioTtmEbitda, portfolioTtmDebtService)
        : null;

    const hasTtm = storeTtm != null && storeTtm.monthsUsed > 0;
    const ebitdaMargin =
      annualRevenue > 0
        ? hasTtm
          ? storeTtm.ttmEbitdaMargin
          : calcEbitdaMargin(annualEbitda, annualRevenue)
        : 0;
    const utilityRatio = calcUtilityRatio(monthlyUtilities * 12, annualRevenue);
    const rentToRevenue = calcRentToRevenue((lease?.monthly_rent ?? 0) * 12, annualRevenue);
    const revenuePerSF = calcRevenuePerSF(annualRevenue, sqft);
    const ebitdaPerSF = calcEbitdaPerSF(annualEbitda, sqft);
    const debtYield = loanBalance > 0 ? calcDebtYield(annualEbitda, loanBalance) : 0;

    const yearsRemaining = lease ? calcYearsRemaining(lease.lease_end_date) : 0;
    const availableOptions = leaseOptions.filter((o) => o.status === "Available");
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

    const camCharges = lease?.cam_charges ?? 0;
    const monthlyRent = lease?.monthly_rent ?? 0;
    const occupancyCostRatio = calcOccupancyCostRatio((monthlyRent + camCharges) * 12, annualRevenue);

    const leaseExpires = parseDate(lease?.lease_end_date);
    const leaseExpiresStr = leaseExpires
      ? leaseExpires.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : "—";

    return {
      annualEbitda,
      annualRevenue,
      dscr,
      globalDscr,
      ttmDebtService,
      portfolioTtmDebtService,
      ebitdaMargin,
      utilityRatio,
      rentToRevenue,
      revenuePerSF,
      ebitdaPerSF,
      debtYield,
      leaseScore,
      totalLeaseControl,
      yearsRemaining,
      leaseExpiresStr,
      availableOptions,
      monthlyRent,
      camCharges,
      occupancyCostRatio,
      financeRating: financeabilityRating(dscr, globalDscr),
      isOwnerOccupied,
    };
  }, [store, valuation, stores, lease, leaseOptions, totalLeaseControl, storeTtm, portfolioTtm]);

  const reportProps: ReportProps | null = useMemo(() => {
    if (!store || !valuation || !portfolioTtm) return null;
    return {
      store,
      lease,
      leaseOptions,
      equipment,
      insurance,
      realEstate,
      valuation,
      portfolioStores: stores,
      storeTtm,
      portfolioTtm,
      portfolioCashFlow: portfolioCashFlow ?? EMPTY_PORTFOLIO_TTM_CASH_FLOW,
      generatedDate,
      executiveSummary,
    };
  }, [
    store,
    lease,
    leaseOptions,
    equipment,
    insurance,
    realEstate,
    valuation,
    stores,
    storeTtm,
    portfolioTtm,
    portfolioCashFlow,
    generatedDate,
    executiveSummary,
  ]);

  const buildPdfBlob = useCallback(async () => {
    if (reportMode === "portfolio") {
      if (!portfolioData) throw new Error("Portfolio report data not ready");
      return pdf(
        <PortfolioReportDocument
          data={portfolioData}
          generatedDate={generatedDate}
          userEmail={userEmail}
        />
      ).toBlob();
    }
    if (!reportProps) throw new Error("Report data not ready");
    return pdf(<ReportDocument {...reportProps} />).toBlob();
  }, [reportMode, portfolioData, generatedDate, userEmail, reportProps]);

  async function handleGeneratePdf() {
    if (reportMode === "portfolio") {
      if (!portfolioData) return;
    } else if (!reportProps || !store) {
      return;
    }

    setGeneratingPdf(true);
    setError("");
    try {
      const blob = await buildPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        reportMode === "portfolio"
          ? "portfolio-underwriting-report.pdf"
          : `${(store!.name ?? "store").replace(/\s+/g, "-").toLowerCase()}-underwriting-report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleShareWithLender() {
    if (!userId) {
      setError("You must be signed in to share reports.");
      return;
    }
    if (reportMode === "portfolio" && !portfolioData) return;
    if (reportMode === "store" && (!reportProps || !store)) return;

    setSharing(true);
    setError("");

    try {
      const blob = await buildPdfBlob();
      const timestamp = Date.now();
      const filePath =
        reportMode === "portfolio"
          ? `${userId}/portfolio/report-${timestamp}.pdf`
          : `${userId}/${store!.id}/report-${timestamp}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("reports")
        .upload(filePath, blob, { contentType: "application/pdf", upsert: false });

      if (uploadError) throw uploadError;

      const sevenDays = 60 * 60 * 24 * 7;
      const { data: signedData, error: signError } = await supabase.storage
        .from("reports")
        .createSignedUrl(filePath, sevenDays);

      if (signError || !signedData?.signedUrl) {
        throw signError ?? new Error("Failed to create signed URL");
      }

      const expiresAt = new Date(Date.now() + sevenDays * 1000).toISOString();

      const { error: insertError } = await supabase.from("shared_reports").insert({
        user_id: userId,
        store_id: reportMode === "portfolio" ? null : store!.id,
        file_path: filePath,
        signed_url: signedData.signedUrl,
        expires_at: expiresAt,
      });

      if (insertError) throw insertError;

      setShareUrl(signedData.signedUrl);
      setShareExpires(
        new Date(expiresAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      );
      setShareModalOpen(true);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share report");
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy link to clipboard");
    }
  }

  const storeName = store?.name ?? "Your Store";
  const isStoreReady = Boolean(store && valuation && metrics && portfolioTtm);
  const portfolioReady = Boolean(portfolioData && portfolioData.totals.storeCount > 0);
  const totals = portfolioData?.totals;
  const cashFlow = portfolioCashFlow ?? portfolioData?.cashFlow;
  const storeDetails = portfolioData?.storeDetails ?? [];

  const pdfDisabled =
    generatingPdf ||
    sharing ||
    (reportMode === "portfolio" ? !portfolioReady : !isStoreReady);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex gap-1 p-1 rounded-full w-fit" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
        {(["store", "portfolio"] as ReportMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setReportMode(mode)}
            className={clsx(
              "px-4 py-1.5 rounded-full text-[12px] font-medium transition-colors",
              reportMode === mode ? "text-white" : "text-gray-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
            style={reportMode === mode ? { background: "var(--accent)" } : undefined}
          >
            {mode === "store" ? "Store Report" : "Portfolio Report"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">
            {reportMode === "portfolio" ? "Portfolio Underwriting Report" : "Underwriting Report"}
          </h1>
          <p className="text-gray-700 dark:text-slate-500 text-[12px] mt-0.5">
            {reportMode === "portfolio"
              ? `${totals?.storeCount ?? stores.length} store${(totals?.storeCount ?? stores.length) !== 1 ? "s" : ""} — ${generatedDate}`
              : `${storeName} — ${generatedDate}`}
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            className="btn-outline"
            onClick={handleGeneratePdf}
            disabled={pdfDisabled}
          >
            {generatingPdf ? "Generating..." : "Generate PDF"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleShareWithLender}
            disabled={pdfDisabled || !userId}
          >
            {sharing ? "Sharing..." : "Share with Lender"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {reportMode === "portfolio" && (portfolioLoading || storesLoading) && (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-700 dark:text-slate-500 text-[13px]">Loading portfolio report...</div>
        </div>
      )}

      {reportMode === "portfolio" && !portfolioLoading && !storesLoading && !portfolioReady && (
        <div className="card text-center py-10">
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            Add at least one store to generate a portfolio report.
          </p>
        </div>
      )}

      {reportMode === "store" && (storesLoading || loading) && (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-700 dark:text-slate-500 text-[13px]">Loading report data...</div>
        </div>
      )}

      {reportMode === "store" && !storesLoading && !loading && !isStoreReady && (
        <div className="card text-center py-10">
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            {stores.length === 0
              ? "Add a store to generate an underwriting report."
              : "Select a store from the dropdown above to generate an underwriting report."}
          </p>
        </div>
      )}

      {reportMode === "portfolio" && portfolioReady && totals && cashFlow && (
        <>
          <div className="hero-value-card">
            <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
              Portfolio Net Worth
            </div>
            <AnimatedNumber value={totals.portfolioNetWorth} prefix="$" className="hero-value-text" duration={1200} />
            <p className="text-[13px] text-gray-700 dark:text-slate-400 mt-4">
              Portfolio Value {fmtDollar(totals.portfolioValue)} − Debt {fmtDollar(totals.portfolioDebt)} + Cash {fmtDollar(totals.portfolioCash)}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "16px",
            }}
          >
            <KpiCard label="Portfolio Value" value={<AnimatedNumber value={totals.portfolioValue} prefix="$" duration={1000} />} style={{ padding: "16px 18px" }} />
            <KpiCard label="Portfolio Debt" value={<AnimatedNumber value={totals.portfolioDebt} prefix="$" duration={1000} />} style={{ padding: "16px 18px" }} />
            <KpiCard label="Portfolio Equity" value={<AnimatedNumber value={totals.portfolioEquity} prefix="$" duration={1000} />} style={{ padding: "16px 18px" }} />
            <KpiCard label="Portfolio Cash" value={<AnimatedNumber value={totals.portfolioCash} prefix="$" duration={1000} />} style={{ padding: "16px 18px" }} />
            <KpiCard
              label="Global DSCR"
              value={
                totals.annualDebtService > 0 ? (
                  <AnimatedNumber value={totals.globalDSCR} decimals={2} suffix="x" duration={1000} />
                ) : (
                  "—"
                )
              }
              style={{ padding: "16px 18px" }}
            />
            <KpiCard label="Global LTV" value={<AnimatedNumber value={totals.globalLTV} decimals={1} suffix="%" duration={1000} />} style={{ padding: "16px 18px" }} />
            <KpiCard label="Annual Revenue" value={<AnimatedNumber value={totals.annualRevenue} prefix="$" duration={1000} />} style={{ padding: "16px 18px" }} />
            <KpiCard label="Annual EBITDA" value={<AnimatedNumber value={totals.annualEbitda} prefix="$" duration={1000} />} style={{ padding: "16px 18px" }} />
          </div>

          <div className="card">
            <SectionHeading>Store Summary</SectionHeading>
            <div className="table-scroll">
              <table className="w-full text-[12px] min-w-[900px]">
                <thead>
                  <tr className="text-left text-gray-700 dark:text-gray-300 border-b border-white/[0.06]">
                    <th className="pb-3 pr-3 font-medium">Store Name</th>
                    <th className="pb-3 pr-3 font-medium">Address</th>
                    <th className="pb-3 pr-3 font-medium text-right">Revenue</th>
                    <th className="pb-3 pr-3 font-medium text-right">EBITDA</th>
                    <th className="pb-3 pr-3 font-medium text-right">DSCR</th>
                    <th className="pb-3 pr-3 font-medium text-right">Value</th>
                    <th className="pb-3 pr-3 font-medium text-right">Debt</th>
                    <th className="pb-3 pr-3 font-medium text-right">Cash</th>
                    <th className="pb-3 pr-3 font-medium text-right">Equity</th>
                    <th className="pb-3 pr-3 font-medium text-right">Lease Score</th>
                    <th className="pb-3 font-medium text-right">Equip. Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {storeDetails.map((d) => (
                    <tr key={d.store.id} className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-3 text-gray-900 dark:text-white">{d.store.name ?? "Store"}</td>
                      <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{d.store.address ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{fmtDollar(d.annualRevenue)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-green-600 dark:text-green-400">{fmtDollar(d.annualEbitda)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">
                        {d.annualDebtService > 0 && d.dscr != null ? fmtMultiple(d.dscr) : "N/A"}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{fmtDollar(d.valuation.businessValue)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{fmtDollar(d.debt)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{fmtDollar(d.cash)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-green-600 dark:text-green-400">{fmtDollar(d.equity)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{d.leaseScore}</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-900 dark:text-white">{d.equipmentGrade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <SectionHeading>Global Cash Flow</SectionHeading>
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-white/[0.04]">
                {[
                  ["Revenue", cashFlow.revenue],
                  ["Utilities", cashFlow.utilities],
                  ["Rent", cashFlow.rent],
                  ["Payroll", cashFlow.payroll],
                  ["Repairs", cashFlow.repairs],
                  ["Other Expenses", cashFlow.otherExpenses],
                  ["EBITDA", cashFlow.ebitda],
                  ["Debt Service", cashFlow.debtService],
                  ["Cash Flow After Debt", cashFlow.cashFlowAfterDebt],
                ].map(([label, amount]) => (
                  <tr key={label as string}>
                    <td className="py-2.5 text-gray-700 dark:text-gray-300">{label}</td>
                    <td
                      className={clsx(
                        "py-2.5 text-right font-semibold tabular-nums",
                        label === "EBITDA" || label === "Cash Flow After Debt"
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-900 dark:text-white"
                      )}
                    >
                      {fmtDollar(amount as number)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <SectionHeading>Global Credit Metrics</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  label: "Global DSCR",
                  value: totals.annualDebtService > 0 ? fmtMultiple(totals.globalDSCR) : "N/A",
                  explanation: "Combined EBITDA divided by total annual debt service across all stores.",
                },
                {
                  label: "Global LTV",
                  value: fmtPct(totals.globalLTV),
                  explanation: "Total debt as a percentage of total portfolio business value.",
                },
                {
                  label: "Debt Yield",
                  value: totals.portfolioDebt > 0 ? fmtPct(totals.debtYield) : "N/A",
                  explanation: "Annual EBITDA divided by total outstanding debt.",
                },
                {
                  label: "Debt / EBITDA",
                  value: totals.annualEbitda > 0 ? fmtMultiple(totals.debtToEbitda) : "N/A",
                  explanation: "Total debt relative to annual EBITDA — lower is better.",
                },
                {
                  label: "Portfolio Cash",
                  value: fmtDollar(totals.portfolioCash),
                  explanation: "Combined operating, reserve, and petty cash across all stores.",
                },
                {
                  label: "Portfolio Debt",
                  value: fmtDollar(totals.portfolioDebt),
                  explanation: "Total outstanding loan balances across active store loans.",
                },
                {
                  label: "Portfolio Equity",
                  value: fmtDollar(totals.portfolioEquity),
                  explanation: "Portfolio value minus debt plus cash on hand.",
                },
              ].map((item) => (
                <div key={item.label} className="card2 p-4">
                  <div className="metric-label mb-1">
                    <MetricTooltip label={item.label} explanation={item.explanation} />
                  </div>
                  <div className="text-[18px] font-bold text-slate-100">{item.value}</div>
                  <p className="text-[11px] text-gray-700 dark:text-slate-500 mt-2 leading-relaxed">{item.explanation}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <SectionHeading>Lease Summary</SectionHeading>
            <div className="table-scroll">
              <table className="w-full text-[12px] min-w-[640px]">
                <thead>
                  <tr className="text-left text-gray-700 dark:text-gray-300 border-b border-white/[0.06]">
                    <th className="pb-3 pr-3 font-medium">Store</th>
                    <th className="pb-3 pr-3 font-medium">Lease Expiration</th>
                    <th className="pb-3 pr-3 font-medium text-right">Years Remaining</th>
                    <th className="pb-3 pr-3 font-medium text-right">Options Remaining</th>
                    <th className="pb-3 font-medium text-right">Lease Score</th>
                  </tr>
                </thead>
                <tbody>
                  {storeDetails.map((d) => (
                    <tr key={`lease-${d.store.id}`} className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-3 text-gray-900 dark:text-white">{d.store.name ?? "Store"}</td>
                      <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">
                        {formatLeaseExpiration(d.lease, d.store.occupancy_type === "owner_occupied")}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">
                        {d.lease ? d.yearsRemaining.toFixed(1) : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">
                        {d.availableLeaseOptions > 0 ? d.availableLeaseOptions : "—"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-gray-900 dark:text-white">{d.leaseScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <SectionHeading>Equipment Summary</SectionHeading>
            <div className="table-scroll">
              <table className="w-full text-[12px] min-w-[720px]">
                <thead>
                  <tr className="text-left text-gray-700 dark:text-gray-300 border-b border-white/[0.06]">
                    <th className="pb-3 pr-3 font-medium">Store</th>
                    <th className="pb-3 pr-3 font-medium text-right">Equipment Grade</th>
                    <th className="pb-3 pr-3 font-medium text-right">Avg Age</th>
                    <th className="pb-3 pr-3 font-medium text-right">Washers</th>
                    <th className="pb-3 pr-3 font-medium text-right">Dryers</th>
                    <th className="pb-3 pr-3 font-medium">Largest Machine</th>
                    <th className="pb-3 font-medium text-right">Equipment Score</th>
                  </tr>
                </thead>
                <tbody>
                  {storeDetails.map((d) => {
                    const equipMetrics = computeEquipmentMetrics(d.equipment as EquipmentRecord[]);
                    return (
                      <tr key={`equip-${d.store.id}`} className="border-b border-white/[0.04]">
                        <td className="py-2.5 pr-3 text-gray-900 dark:text-white">{d.store.name ?? "Store"}</td>
                        <td className="py-2.5 pr-3 text-right text-gray-900 dark:text-white">{d.equipmentGrade}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{d.avgEquipmentAge.toFixed(1)} yrs</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{equipMetrics.totalWashers}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{equipMetrics.totalDryers}</td>
                        <td className="py-2.5 pr-3 text-gray-900 dark:text-white">{getLargestMachine(d.equipment as EquipmentRecord[])}</td>
                        <td className="py-2.5 text-right tabular-nums text-gray-900 dark:text-white">{equipMetrics.qualityScore}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <SectionHeading>Portfolio Net Worth</SectionHeading>
            <div className="text-[14px] space-y-2 font-mono">
              <div className="flex justify-between text-slate-900 dark:text-slate-300">
                <span>Portfolio Value:</span>
                <span>{fmtDollar(totals.portfolioValue)}</span>
              </div>
              <div className="flex justify-between text-slate-900 dark:text-slate-300">
                <span>+ Cash:</span>
                <span>{fmtDollar(totals.portfolioCash)}</span>
              </div>
              <div className="flex justify-between text-slate-900 dark:text-slate-300">
                <span>− Debt:</span>
                <span className="text-red-400">−{fmtDollar(totals.portfolioDebt).replace("$", "")}</span>
              </div>
              <div className="border-t border-white/[0.06] pt-3 flex justify-between items-baseline">
                <span className="text-slate-900 dark:text-slate-200 font-semibold">= Portfolio Net Worth:</span>
                <span className="text-[28px] font-bold text-green-400">{fmtDollar(totals.portfolioNetWorth)}</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-700 dark:text-slate-600 pb-4">
            Report generated by LaundroCFO — Portfolio — {generatedDate}
          </div>
        </>
      )}

      {reportMode === "store" && isStoreReady && store && valuation && metrics && (
        <>
      <div className="card">
        <SectionHeading>Executive Summary</SectionHeading>
        <p className="text-[13px] text-slate-900 dark:text-slate-300 leading-relaxed">{executiveSummary}</p>
      </div>

      {/* Three-column summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <SectionHeading>Valuation</SectionHeading>
          <div className="divide-y divide-white/[0.04] text-[13px]">
            <PreviewRow label="EBITDA" value={fmtDollar(metrics.annualEbitda)} />
            <PreviewRow label="Multiple Applied" value={fmtMultiple(valuation.finalMultiple)} className="text-blue-300" />
            <PreviewRow label="Est. Store Value" value={fmtDollar(valuation.businessValue)} className="text-green-400 text-[15px] font-bold" />
          </div>
        </div>
        <div className="card">
          <SectionHeading>Financeability</SectionHeading>
          <div className="divide-y divide-white/[0.04] text-[13px]">
            <PreviewRow
              label="DSCR"
              value={metrics.dscr != null ? fmtMultiple(metrics.dscr) : "N/A"}
              className={metrics.dscr != null ? ratioColorClass(metrics.dscr, 1.25, 1.0) : "text-gray-700 dark:text-slate-400"}
            />
            <PreviewRow
              label="Global DSCR"
              value={metrics.globalDscr != null ? fmtMultiple(metrics.globalDscr) : "N/A"}
              className={metrics.globalDscr != null ? ratioColorClass(metrics.globalDscr, 1.25, 1.0) : "text-gray-700 dark:text-slate-400"}
            />
            <PreviewRow label="Rating" value={metrics.financeRating} className="text-green-400" />
          </div>
        </div>
        <div className="card">
          <SectionHeading>Key Risks</SectionHeading>
          <div className="divide-y divide-white/[0.04] text-[13px]">
            {metrics.utilityRatio > 17 ? (
              <div className="py-2 text-amber-400">Utility ratio {fmtPct(metrics.utilityRatio)}</div>
            ) : (
              <div className="py-2 text-slate-900 dark:text-slate-300">Utility ratio {fmtPct(metrics.utilityRatio)}</div>
            )}
            <div className="py-2 text-slate-900 dark:text-slate-300">
              {metrics.isOwnerOccupied
                ? "Owner-occupied — fee simple"
                : `Lease — ${metrics.totalLeaseControl.toFixed(1)}yr control`}
            </div>
            <div className="py-2 text-slate-900 dark:text-slate-300">
              Equipment — {equipMetrics.weightedAvgAge.toFixed(1)}yr avg
            </div>
          </div>
        </div>
      </div>

      {/* Lease + Equipment */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <SectionHeading>{metrics.isOwnerOccupied ? "Real Estate" : "Lease Summary"}</SectionHeading>
          <div className="text-[13px] text-gray-700 dark:text-slate-400 space-y-2">
            {metrics.isOwnerOccupied ? (
              <>
                <div>
                  Value:{" "}
                  <span className="text-gray-900 dark:text-white">
                    {realEstate?.estimated_value ? fmtDollar(realEstate.estimated_value) : "—"}
                  </span>
                </div>
                <div>
                  Equity:{" "}
                  <span className="text-green-400 font-semibold">
                    {realEstate?.estimated_value != null && realEstate?.current_loan_balance != null
                      ? fmtDollar(realEstate.estimated_value - realEstate.current_loan_balance)
                      : "—"}
                  </span>
                </div>
              </>
            ) : lease ? (
              <>
                <div>
                  Expires:{" "}
                  <span className="text-gray-900 dark:text-white">
                    {metrics.leaseExpiresStr} — {metrics.yearsRemaining.toFixed(1)} years remaining
                  </span>
                </div>
                <div>
                  Renewals:{" "}
                  <span className="text-gray-900 dark:text-white">
                    {metrics.availableOptions.length} option{metrics.availableOptions.length !== 1 ? "s" : ""} (total{" "}
                    {metrics.totalLeaseControl.toFixed(1)}yr)
                  </span>
                </div>
                <div>
                  Monthly Rent:{" "}
                  <span className="text-gray-900 dark:text-white">
                    {metrics.monthlyRent ? fmtDollar(metrics.monthlyRent) : "—"}
                    {metrics.camCharges > 0 ? " + CAM" : ""}
                  </span>
                </div>
                <div>
                  Occupancy Cost:{" "}
                  <span className="text-gray-900 dark:text-white">
                    {fmtPct(metrics.occupancyCostRatio)} of revenue
                  </span>
                </div>
                <div>
                  Lease Score:{" "}
                  <span className="text-green-400 font-semibold">
                    {metrics.leaseScore}/100 — {scoreLabel(metrics.leaseScore)}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-amber-400">No lease data on file</div>
            )}
          </div>
        </div>
        <div className="card">
          <SectionHeading>Equipment Summary</SectionHeading>
          <div className="text-[13px] text-gray-700 dark:text-slate-400 space-y-2">
            <div>
              Total Machines:{" "}
              <span className="text-gray-900 dark:text-white">
                {equipMetrics.totalMachines} ({equipMetrics.totalWashers} washers, {equipMetrics.totalDryers} dryers)
              </span>
            </div>
            <div>
              Average Age:{" "}
              <span className="text-gray-900 dark:text-white">
                {equipMetrics.weightedAvgAge.toFixed(1)} years — {scoreLabel(equipMetrics.qualityScore)}
              </span>
            </div>
            <div>
              Fleet Under 10yr:{" "}
              <span className="text-gray-900 dark:text-white">{equipMetrics.pctUnder10Years.toFixed(0)}% of machines</span>
            </div>
            <div>
              Replacement Estimate:{" "}
              <span className="text-gray-900 dark:text-white">{fmtDollar(equipMetrics.estimatedReplacementValue)}</span>
            </div>
            <div>
              Equipment Score:{" "}
              <span className="text-green-400 font-semibold">
                {equipMetrics.qualityScore}/100 — {scoreLabel(equipMetrics.qualityScore)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Ratios */}
      <div className="card">
        <SectionHeading>Financial Ratios</SectionHeading>
        <div className="grid grid-cols-4 gap-3">
          {[
            ["DSCR", metrics.dscr != null ? fmtMultiple(metrics.dscr) : "N/A", metrics.dscr != null ? ratioColorClass(metrics.dscr, 1.25, 1.0) : "text-gray-700 dark:text-slate-400"],
            ["Global DSCR", metrics.globalDscr != null ? fmtMultiple(metrics.globalDscr) : "N/A", metrics.globalDscr != null ? ratioColorClass(metrics.globalDscr, 1.25, 1.0) : "text-gray-700 dark:text-slate-400"],
            ["EBITDA Margin", fmtPct(metrics.ebitdaMargin), ratioColorClass(metrics.ebitdaMargin, 25, 20)],
            ["Rent / Revenue", fmtPct(metrics.rentToRevenue), ratioColorClass(metrics.rentToRevenue, 0, 15, true)],
            ["Utility / Revenue", fmtPct(metrics.utilityRatio), ratioColorClass(metrics.utilityRatio, 0, 17, true)],
            ["Revenue / SF", `$${metrics.revenuePerSF.toFixed(2)}`, "text-gray-900 dark:text-white"],
            ["EBITDA / SF", `$${metrics.ebitdaPerSF.toFixed(2)}`, "text-gray-900 dark:text-white"],
            ["Debt Yield", store.loan_balance ? fmtPct(metrics.debtYield) : "N/A", ratioColorClass(metrics.debtYield, 12, 8)],
          ].map(([label, val, color]) => (
            <div key={label as string} className="card2">
              <div className="metric-label">{label}</div>
              <div className={clsx("text-[16px] font-bold", color)}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Value Drivers & Risks */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <SectionHeading>Value Drivers</SectionHeading>
          {valuation.valueDrivers.length === 0 ? (
            <p className="text-[12px] text-gray-700 dark:text-slate-500">No major drivers identified.</p>
          ) : (
            <ul className="space-y-2">
              {valuation.valueDrivers.slice(0, 5).map((d) => (
                <li key={d} className="text-[12px] text-slate-900 dark:text-slate-300">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <SectionHeading>Value Risks</SectionHeading>
          {valuation.valueRisks.length === 0 ? (
            <p className="text-[12px] text-gray-700 dark:text-slate-500">No significant risks flagged.</p>
          ) : (
            <ul className="space-y-2">
              {valuation.valueRisks.slice(0, 5).map((r) => (
                <li key={r} className="text-[12px] text-slate-900 dark:text-slate-300">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Insurance */}
      {insurance.length > 0 && (
        <div className="card">
          <SectionHeading>Insurance ({insurance.length} active policies)</SectionHeading>
          <div className="text-[13px] text-gray-700 dark:text-slate-400 space-y-1">
            {insurance.map((p) => (
              <div key={p.id}>
                <span className="text-slate-900 dark:text-slate-200">{p.policy_type ?? "Policy"}</span>
                {" — "}
                {p.carrier ?? "Unknown carrier"}
                {p.annual_premium ? ` — ${fmtDollar(p.annual_premium)}/yr` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[11px] text-gray-700 dark:text-slate-600 pb-4">
        Report generated by LaundroCFO — {storeName} — {generatedDate}
      </div>
        </>
      )}

      {/* Share modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="card max-w-lg w-full">
            <div className="text-[15px] font-semibold text-slate-100 mb-1">Share with Lender</div>
            <p className="text-[12px] text-gray-700 dark:text-slate-400 mb-4">
              This secure link expires on {shareExpires} (7 days).
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-[var(--bg-input)] dark:bg-[#1e2a3a] border border-[var(--border2)] dark:border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[var(--text-primary)] dark:text-slate-300"
              />
              <button type="button" className="btn-primary text-[12px] px-4" onClick={handleCopyLink}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              className="btn-outline w-full mt-4 text-[12px]"
              onClick={() => setShareModalOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
