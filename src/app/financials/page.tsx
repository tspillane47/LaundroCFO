"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormReveal } from "@/lib/useFormReveal";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase";
import { invalidateValuationCache } from "@/lib/getStoreValuation";
import { findNegativeFieldError } from "@/lib/formHelpers";
import { useStores } from "@/lib/store-context";
import { useAlertEvaluation } from "@/components/alerts/AlertNotificationProvider";
import { fmtDollar, fmtMultiple, fmtPct } from "@/lib/calculations";
import { MetricCard } from "@/components/ui/MetricCard";
import { DSCRCard } from "@/components/ui/DSCRCard";
import { MetricTooltip } from "@/components/ui/MetricTooltip";
import { CurrentMonthlyAveragesPanel } from "@/components/financials/CurrentMonthlyAveragesPanel";
import { PlaidConnectTrustPanel } from "@/components/financials/PlaidConnectTrustPanel";
import {
  PlaidConnectedAccountsList,
  type PlaidConnectedAccount,
} from "@/components/financials/PlaidConnectedAccountsList";
import { YearRevenueEbitdaChart } from "@/components/financials/YearRevenueEbitdaChart";
import { buildYearRevenueEbitdaChartData } from "@/lib/yearRevenueEbitdaChart";
import {
  getCurrentMonthlyAverages,
  type CurrentMonthlyAverages,
} from "@/lib/getCurrentMonthlyAverages";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";
import { INPUT_CLASS, preventEnterSubmit } from "@/components/occupancy/shared";
import { PageError } from "@/components/ui/PageError";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReadOnlyGuard } from "@/components/ui/ReadOnlyGuard";
import { PostSyncReviewCTA } from "@/components/transactions/PostSyncReviewCTA";
import { useWriteGuard } from "@/lib/useWriteGuard";
import {
  type BankImportCategory,
  type CalculatedMonthly,
  type CategorizationRule,
  type FinancialDataSource,
  FINANCIAL_DATA_SOURCE_LABELS,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
  type PlCategoryField,
  type RatioBenchmark,
  type StoreFinancialProfile,
  type TransactionStatus,
  type TransactionType,
  MONTH_NAMES,
  MONTH_SHORT,
  PL_CATEGORY_FIELDS,
  applyLoanDebtServiceToTtm,
  buildRatioBenchmarks,
  fetchAnnualDebtServiceByStore,
  calcMonthly,
  calcRatios,
  calcTtmMetrics,
  calcYoYMetrics,
  DSCR_NO_DEBT_LABEL,
  buildUtilitiesLookup,
  emptyMonthlyForm,
  enrichMonthlyRecords,
  categorizeWithRules,
  getChartRecords,
  monthChartLabel,
  monthKey,
  parseBankCsv,
  ratioStatusColor,
  recordToForm,
  sortRecordsDesc,
  ttmWindowRecords,
} from "@/lib/financials";
import {
  formatQuickBooksConnectionErrorMessage,
  formatQuickBooksSyncStatus,
  formatSkippedMonthLabel,
  isQuickBooksUnsupportedProductError,
  type QuickBooksSyncSkippedMonth,
} from "@/lib/quickbooks-shared";
import {
  EMPTY_PLAID_BALANCE_SYNC_RESULT,
  formatPlaidConnectionLabel,
  formatPlaidItemErrorMessage,
  isPlaidUpdateModeEligible,
  mapPlaidLinkSuccessAccounts,
  PLAID_CONNECT_TRUST,
  PLAID_QUICKBOOKS_BLOCK_MESSAGE,
  type PlaidSyncResult,
} from "@/lib/plaid-shared";

type TabId = "pl" | "trends" | "ratios" | "bank" | "quickbooks";
type MonthlyForm = Omit<MonthlyFinancialRecord, "id" | "store_id" | "data_source" | "manually_overridden_at">;
type NumericFormField = Exclude<keyof MonthlyForm, "notes">;

type StagedTransaction = {
  tempId: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  type: TransactionType;
  category: BankImportCategory;
};

type QBMappingRow = {
  id?: string;
  qb_account_name: string;
  laundrocfo_field: PlCategoryField;
};

type QBConnection = {
  id: string;
  realm_id: string;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_months_synced: number | null;
  last_sync_skipped_count: number | null;
  last_sync_unmapped_count: number | null;
  error_code: string | null;
  error_message: string | null;
  error_at: string | null;
};

type PlaidConnection = {
  id: string;
  plaid_item_id: string;
  institution_name: string | null;
  connected_at: string;
  updated_at: string;
  has_new_transactions: boolean;
  item_error_code: string | null;
  item_error_message: string | null;
  item_error_at: string | null;
};

type PlaidSyncAllResponse = PlaidSyncResult & {
  error?: string;
  synced?: number;
  total?: number;
  connections?: Array<PlaidSyncResult & { connectionId: string; ok: boolean; error?: string }>;
};

function formatPlaidLastSynced(connection: PlaidConnection): string {
  if (connection.has_new_transactions) {
    return "New transactions available";
  }

  const syncedAt = new Date(connection.updated_at);
  if (Number.isNaN(syncedAt.getTime())) {
    return "Not synced yet";
  }

  return `Last synced ${syncedAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}

function formatPlaidSyncSummary(result: PlaidSyncResult): string {
  const parts: string[] = [];
  if (result.added > 0) parts.push(`${result.added} added`);
  if (result.reconciled > 0) parts.push(`${result.reconciled} reconciled`);
  if (result.modified > 0) parts.push(`${result.modified} updated`);
  if (result.removed > 0) parts.push(`${result.removed} removed`);
  if (result.skippedRemovedPosted > 0) {
    parts.push(
      `${result.skippedRemovedPosted} posted removal${result.skippedRemovedPosted === 1 ? "" : "s"} skipped`
    );
  }
  if (result.balances.accountsSynced > 0) {
    parts.push(
      `${result.balances.accountsSynced} account balance${result.balances.accountsSynced === 1 ? "" : "s"} refreshed`
    );
  }
  if (!result.balances.ok && result.balances.error) {
    parts.push(`balance sync failed: ${result.balances.error}`);
  }

  return parts.length > 0
    ? `Plaid sync complete: ${parts.join(", ")}.`
    : "Plaid sync complete. No transaction changes.";
}

const QB_ERROR_MESSAGES: Record<string, string> = {
  missing_params: "QuickBooks did not return the expected authorization data.",
  invalid_state: "QuickBooks authorization state was invalid. Please try again.",
  csrf_mismatch: "QuickBooks authorization expired or was invalid. Please try again.",
  unauthorized: "You must be signed in to connect QuickBooks.",
  forbidden: "You do not have access to connect QuickBooks for this store.",
  token_exchange_failed: "QuickBooks authorization succeeded but token exchange failed.",
  access_denied: "QuickBooks connection was cancelled.",
};

const TABS: { id: TabId; label: string }[] = [
  { id: "pl", label: "P&L" },
  { id: "trends", label: "Trends" },
  { id: "ratios", label: "Ratios" },
  { id: "bank", label: "Bank Import" },
  { id: "quickbooks", label: "QuickBooks" },
];

const FORM_FIELDS: { key: NumericFormField; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "utilities", label: "Utilities" },
  { key: "supplies", label: "Supplies" },
  { key: "repairs_maintenance", label: "Repairs & Maintenance" },
  { key: "rent", label: "Rent" },
  { key: "payroll", label: "Payroll" },
  { key: "insurance_expense", label: "Insurance" },
  { key: "marketing", label: "Marketing" },
  { key: "professional_fees", label: "Professional Fees" },
  { key: "other_expenses", label: "Other Expenses" },
  { key: "debt_service", label: "Debt Service" },
];

const CATEGORY_LABELS: Record<PlCategoryField, string> = {
  revenue: "Revenue",
  utilities: "Utilities",
  rent: "Rent",
  payroll: "Payroll",
  repairs_maintenance: "Repairs & Maintenance",
  insurance_expense: "Insurance",
  supplies: "Supplies",
  marketing: "Marketing",
  professional_fees: "Professional Fees",
  software_subscriptions: "Software Subscriptions",
  cc_processing_fees: "CC Processing Fees",
  bank_charges: "Bank Charges",
  other_expenses: "Other Expenses",
  debt_service: "Debt Service / Loan Payment",
};

const DEFAULT_QB_MAPPINGS: QBMappingRow[] = [
  { qb_account_name: "Laundry Income", laundrocfo_field: "revenue" },
  { qb_account_name: "Wash & Fold Income", laundrocfo_field: "revenue" },
  { qb_account_name: "Utilities", laundrocfo_field: "utilities" },
  { qb_account_name: "Electric & Gas", laundrocfo_field: "utilities" },
  { qb_account_name: "Rent Expense", laundrocfo_field: "rent" },
  { qb_account_name: "Payroll Expense", laundrocfo_field: "payroll" },
  { qb_account_name: "Repairs & Maintenance", laundrocfo_field: "repairs_maintenance" },
  { qb_account_name: "Insurance", laundrocfo_field: "insurance_expense" },
  { qb_account_name: "Supplies", laundrocfo_field: "supplies" },
  { qb_account_name: "Marketing & Advertising", laundrocfo_field: "marketing" },
  { qb_account_name: "Professional Fees", laundrocfo_field: "professional_fees" },
  { qb_account_name: "Loan Payment", laundrocfo_field: "debt_service" },
  { qb_account_name: "Miscellaneous", laundrocfo_field: "other_expenses" },
];

const ROADMAP = [
  { feature: "Manual P&L entry", status: "live" as const },
  { feature: "Bank CSV import", status: "live" as const },
  { feature: "Auto-categorization", status: "live" as const },
  { feature: "QuickBooks Online sync", status: "live" as const },
  { feature: "Plaid bank feed", status: "live" as const },
  { feature: "Utility bill OCR", status: "soon" as const },
];

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = formatter ?? ((v: number) => fmtDollar(v));
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 text-xs shadow-sm">
      <div className="text-[var(--text-secondary)] mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-[var(--text-secondary)]">{entry.name}:</span>
          <span className="text-[var(--text-primary)] font-semibold">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function RatioCard({ item }: { item: RatioBenchmark }) {
  const hasValue = item.value != null;
  const max = item.progressMax ?? (item.unit === "x" ? 3 : item.unit === "$" ? item.top25 * 1.5 : 30);
  const progress = hasValue ? Math.min(100, Math.max(0, ((item.value ?? 0) / max) * 100)) : 0;
  const isNoDebtDscr = item.label === "DSCR" && !hasValue;
  const isGood = isNoDebtDscr
    ? true
    : hasValue
      ? item.lowerIsBetter
        ? (item.value ?? 0) <= item.top25
        : (item.value ?? 0) >= item.top25
      : false;
  const isWarn = isNoDebtDscr
    ? false
    : hasValue
      ? item.lowerIsBetter
        ? (item.value ?? 0) <= item.bottom25
        : (item.value ?? 0) >= item.bottom25
      : false;
  const color = isNoDebtDscr ? "text-green-400" : isGood ? "text-green-400" : isWarn ? "text-amber-400" : "text-red-400";
  const barColor = isNoDebtDscr ? "bg-green-500" : isGood ? "bg-green-500" : isWarn ? "bg-amber-500" : "bg-red-500";

  const display = isNoDebtDscr
    ? DSCR_NO_DEBT_LABEL
    : item.unit === "$"
      ? `$${Math.round(item.value ?? 0).toLocaleString()}`
      : item.unit === "x"
        ? fmtMultiple(item.value ?? 0)
        : fmtPct(item.value ?? 0);

  const benchDisplay =
    item.unit === "$"
      ? `$${Math.round(item.benchmark).toLocaleString()}`
      : item.unit === "x"
        ? fmtMultiple(item.benchmark)
        : fmtPct(item.benchmark);

  return (
    <div className="card2">
      <div className="metric-label">{item.label}</div>
      <div className={clsx("text-[20px] font-bold tabular-nums", color)}>{display}</div>
      <div className="text-[11px] text-[var(--text-muted)] mt-1">Industry median: {benchDisplay}</div>
      <div className="progress-bar mt-3">
        <div className={clsx("h-full rounded-full", barColor)} style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1.5">
        <span>Top 25%: {item.unit === "$" ? `$${Math.round(item.top25).toLocaleString()}` : item.unit === "x" ? fmtMultiple(item.top25) : fmtPct(item.top25)}</span>
        <span>Bottom 25%: {item.unit === "$" ? `$${Math.round(item.bottom25).toLocaleString()}` : item.unit === "x" ? fmtMultiple(item.bottom25) : fmtPct(item.bottom25)}</span>
      </div>
    </div>
  );
}

export default function FinancialsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedStore, isAllStores, stores, loading: storesLoading } = useStores();
  const selectedStoreIdRef = useRef<string | undefined>(selectedStore?.id);
  selectedStoreIdRef.current = selectedStore?.id;
  const { evaluateAlerts } = useAlertEvaluation();
  const { canWrite, blockedReason } = useWriteGuard(selectedStore?.id);

  const [activeTab, setActiveTab] = useState<TabId>("pl");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [store, setStore] = useState<StoreFinancialProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [records, setRecords] = useState<CalculatedMonthly[]>([]);
  const [scheduledAnnualDebtService, setScheduledAnnualDebtService] = useState(0);
  const [stagedTransactions, setStagedTransactions] = useState<StagedTransaction[]>([]);
  const [qbMappings, setQbMappings] = useState<QBMappingRow[]>(DEFAULT_QB_MAPPINGS);
  const [qbConnection, setQbConnection] = useState<QBConnection | null>(null);
  const [plaidConnections, setPlaidConnections] = useState<PlaidConnection[]>([]);
  const [plaidAccounts, setPlaidAccounts] = useState<PlaidConnectedAccount[]>([]);
  const [togglingPlaidAccountId, setTogglingPlaidAccountId] = useState<string | null>(null);
  const [plaidAccountConfirmId, setPlaidAccountConfirmId] = useState<string | null>(null);
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [shouldOpenPlaidLink, setShouldOpenPlaidLink] = useState(false);
  const plaidLinkModeRef = useRef<"connect" | "update">("connect");
  const plaidLinkConnectionIdRef = useRef<string | null>(null);
  const [connectingPlaid, setConnectingPlaid] = useState(false);
  const [disconnectingPlaidConnectionId, setDisconnectingPlaidConnectionId] = useState<string | null>(null);
  const [syncingPlaidConnectionId, setSyncingPlaidConnectionId] = useState<string | null>(null);
  const [plaidSyncResults, setPlaidSyncResults] = useState<Record<string, PlaidSyncResult>>({});
  const [plaidSyncAllResult, setPlaidSyncAllResult] = useState<PlaidSyncResult | null>(null);
  const [plaidDisconnectConfirmConnectionId, setPlaidDisconnectConfirmConnectionId] = useState<string | null>(
    null
  );
  const [showPlaidConnectTrust, setShowPlaidConnectTrust] = useState(false);
  const [disconnectingQb, setDisconnectingQb] = useState(false);
  const [syncingQb, setSyncingQb] = useState(false);
  const [showQbSourceWarning, setShowQbSourceWarning] = useState(false);
  const [showQbDisconnectConfirm, setShowQbDisconnectConfirm] = useState(false);
  const [connectingQb, setConnectingQb] = useState(false);
  const [forceResyncingMonths, setForceResyncingMonths] = useState<Set<string>>(new Set());
  const [qbSyncResult, setQbSyncResult] = useState<{
    monthsSynced: number;
    unmappedAccounts: string[];
    skippedMonths: QuickBooksSyncSkippedMonth[];
  } | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showForm, setShowForm] = useState(false);
  const formRef = useFormReveal(showForm);
  const showFormRef = useRef(showForm);
  showFormRef.current = showForm;
  const [form, setForm] = useState<MonthlyForm>(() => emptyMonthlyForm());
  const [monthlyAverages, setMonthlyAverages] = useState<CurrentMonthlyAverages | null>(null);
  const [monthlyAveragesLoading, setMonthlyAveragesLoading] = useState(false);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  const loadData = useCallback(async (storeIdOverride?: string) => {
    const storeId = storeIdOverride ?? selectedStoreIdRef.current;
    if (!storeId) {
      setStore(null);
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(false);
    setError("");

    try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const [
      { data: storeData, error: storeError },
      { data: financialsData, error: financialsError },
      { data: mappingData, error: mappingError },
      { data: connectionData, error: connectionError },
      { data: plaidConnectionsData, error: plaidConnectionsError },
      { data: plaidAccountsData, error: plaidAccountsError },
      { data: utilitiesData, error: utilitiesError },
      annualDebtByStore,
    ] = await Promise.all([
      supabase.from("stores").select("*").eq("id", storeId).single(),
      supabase
        .from("monthly_financials")
        .select("*")
        .eq("store_id", storeId)
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
      supabase.from("quickbooks_mapping").select("*").eq("store_id", storeId),
      supabase
        .from("quickbooks_connections")
        .select(
          "id, realm_id, connected_at, last_synced_at, last_sync_months_synced, last_sync_skipped_count, last_sync_unmapped_count, error_code, error_message, error_at"
        )
        .eq("store_id", storeId)
        .maybeSingle(),
      supabase
        .from("plaid_connections")
        .select(
          "id, plaid_item_id, institution_name, connected_at, updated_at, has_new_transactions, item_error_code, item_error_message, item_error_at"
        )
        .eq("store_id", storeId)
        .order("connected_at", { ascending: true }),
      supabase
        .from("plaid_accounts")
        .select(
          "id, plaid_connection_id, account_name, account_type, account_subtype, mask, included, excluded_at"
        )
        .eq("store_id", storeId)
        .order("account_name", { ascending: true }),
      supabase
        .from("monthly_utilities")
        .select("year, month, water, gas, electric, sewer, trash, internet")
        .eq("store_id", storeId),
      fetchAnnualDebtServiceByStore(supabase, [storeId]),
    ]);

    const errors = [
      storeError,
      financialsError,
      mappingError,
      connectionError,
      plaidConnectionsError,
      plaidAccountsError,
      utilitiesError,
    ]
      .filter(Boolean)
      .map((e) => e!.message);
    if (errors.length > 0) setError(errors.join(" · "));

    let resolvedStore = storeData as StoreFinancialProfile;
    if (resolvedStore?.financial_data_source === "quickbooks" && !connectionData) {
      const { error: reconcileError } = await supabase
        .from("stores")
        .update({ financial_data_source: "manual" as const })
        .eq("id", storeId);
      if (!reconcileError) {
        resolvedStore = { ...resolvedStore, financial_data_source: "manual" };
      }
    }

    setStore(resolvedStore);
    setScheduledAnnualDebtService(annualDebtByStore[storeId] ?? 0);
    const utilitiesLookup = buildUtilitiesLookup((utilitiesData ?? []) as MonthlyUtilityRecord[]);
    const sorted = enrichMonthlyRecords(
      sortRecordsDesc((financialsData ?? []) as MonthlyFinancialRecord[]),
      utilitiesLookup
    );
    setRecords(sorted);

    if ((mappingData ?? []).length > 0) {
      setQbMappings(
        (mappingData as { id: string; qb_account_name: string; laundrocfo_category: PlCategoryField }[]).map(
          (m) => ({
            id: m.id,
            qb_account_name: m.qb_account_name,
            laundrocfo_field: m.laundrocfo_category,
          })
        )
      );
    } else {
      setQbMappings(DEFAULT_QB_MAPPINGS);
    }

    setQbConnection((connectionData as QBConnection | null) ?? null);
    setPlaidConnections((plaidConnectionsData as PlaidConnection[] | null) ?? []);
    setPlaidAccounts((plaidAccountsData as PlaidConnectedAccount[] | null) ?? []);

    if (sorted.length > 0 && !showFormRef.current) {
      setSelectedYear(sorted[0].year);
      setSelectedMonth(sorted[0].month);
    }

    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (storesLoading) return;
    loadData(selectedStore?.id);
  }, [storesLoading, selectedStore?.id, loadData]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const qbStatus = searchParams.get("qb");
    const reason = searchParams.get("reason");

    if (tab === "quickbooks") {
      setActiveTab("quickbooks");
    } else if (tab === "bank") {
      setActiveTab("bank");
    }

    if (qbStatus === "connected") {
      setActiveTab("quickbooks");
      setSuccess("QuickBooks connected successfully.");
      setError("");
    } else if (qbStatus === "unsupported_product") {
      setActiveTab("quickbooks");
      setSuccess("");
      setError("");
    } else if (qbStatus === "error") {
      setActiveTab("quickbooks");
      setError(QB_ERROR_MESSAGES[reason ?? ""] ?? "QuickBooks connection failed. Please try again.");
      setSuccess("");
    }

    if (tab || qbStatus) {
      router.replace("/financials");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!selectedStore?.id || loading) return;

    if (records.length === 0) {
      setMonthlyAverages(null);
      setMonthlyAveragesLoading(false);
      return;
    }

    let cancelled = false;
    setMonthlyAveragesLoading(true);

    void getCurrentMonthlyAverages(selectedStore.id)
      .then((data) => {
        if (!cancelled) setMonthlyAverages(data);
      })
      .finally(() => {
        if (!cancelled) setMonthlyAveragesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStore?.id, records, loading]);

  const ttm = useMemo(
    () => applyLoanDebtServiceToTtm(calcTtmMetrics(records), scheduledAnnualDebtService),
    [records, scheduledAnnualDebtService]
  );
  const yoy = useMemo(() => calcYoYMetrics(records), [records]);
  const ratios = useMemo(() => (store ? calcRatios(store, records, ttm) : null), [store, records, ttm]);
  const ratioBenchmarks = useMemo(
    () => (ratios ? buildRatioBenchmarks(ttm, ratios) : []),
    [ttm, ratios]
  );

  const selectedRecord = useMemo(
    () => records.find((r) => r.year === selectedYear && r.month === selectedMonth) ?? null,
    [records, selectedYear, selectedMonth]
  );

  const yearRecords = useMemo(() => {
    const byMonth = new Map<number, CalculatedMonthly>();
    records.filter((r) => r.year === selectedYear).forEach((r) => byMonth.set(r.month, r));
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      return byMonth.get(month) ?? null;
    });
  }, [records, selectedYear]);

  const yearTotals = useMemo(() => {
    const existing = yearRecords.filter(Boolean) as CalculatedMonthly[];
    if (existing.length === 0) return null;
    return existing.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        totalExpenses: acc.totalExpenses + r.totalExpenses,
        ebitda: acc.ebitda + r.ebitda,
        noi: acc.noi + r.noi,
        debt_service: acc.debt_service + r.debt_service,
      }),
      { revenue: 0, totalExpenses: 0, ebitda: 0, noi: 0, debt_service: 0 }
    );
  }, [yearRecords]);

  const ttmTableTotals = useMemo(() => {
    const ttmRecords = ttmWindowRecords(records);
    return {
      revenue: ttm.ttmRevenue,
      expenses: ttmRecords.reduce((sum, r) => sum + r.totalExpenses, 0),
      ebitda: ttm.ttmEbitda,
      margin: ttm.ttmEbitdaMargin,
      debtService: ttmRecords.reduce((sum, r) => sum + r.debt_service, 0),
      noi: ttm.ttmNoi,
      monthsUsed: ttm.monthsUsed,
    };
  }, [records, ttm]);

  const yearChartData = useMemo(() => buildYearRevenueEbitdaChartData(yearRecords), [yearRecords]);

  const trendChartData = useMemo(() => {
    return getChartRecords(records, 24).map((r) => ({
      label: monthChartLabel(r.year, r.month),
      revenue: r.revenue,
      ebitda: r.ebitda,
      ebitdaMargin: r.ebitdaMargin,
    }));
  }, [records]);

  const liveCalc = useMemo(
    () =>
      calcMonthly({
        id: selectedRecord?.id ?? "",
        store_id: store?.id ?? "",
        ...form,
        year: selectedYear,
        month: selectedMonth,
      }),
    [form, selectedRecord?.id, store?.id, selectedYear, selectedMonth]
  );

  const monthsWithData = useMemo(
    () => new Set(records.filter((r) => r.year === selectedYear).map((r) => r.month)),
    [records, selectedYear]
  );

  function selectMonth(month: number) {
    setSelectedMonth(month);
    setShowForm(false);
  }

  function openMonthForm(month: number) {
    if (!canWrite) {
      setError(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    setSelectedMonth(month);
    const existing = records.find((r) => r.year === selectedYear && r.month === month);
    setForm(existing ? recordToForm(existing) : { ...emptyMonthlyForm(store), year: selectedYear, month });
    setSaveStatus("idle");
    setShowForm(true);
  }

  function setFormField(key: NumericFormField, value: string) {
    if (key === "year" || key === "month") {
      setForm((prev) => ({ ...prev, [key]: Number(value) || 0 }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value === "" ? 0 : Number(value) }));
  }

  async function saveMonthlyRecord() {
    console.log("[saveMonthlyRecord] invoked", {
      canWrite,
      blockedReason,
      storeId: store?.id ?? null,
      userId,
      saving,
      saveStatus,
      selectedYear,
      selectedMonth,
      selectedRecordId: selectedRecord?.id ?? null,
      selectedRecordYear: selectedRecord?.year ?? null,
      selectedRecordMonth: selectedRecord?.month ?? null,
    });

    if (!canWrite) {
      console.warn("[saveMonthlyRecord] blocked: read-only (canWrite=false)", { blockedReason });
      setError(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    if (!store?.id || !userId || saving || saveStatus === "success") {
      console.warn("[saveMonthlyRecord] early return (silent)", {
        hasStoreId: Boolean(store?.id),
        hasUserId: Boolean(userId),
        saving,
        saveStatus,
      });
      return;
    }

    const negativeFieldError = findNegativeFieldError(
      FORM_FIELDS.map(({ key, label }) => ({ value: form[key] as number, label }))
    );
    if (negativeFieldError) {
      setSaveStatus("error");
      setError(negativeFieldError);
      return;
    }

    setSaving(true);
    setSaveStatus("idle");
    setError("");
    setSuccess("");

    try {
      const payload = {
        store_id: store.id,
        user_id: userId,
        year: selectedYear,
        month: selectedMonth,
        revenue: form.revenue,
        utilities: form.utilities,
        rent: form.rent,
        payroll: form.payroll,
        repairs_maintenance: form.repairs_maintenance,
        insurance_expense: form.insurance_expense,
        supplies: form.supplies,
        marketing: form.marketing,
        professional_fees: form.professional_fees,
        other_expenses: form.other_expenses,
        debt_service: form.debt_service,
        notes: form.notes,
        data_source: "manual" as const,
        manually_overridden_at: new Date().toISOString(),
      };

      if (selectedRecord?.id) {
        console.log("[saveMonthlyRecord] UPDATE path", {
          recordId: selectedRecord.id,
          payload,
        });
        const { data: updatedRows, error: updateError } = await supabase
          .from("monthly_financials")
          .update(payload)
          .eq("id", selectedRecord.id)
          .select("id, year, month, data_source, manually_overridden_at, revenue, updated_at");
        console.log("[saveMonthlyRecord] UPDATE result", {
          error: updateError,
          rowsReturned: updatedRows?.length ?? 0,
          updatedRows,
        });
        if (updateError) {
          console.error("Monthly financials save error:", updateError);
          setSaveStatus("error");
          setError("We couldn't save this. Please try again.");
          setSaving(false);
          return;
        }
      } else {
        console.log("[saveMonthlyRecord] INSERT path (no selectedRecord.id)", { payload });
        const { data: insertedRows, error: insertError } = await supabase
          .from("monthly_financials")
          .insert(payload)
          .select("id, year, month, data_source, manually_overridden_at, revenue, updated_at");
        console.log("[saveMonthlyRecord] INSERT result", {
          error: insertError,
          rowsReturned: insertedRows?.length ?? 0,
          insertedRows,
        });
        if (insertError) {
          console.error("Monthly financials save error:", insertError);
          setSaveStatus("error");
          setError("We couldn't save this. Please try again.");
          setSaving(false);
          return;
        }
      }

      invalidateValuationCache(store.id);
      setSaveStatus("success");
      setSuccess(`${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} saved successfully.`);
      void evaluateAlerts({ storeIds: [store.id] });
      setTimeout(() => {
        setShowForm(false);
        setSaveStatus("idle");
        setSaving(false);
      }, 600);
      await loadData(store.id);
    } catch (err) {
      console.error("Unexpected monthly financials save error:", err);
      setSaveStatus("error");
      setError("We couldn't save this. Please try again.");
      setSaving(false);
    }
  }

  function handleCSVUpload(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const parsed = parseBankCsv(text);
      if (parsed.length === 0) {
        setError(
          "Could not parse CSV. Expected columns: Processed Date, Description, Credit or Debit, and Amount."
        );
        return;
      }

      let rules: CategorizationRule[] = [];
      if (userId) {
        const { data: freshRules } = await supabase
          .from("categorization_rules")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (freshRules) {
          rules = freshRules as CategorizationRule[];
        }
      }

      const baseId = Date.now();
      const staged: StagedTransaction[] = parsed.map((row, i) => {
        const { category } = categorizeWithRules(row.description, row.type, row.amount, rules);
        return {
          tempId: `csv-${baseId}-${i}`,
          transaction_date: row.date,
          description: row.description,
          amount: row.amount,
          type: row.type,
          category,
        };
      });
      setStagedTransactions((prev) => [...staged, ...prev]);
      setSuccess(
        `Parsed ${staged.length} transaction${staged.length === 1 ? "" : "s"} from CSV. Save to queue, then review on the Transactions page.`
      );
    };
    reader.readAsText(file);
  }

  async function saveStagedToBank() {
    if (!canWrite) {
      setError(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    if (!store?.id || !userId || stagedTransactions.length === 0) return;
    if (saving) return;
    setSaving(true);
    const rows = stagedTransactions.map((t) => ({
      store_id: store.id,
      user_id: userId,
      transaction_date: t.transaction_date,
      description: t.description,
      amount: t.amount,
      category: t.category,
      transaction_type: t.type,
      original_category: t.category,
      status: "needs_review" as TransactionStatus,
      is_reviewed: false,
      excluded: false,
    }));
    const { error: insertError } = await supabase.from("bank_transactions").insert(rows);
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    setStagedTransactions([]);
    setSaving(false);
    if (store?.id) {
      void evaluateAlerts({ storeIds: [store.id] });
    }
    router.push("/transactions?tab=needs_review");
  }

  async function saveQBMappings() {
    if (!store?.id || !userId) return;
    setSaving(true);
    setError("");

    await supabase.from("quickbooks_mapping").delete().eq("store_id", store.id);

    const rows = qbMappings.map((m) => ({
      store_id: store.id,
      user_id: userId,
      qb_account_name: m.qb_account_name,
      laundrocfo_category: m.laundrocfo_field,
    }));

    const { error: insertError } = await supabase.from("quickbooks_mapping").insert(rows);
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSuccess("QuickBooks account mappings saved.");
    setSaving(false);
    await loadData(store.id);
  }

  async function disconnectQuickBooks() {
    if (!store?.id) return;
    setDisconnectingQb(true);
    setError("");
    setSuccess("");
    setQbSyncResult(null);

    try {
      const response = await fetch("/api/quickbooks/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to disconnect QuickBooks");
      }

      setQbConnection(null);
      setStore((prev) => (prev ? { ...prev, financial_data_source: "manual" } : prev));
      setShowQbDisconnectConfirm(false);
      setSuccess("QuickBooks disconnected.");
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error ? disconnectError.message : "Failed to disconnect QuickBooks"
      );
    } finally {
      setDisconnectingQb(false);
    }
  }

  async function syncQuickBooks(forceOverrideMonths?: QuickBooksSyncSkippedMonth[]) {
    if (!store?.id) return;
    setSyncingQb(true);
    setError("");
    setSuccess("");
    if (!forceOverrideMonths?.length) {
      setQbSyncResult(null);
    }

    try {
      const response = await fetch("/api/quickbooks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store.id,
          ...(forceOverrideMonths?.length ? { forceOverrideMonths } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            monthsSynced?: number;
            unmappedAccounts?: string[];
            skippedMonths?: QuickBooksSyncSkippedMonth[];
            unsupportedProduct?: boolean;
            error?: string;
            reconnectRequired?: boolean;
          }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to sync QuickBooks");
      }

      const monthsSynced = payload?.monthsSynced ?? 0;
      const unmappedAccounts = payload?.unmappedAccounts ?? [];
      const skippedMonths = payload?.skippedMonths ?? [];
      const unsupportedProduct = Boolean(payload?.unsupportedProduct);
      setQbSyncResult(
        unsupportedProduct ? null : { monthsSynced, unmappedAccounts, skippedMonths }
      );

      if (unsupportedProduct) {
        invalidateValuationCache(store.id);
        void evaluateAlerts({ storeIds: [store.id] });
        await loadData(store.id);
        return;
      }

      const skippedCount = skippedMonths.length;
      if (forceOverrideMonths?.length) {
        setSuccess(
          monthsSynced === 1
            ? "Force-resynced 1 month from QuickBooks."
            : `Force-resynced ${monthsSynced} months from QuickBooks.`
        );
      } else if (skippedCount > 0) {
        setSuccess(
          monthsSynced === 0
            ? `Sync complete. ${skippedCount} manually edited month${skippedCount === 1 ? "" : "s"} were skipped.`
            : `Synced ${monthsSynced} month${monthsSynced === 1 ? "" : "s"} from QuickBooks. ${skippedCount} manually edited month${skippedCount === 1 ? "" : "s"} were skipped.`
        );
      } else {
        setSuccess(
          monthsSynced === 1
            ? "Synced 1 month from QuickBooks."
            : `Synced ${monthsSynced} months from QuickBooks.`
        );
      }

      invalidateValuationCache(store.id);
      void evaluateAlerts({ storeIds: [store.id] });
      await loadData(store.id);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync QuickBooks");
      await loadData(store.id);
    } finally {
      setSyncingQb(false);
      setForceResyncingMonths(new Set());
    }
  }

  const hasPlaidConnections = plaidConnections.length > 0;

  function initiateQuickBooksConnect() {
    if (!store?.id) return;
    if (hasPlaidConnections) {
      setError("Disconnect all bank accounts before connecting QuickBooks for this store.");
      return;
    }
    const source = store.financial_data_source ?? "manual";
    if (source === "bank_import") {
      setShowQbSourceWarning(true);
      return;
    }
    window.location.href = `/api/quickbooks/authorize?storeId=${store.id}`;
  }

  function confirmQuickBooksConnect() {
    if (!store?.id || hasPlaidConnections) return;
    setConnectingQb(true);
    setError("");
    window.location.href = `/api/quickbooks/authorize?storeId=${store.id}`;
  }

  const plaidBlockedByQuickBooks = Boolean(qbConnection);
  const quickBooksBlockedByPlaid = hasPlaidConnections;
  const plaidActionBusy =
    connectingPlaid ||
    disconnectingPlaidConnectionId !== null ||
    syncingPlaidConnectionId !== null ||
    togglingPlaidAccountId !== null;

  const { open: openPlaidLink, ready: plaidLinkReady } = usePlaidLink({
    token: plaidLinkToken,
    onSuccess: async (publicToken, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!store?.id) return;
      setConnectingPlaid(true);
      setError("");
      setSuccess("");

      const isUpdateMode = plaidLinkModeRef.current === "update";
      const connectionId = plaidLinkConnectionIdRef.current;
      const accounts = mapPlaidLinkSuccessAccounts(metadata);

      try {
        if (isUpdateMode) {
          if (!connectionId) {
            throw new Error("Missing bank connection for reconnection");
          }

          const response = await fetch("/api/plaid/complete-update-mode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId: store.id, connectionId, accounts }),
          });

          const payload = (await response.json().catch(() => null)) as
            | { ok?: boolean; sync?: PlaidSyncResult | null; error?: string }
            | null;

          if (!response.ok) {
            throw new Error(payload?.error ?? "Failed to reconnect bank account");
          }

          setSuccess("Bank account reconnected successfully.");
          if (payload?.sync) {
            setPlaidSyncResults((prev) => ({ ...prev, [connectionId]: payload.sync! }));
          }
          await loadData(store.id);
          return;
        }

        const response = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId: store.id,
            public_token: publicToken,
            accounts,
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; institution_name?: string | null; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to connect bank account");
        }

        setStore((prev) =>
          prev && (prev.financial_data_source ?? "manual") === "manual"
            ? { ...prev, financial_data_source: "bank_import" }
            : prev
        );
        setSuccess("Bank account connected successfully.");
        await loadData(store.id);
      } catch (connectError) {
        setError(
          connectError instanceof Error ? connectError.message : "Failed to connect bank account"
        );
      } finally {
        setConnectingPlaid(false);
        setPlaidLinkToken(null);
        setShouldOpenPlaidLink(false);
        plaidLinkModeRef.current = "connect";
        plaidLinkConnectionIdRef.current = null;
      }
    },
    onExit: () => {
      setConnectingPlaid(false);
      setPlaidLinkToken(null);
      setShouldOpenPlaidLink(false);
      plaidLinkModeRef.current = "connect";
      plaidLinkConnectionIdRef.current = null;
    },
  });

  useEffect(() => {
    if (shouldOpenPlaidLink && plaidLinkToken && plaidLinkReady) {
      openPlaidLink();
      setShouldOpenPlaidLink(false);
    }
  }, [shouldOpenPlaidLink, plaidLinkToken, plaidLinkReady, openPlaidLink]);

  async function initiatePlaidConnect() {
    if (!store?.id || plaidBlockedByQuickBooks) return;
    plaidLinkModeRef.current = "connect";
    plaidLinkConnectionIdRef.current = null;
    setConnectingPlaid(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { link_token?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to start bank connection");
      }

      if (!payload?.link_token) {
        throw new Error("Plaid did not return a link token");
      }

      setPlaidLinkToken(payload.link_token);
      setShouldOpenPlaidLink(true);
    } catch (connectError) {
      setConnectingPlaid(false);
      setError(
        connectError instanceof Error ? connectError.message : "Failed to start bank connection"
      );
    }
  }

  async function reconnectPlaid(connectionId: string) {
    if (!store?.id) return;

    const connection = plaidConnections.find((entry) => entry.id === connectionId);
    if (!connection) return;

    if (!isPlaidUpdateModeEligible(connection.item_error_code)) {
      setError(
        "This connection cannot be repaired in place. Disconnect and connect a different bank account."
      );
      return;
    }

    plaidLinkModeRef.current = "update";
    plaidLinkConnectionIdRef.current = connectionId;
    setConnectingPlaid(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, connectionId, updateMode: true }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { link_token?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to start bank reconnection");
      }

      if (!payload?.link_token) {
        throw new Error("Plaid did not return a link token");
      }

      setPlaidLinkToken(payload.link_token);
      setShouldOpenPlaidLink(true);
    } catch (reconnectError) {
      setConnectingPlaid(false);
      plaidLinkConnectionIdRef.current = null;
      setError(
        reconnectError instanceof Error ? reconnectError.message : "Failed to reconnect bank account"
      );
    }
  }

  async function syncPlaidConnection(connectionId: string) {
    if (!store?.id) return;
    setSyncingPlaidConnectionId(connectionId);
    setPlaidSyncAllResult(null);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/plaid/sync-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, connectionId }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (PlaidSyncResult & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to sync Plaid transactions");
      }

      const result: PlaidSyncResult = {
        added: payload?.added ?? 0,
        reconciled: payload?.reconciled ?? 0,
        modified: payload?.modified ?? 0,
        removed: payload?.removed ?? 0,
        skippedRemovedPosted: payload?.skippedRemovedPosted ?? 0,
        balances: payload?.balances ?? { ...EMPTY_PLAID_BALANCE_SYNC_RESULT },
      };
      setPlaidSyncResults((prev) => ({ ...prev, [connectionId]: result }));
      setSuccess(formatPlaidSyncSummary(result));
      await loadData(store.id);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync Plaid transactions");
    } finally {
      setSyncingPlaidConnectionId(null);
    }
  }

  async function syncAllPlaidConnections() {
    if (!store?.id) return;
    setSyncingPlaidConnectionId("all");
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/plaid/sync-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id }),
      });

      const payload = (await response.json().catch(() => null)) as PlaidSyncAllResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to sync Plaid transactions");
      }

      const totals: PlaidSyncResult = {
        added: payload?.added ?? 0,
        reconciled: payload?.reconciled ?? 0,
        modified: payload?.modified ?? 0,
        removed: payload?.removed ?? 0,
        skippedRemovedPosted: payload?.skippedRemovedPosted ?? 0,
        balances: payload?.balances ?? { ...EMPTY_PLAID_BALANCE_SYNC_RESULT },
      };

      setPlaidSyncAllResult(totals);

      const nextResults: Record<string, PlaidSyncResult> = {};
      for (const connectionResult of payload?.connections ?? []) {
        if (!connectionResult.ok) continue;
        nextResults[connectionResult.connectionId] = {
          added: connectionResult.added,
          reconciled: connectionResult.reconciled ?? 0,
          modified: connectionResult.modified,
          removed: connectionResult.removed,
          skippedRemovedPosted: connectionResult.skippedRemovedPosted,
          balances: connectionResult.balances ?? { ...EMPTY_PLAID_BALANCE_SYNC_RESULT },
        };
      }
      setPlaidSyncResults((prev) => ({ ...prev, ...nextResults }));

      const failedCount = (payload?.connections ?? []).filter((entry) => !entry.ok).length;
      if (failedCount > 0) {
        setError(`${failedCount} bank connection${failedCount === 1 ? "" : "s"} failed to sync.`);
      }

      setSuccess(formatPlaidSyncSummary(totals));
      await loadData(store.id);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync Plaid transactions");
    } finally {
      setSyncingPlaidConnectionId(null);
    }
  }

  async function disconnectPlaid(connectionId: string) {
    if (!store?.id) return;
    setDisconnectingPlaidConnectionId(connectionId);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/plaid/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, connectionId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to disconnect bank account");
      }

      setPlaidSyncResults((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
      setPlaidDisconnectConfirmConnectionId(null);
      setSuccess("Bank account disconnected.");
      await loadData(store.id);
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error ? disconnectError.message : "Failed to disconnect bank account"
      );
    } finally {
      setDisconnectingPlaidConnectionId(null);
    }
  }

  async function togglePlaidAccount(accountId: string, included: boolean) {
    if (!store?.id) return;
    setTogglingPlaidAccountId(accountId);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/plaid/toggle-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, accountId, included }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            included?: boolean;
            stampWarning?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to update bank account");
      }

      setPlaidAccountConfirmId(null);
      if (store.id) invalidateValuationCache(store.id);
      setSuccess(
        included
          ? "Account re-included. Its transactions are back in Bank Import and posted amounts were restored to P&L."
          : "Account excluded. Its transactions are hidden from Bank Import and removed from P&L."
      );
      if (payload?.stampWarning) {
        setError(payload.stampWarning);
      }
      await loadData(store.id);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update bank account");
    } finally {
      setTogglingPlaidAccountId(null);
    }
  }

  async function forceResyncQuickBooks(months: QuickBooksSyncSkippedMonth[]) {
    if (!store?.id || months.length === 0) return;
    setForceResyncingMonths(new Set(months.map((month) => monthKey(month.year, month.month))));
    await syncQuickBooks(months);
  }

  function scrollToQbAccountMapping() {
    document.getElementById("qb-account-mapping")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  const isFinancialsLoading =
    storesLoading || (!loadError && !!selectedStore?.id && (loading || store === null));

  if (isFinancialsLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="metric-card" />
          ))}
        </div>
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <EmptyState
        icon="Store"
        title="No stores yet"
        description="Add your first store to view financials."
        ctaLabel="Add Your First Store"
        ctaHref="/portfolio"
      />
    );
  }

  if (isAllStores || !selectedStore) {
    return (
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Select a store from the dropdown above to view financial details.
        </p>
      </div>
    );
  }

  const occupancyPct = ratios && ttm.ttmRevenue > 0 ? (ratios.annualRent / ttm.ttmRevenue) * 100 : 0;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[15px] font-semibold text-slate-100">Financials</h1>
        <p className="text-[12px] text-[var(--text-muted)] mt-1">
          {store?.name ?? selectedStore.name} — P&L, trends, ratios, bank import & QuickBooks
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">{error}</div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-[12px] text-green-400">
          {success}
        </div>
      )}

      <div className="overflow-x-auto table-scroll flex gap-2 pb-1">
        <div className="flex flex-wrap gap-1border-b border-[var(--border)]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-[var(--text-secondary)] hover:text-slate-900"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── TAB 1: P&L ─── */}
      {activeTab === "pl" && (
        <div className="space-y-5">
          {records.length === 0 && (
            <EmptyState
              icon="FileSpreadsheet"
              title="No financial data yet"
              description="Upload your bank CSV to see your P&L, or use the Bank Import and QuickBooks tabs to connect your accounts."
              ctaLabel="Import Transactions"
              ctaHref="/transactions"
            />
          )}

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-muted)]">Data source:</span>
            <span className="badge badge-blue text-[10px]">
              {FINANCIAL_DATA_SOURCE_LABELS[(store?.financial_data_source ?? "manual") as FinancialDataSource]}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 grid-4">
            <MetricCard
              label="TTM Revenue"
              value={fmtDollar(ttm.ttmRevenue || 0)}
              sub={ttm.monthsUsed < 12 ? `${ttm.monthsUsed} mo. of data` : "Trailing 12-month gross revenue"}
              subColor="muted"
            />
            <div className="card">
              <div className="metric-label">
                <DisclaimerLabel>TTM EBITDA</DisclaimerLabel>
              </div>
              <div className="metric-value">{fmtDollar(ttm.ttmEbitda || 0)}</div>
              <div className="text-[12px] mt-1 text-[var(--text-muted)]">
                Earnings before interest, taxes, depreciation, amortization
              </div>
            </div>
            <MetricCard label="EBITDA Margin" value={fmtPct(ttm.ttmEbitdaMargin || 0)} sub="TTM" subColor="muted" />
            <DSCRCard
              dscr={ttm.dscr}
              scheduledAnnualDebtService={scheduledAnnualDebtService}
              compact
            />
            <div className="card">
              <div className="metric-label">
                <MetricTooltip
                  label="NOI"
                  explanation="Net Operating Income. Revenue minus all operating expenses including rent but before debt service."
                />
              </div>
              <div className="metric-value">{fmtDollar(ttm.ttmNoi || 0)}</div>
              <div className="text-[12px] mt-1 text-[var(--text-muted)]">Net operating income after rent and operating expenses</div>
            </div>
          </div>

          <YearRevenueEbitdaChart year={selectedYear} data={yearChartData} />

          <div className="card">
            <div className="flex flex-wrap items-center gap-4 justify-between">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <div className="metric-label mb-1.5">Year</div>
                  <select
                    id="financials-selectedyear"
                    value={selectedYear}
                    onChange={(e) => {
                      setSelectedYear(Number(e.target.value));
                      setShowForm(false);
                    }}
                    className={clsx(INPUT_CLASS, "w-32")}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <div className="metric-label mb-1.5">Month</div>
                  <div className="flex flex-wrap gap-1.5">
                    {MONTH_SHORT.map((label, idx) => {
                      const month = idx + 1;
                      const hasData = monthsWithData.has(month);
                      const isSelected = selectedMonth === month;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => selectMonth(month)}
                          className={clsx(
                            "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                            isSelected
                              ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                              : hasData
                                ? "bg-[var(--bg-page)] border-[var(--border2)] text-[var(--text-primary)] hover:border-blue-500/30"
                                : "bg-transparent border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          )}
                        >
                          {label}
                          {hasData && <span className="ml-0.5 text-green-400">•</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <ReadOnlyGuard>
                <button type="button" className="btn-primary" onClick={() => openMonthForm(selectedMonth)}>
                  {selectedRecord ? "Edit Month" : "Add Month"}
                </button>
              </ReadOnlyGuard>
            </div>
          </div>

          {showForm && (
            <div ref={formRef} className="card">
              <div className="section-title">
                {selectedRecord ? "Edit" : "Add"} — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </div>
              <div
                className="grid gap-4"
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}
              >
                {FORM_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <div className="metric-label mb-1.5">{label}</div>
                    <input
                      id="financials-formfield"
                      type="number"
                      value={form[key] === 0 && key !== "revenue" ? "" : form[key]}
                      onChange={(e) => setFormField(key, e.target.value)}
                      onKeyDown={preventEnterSubmit}
                      className={INPUT_CLASS}
                      placeholder="0"
                      readOnly={!canWrite}
                      disabled={!canWrite}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card2">
                  <div className="metric-label">Total Expenses</div>
                  <div className="text-lg font-bold text-red-400">{fmtDollar(liveCalc.totalExpenses)}</div>
                </div>
                <div className="card2">
                  <div className="metric-label">
                    <DisclaimerLabel>EBITDA</DisclaimerLabel>
                  </div>
                  <div className="text-lg font-bold text-green-400">{fmtDollar(liveCalc.ebitda)}</div>
                </div>
                <div className="card2">
                  <div className="metric-label">
                    <DisclaimerLabel>EBITDA Margin</DisclaimerLabel>
                  </div>
                  <div className="text-lg font-bold text-slate-100">{fmtPct(liveCalc.ebitdaMargin)}</div>
                </div>
                <div className="card2">
                  <div className="metric-label">Cash Flow (NOI)</div>
                  <div className="text-lg font-bold text-blue-400">{fmtDollar(liveCalc.netCashFlow)}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <ReadOnlyGuard>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={saveMonthlyRecord}
                    disabled={saving || saveStatus === "success"}
                  >
                    {saveStatus === "success" ? "Saved" : saving ? "Saving…" : "Save to monthly_financials"}
                  </button>
                </ReadOnlyGuard>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[4fr_1fr] gap-4 items-start">
            <div className="card flex flex-col min-h-0 min-w-0 w-full max-h-[600px] overflow-y-auto">
              <div className="section-title">P&L — {selectedYear}</div>
              <div className="table-scroll min-w-0 w-full">
                <table className="w-full min-w-full table-fixed text-[12px] border-collapse">
                  <colgroup>
                    <col className="w-[11%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                    <col className="w-[11%]" />
                    <col className="w-[16%]" />
                    <col className="w-[17%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[var(--bg-sidebar)] text-slate-100">
                      <th className="py-1.5 px-4 text-left text-[10px] font-semibold uppercase tracking-wider border-b border-white/10">
                        Month
                      </th>
                      <th className="py-1.5 px-4 text-right text-[10px] font-semibold uppercase tracking-wider border-b border-white/10">
                        Revenue
                      </th>
                      <th className="py-1.5 px-4 text-right text-[10px] font-semibold uppercase tracking-wider border-b border-white/10">
                        Expenses
                      </th>
                      <th className="py-1.5 px-4 text-right text-[10px] font-semibold uppercase tracking-wider border-b border-white/10">
                        EBITDA
                      </th>
                      <th className="py-1.5 px-4 text-right text-[10px] font-semibold uppercase tracking-wider border-b border-white/10">
                        Margin
                      </th>
                      <th className="py-1.5 px-4 text-right text-[10px] font-semibold uppercase tracking-wider border-b border-white/10">
                        Debt Svc
                      </th>
                      <th className="py-1.5 px-4 text-right text-[10px] font-semibold uppercase tracking-wider border-b border-white/10">
                        NOI
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearRecords.map((r, i) => {
                      const month = i + 1;
                      const isSelected = selectedMonth === month;
                      const isCalendarCurrentMonth =
                        selectedYear === currentYear && month === new Date().getMonth() + 1;
                      return (
                        <tr
                          key={i}
                          className={clsx(
                            "border-b border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card2)]/80",
                            i % 2 === 1 && "bg-[var(--bg-card2)]/25",
                            isSelected && "bg-blue-500/10 ring-1 ring-inset ring-blue-500/20",
                            isCalendarCurrentMonth &&
                              !isSelected &&
                              "bg-blue-500/[0.06] ring-1 ring-inset ring-blue-400/15"
                          )}
                          onClick={() => selectMonth(month)}
                        >
                          <td className="py-1.5 px-4 text-left font-medium text-[var(--text-primary)]">
                            {MONTH_NAMES[i]}
                            {isCalendarCurrentMonth && (
                              <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-blue-400">
                                Now
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-4 text-right tabular-nums text-green-400/90">
                            {r ? fmtDollar(r.revenue) : "—"}
                          </td>
                          <td className="py-1.5 px-4 text-right tabular-nums text-[var(--text-primary)]">
                            {r ? fmtDollar(r.totalExpenses) : "—"}
                          </td>
                          <td
                            className={clsx(
                              "py-1.5 px-4 text-right tabular-nums font-bold text-green-400",
                              "bg-green-500/[0.08] border-l-2 border-l-green-500"
                            )}
                          >
                            {r ? fmtDollar(r.ebitda) : "—"}
                          </td>
                          <td className="py-1.5 px-4 text-right tabular-nums text-[var(--text-secondary)]">
                            {r ? fmtPct(r.ebitdaMargin) : "—"}
                          </td>
                          <td className="py-1.5 px-4 text-right tabular-nums text-[var(--text-secondary)]">
                            {r ? fmtDollar(r.debt_service) : "—"}
                          </td>
                          <td className="py-1.5 px-4 text-right tabular-nums text-[var(--accent-blue)]">
                            {r ? fmtDollar(r.noi) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {yearTotals && (
                      <tr className="font-semibold bg-[var(--bg-page)]/60 border-t border-[var(--border)]">
                        <td className="py-2 px-4 text-left text-[var(--text-primary)]">
                          {selectedYear} Total
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-green-400/90">
                          {fmtDollar(yearTotals.revenue)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-[var(--text-primary)]">
                          {fmtDollar(yearTotals.totalExpenses)}
                        </td>
                        <td
                          className={clsx(
                            "py-2 px-4 text-right tabular-nums font-bold text-green-400",
                            "bg-green-500/[0.08] border-l-2 border-l-green-500"
                          )}
                        >
                          {fmtDollar(yearTotals.ebitda)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-[var(--text-primary)]">
                          {yearTotals.revenue > 0
                            ? fmtPct((yearTotals.ebitda / yearTotals.revenue) * 100)
                            : "—"}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-[var(--text-primary)]">
                          {fmtDollar(yearTotals.debt_service)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-[var(--accent-blue)]">
                          {fmtDollar(yearTotals.noi)}
                        </td>
                      </tr>
                    )}
                    {ttmTableTotals.monthsUsed > 0 && (
                      <tr className="font-bold border-t-2 border-[var(--border2)] bg-[var(--bg-card2)]/40">
                        <td className="py-2 px-4 text-left text-[var(--text-primary)]">
                          TTM
                          <span className="ml-1 text-[10px] font-medium text-[var(--text-muted)]">
                            ({ttmTableTotals.monthsUsed} mo.)
                          </span>
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-green-400">
                          {fmtDollar(ttmTableTotals.revenue)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-[var(--text-primary)]">
                          {fmtDollar(ttmTableTotals.expenses)}
                        </td>
                        <td
                          className={clsx(
                            "py-2 px-4 text-right tabular-nums font-bold text-green-400",
                            "bg-green-500/10 border-l-2 border-l-green-500"
                          )}
                        >
                          {fmtDollar(ttmTableTotals.ebitda)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-[var(--text-primary)]">
                          {fmtPct(ttmTableTotals.margin)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-[var(--text-primary)]">
                          {fmtDollar(ttmTableTotals.debtService)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-[var(--accent-blue)]">
                          {fmtDollar(ttmTableTotals.noi)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="min-h-0 min-w-0">
              <CurrentMonthlyAveragesPanel
                storeName={store?.name ?? selectedStore.name}
                data={monthlyAverages}
                loading={monthlyAveragesLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: TRENDS ─── */}
      {activeTab === "trends" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="YoY Revenue Growth"
              value={yoy.revenueGrowth != null ? fmtPct(yoy.revenueGrowth) : "—"}
              sub={
                yoy.priorRevenue > 0
                  ? `${fmtDollar(yoy.currentRevenue)} vs ${fmtDollar(yoy.priorRevenue)}`
                  : "Need 24 months of data"
              }
              subColor={
                yoy.revenueGrowth != null
                  ? yoy.revenueGrowth >= 0
                    ? "positive"
                    : "negative"
                  : "muted"
              }
            />
            <MetricCard
              label="YoY EBITDA Growth"
              value={yoy.ebitdaGrowth != null ? fmtPct(yoy.ebitdaGrowth) : "—"}
              sub={
                yoy.priorEbitda > 0
                  ? `${fmtDollar(yoy.currentEbitda)} vs ${fmtDollar(yoy.priorEbitda)}`
                  : "Need 24 months of data"
              }
              subColor={
                yoy.ebitdaGrowth != null
                  ? yoy.ebitdaGrowth >= 0
                    ? "positive"
                    : "negative"
                  : "muted"
              }
            />
            <MetricCard
              label="Margin Change (YoY)"
              value={yoy.marginChange != null ? `${yoy.marginChange >= 0 ? "+" : ""}${yoy.marginChange.toFixed(1)}pp` : "—"}
              sub={
                yoy.marginChange != null
                  ? `${fmtPct(yoy.currentMargin)} vs ${fmtPct(yoy.priorMargin)}`
                  : "Need 24 months of data"
              }
              subColor={
                yoy.marginChange != null
                  ? yoy.marginChange >= 0
                    ? "positive"
                    : "negative"
                  : "muted"
              }
            />
          </div>

          {trendChartData.length === 0 ? (
            <div className="card text-center py-10 text-[14px] text-[var(--text-muted)]">
              Add monthly data on the P&L tab to see trends.
            </div>
          ) : (
            <>
              <div className="card">
                <div className="section-title">Revenue Trend — 24 Months</div>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendChartData}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
                      <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revenueGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="section-title">EBITDA Trend — 24 Months</div>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendChartData}>
                      <defs>
                        <linearGradient id="ebitdaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
                      <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="ebitda" stroke="#22c55e" fill="url(#ebitdaGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="section-title">
                  EBITDA Margin Trend
                  <span className="text-[11px] text-[var(--text-muted)] font-normal ml-auto">22% industry median reference</span>
                </div>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData}>
                      <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
                      <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${v}%`}
                        domain={[0, "auto"]}
                      />
                      <Tooltip content={<ChartTooltip formatter={(v) => fmtPct(v)} />} />
                      <ReferenceLine y={22} stroke="#64748b" strokeDasharray="4 4" label={{ value: "22%", fill: "#64748b", fontSize: 10 }} />
                      <Line
                        type="monotone"
                        dataKey="ebitdaMargin"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={{ fill: "#22c55e", r: 3 }}
                        name="EBITDA Margin"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── TAB 3: RATIOS ─── */}
      {activeTab === "ratios" && ratios && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ratioBenchmarks.map((item) => (
              <RatioCard key={item.label} item={item} />
            ))}
          </div>

          <div className="card">
            <div className="section-title">Occupancy Cost Analysis</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card2">
                <div className="metric-label">Annual Rent (TTM)</div>
                <div className="text-[20px] font-bold text-slate-100">{fmtDollar(ratios.annualRent)}</div>
              </div>
              <div className="card2">
                <div className="metric-label">Rent / Revenue</div>
                <div className={clsx("text-[20px] font-bold", ratioStatusColor(ratios.rentPct, { good: 12, warn: 15 }))}>
                  {fmtPct(ratios.rentPct)}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1">Target: below 15%</div>
              </div>
              <div className="card2">
                <div className="metric-label">Occupancy Cost Ratio</div>
                <div className={clsx("text-[20px] font-bold", ratioStatusColor(occupancyPct, { good: 15, warn: 20 }))}>
                  {fmtPct(occupancyPct)}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1">Rent as % of TTM revenue</div>
              </div>
            </div>
            <div className="mt-4 progress-bar">
              <div
                className={clsx(
                  "h-full rounded-full",
                  occupancyPct <= 15 ? "bg-green-500" : occupancyPct <= 20 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${Math.min(100, (occupancyPct / 25) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[var(--text-muted)] mt-2">
              <span>0%</span>
              <span>15% alert</span>
              <span>20% critical</span>
            </div>
            <div className="mt-4 text-[12px] text-[var(--text-secondary)] leading-relaxed">
              {occupancyPct <= 15
                ? "Occupancy costs are healthy — well below the 20% lender alert threshold."
                : occupancyPct <= 20
                  ? "Occupancy costs are approaching the 20% alert level. Monitor rent escalations."
                  : "Occupancy costs exceed 20% of revenue — this may impact DSCR and valuation multiples."}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: BANK IMPORT ─── */}
      {activeTab === "bank" && (
        <div className="space-y-4">
          <div className="card flex flex-col sm:flex-row sm:items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-[18px] font-bold flex-shrink-0"
              style={{ background: "#0f4c81" }}
            >
              PL
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="text-[14px] font-semibold text-slate-100">Plaid Bank Feed</div>
                {hasPlaidConnections ? (
                  <span className="badge badge-green text-[10px]">
                    {plaidConnections.length} connected
                  </span>
                ) : (
                  <span className="badge badge-amber text-[10px]">Not Connected</span>
                )}
              </div>
              <div className="text-[12px] text-[var(--text-secondary)]">
                {hasPlaidConnections
                  ? "Connect checking, savings, or credit card accounts to automatically import transactions."
                  : "Connect your bank accounts to automatically import transactions."}
              </div>
              {plaidBlockedByQuickBooks && !hasPlaidConnections && (
                <div className="text-[11px] text-amber-200 mt-1">{PLAID_QUICKBOOKS_BLOCK_MESSAGE}</div>
              )}
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-1.5 flex-shrink-0">
              <ReadOnlyGuard>
                <button
                  type="button"
                  className={clsx(
                    "btn-primary",
                    (!store?.id || plaidBlockedByQuickBooks) && "pointer-events-none opacity-50"
                  )}
                  onClick={() => setShowPlaidConnectTrust(true)}
                  disabled={!store?.id || connectingPlaid || plaidBlockedByQuickBooks}
                >
                  {connectingPlaid && plaidLinkModeRef.current === "connect"
                    ? "Connecting…"
                    : hasPlaidConnections
                      ? "Connect Another Account"
                      : "Connect Bank Account"}
                </button>
              </ReadOnlyGuard>
              <p className="text-[10px] text-[var(--text-muted)] text-center sm:text-right leading-tight">
                {PLAID_CONNECT_TRUST.cardHint}
              </p>
            </div>
          </div>

          {showPlaidConnectTrust && (
            <PlaidConnectTrustPanel
              busy={connectingPlaid}
              onCancel={() => setShowPlaidConnectTrust(false)}
              onContinue={() => {
                setShowPlaidConnectTrust(false);
                void initiatePlaidConnect();
              }}
            />
          )}

          {plaidConnections.length > 1 && (
            <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-slate-100">Sync all connected accounts</div>
                <div className="text-[12px] text-[var(--text-secondary)]">
                  Import new transactions from all {plaidConnections.length} bank connections at once.
                </div>
              </div>
              <ReadOnlyGuard>
                <button
                  type="button"
                  className="btn-primary flex-shrink-0"
                  onClick={() => void syncAllPlaidConnections()}
                  disabled={plaidActionBusy}
                >
                  {syncingPlaidConnectionId === "all" ? "Syncing All…" : "Sync All"}
                </button>
              </ReadOnlyGuard>
            </div>
          )}

          {plaidSyncAllResult && (
            <div
              className={clsx(
                "card border",
                plaidSyncAllResult.skippedRemovedPosted > 0
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-emerald-500/30 bg-emerald-500/5"
              )}
            >
              <div className="text-[13px] font-semibold text-slate-100 mb-2">Last sync (all accounts)</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                <div>
                  <div className="text-[var(--text-muted)]">Added</div>
                  <div className="font-semibold text-slate-100">{plaidSyncAllResult.added}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Updated</div>
                  <div className="font-semibold text-slate-100">{plaidSyncAllResult.modified}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Removed</div>
                  <div className="font-semibold text-slate-100">{plaidSyncAllResult.removed}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Posted removals skipped</div>
                  <div className="font-semibold text-slate-100">{plaidSyncAllResult.skippedRemovedPosted}</div>
                </div>
              </div>
              <PostSyncReviewCTA count={plaidSyncAllResult.added} />
            </div>
          )}

          {plaidConnections.map((connection) => {
            const syncResult = plaidSyncResults[connection.id];
            const isSyncing = syncingPlaidConnectionId === connection.id;
            const isReconnecting =
              connectingPlaid &&
              plaidLinkModeRef.current === "update" &&
              plaidLinkConnectionIdRef.current === connection.id;

            return (
              <div key={connection.id} className="space-y-3">
                {connection.item_error_code && (
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-3 rounded-xl border"
                    style={{
                      background: "var(--bg-warning-tint, var(--bg-info-tint))",
                      borderColor: "var(--border)",
                      color: "var(--text-warning, var(--text-info))",
                    }}
                  >
                    <p className="text-[12px] leading-snug">
                      <span className="font-semibold">
                        {formatPlaidConnectionLabel(connection.institution_name)}:
                      </span>{" "}
                      {formatPlaidItemErrorMessage(
                        connection.item_error_code,
                        connection.item_error_message
                      )}{" "}
                      {isPlaidUpdateModeEligible(connection.item_error_code)
                        ? "Reconnect to sign in again without losing your transaction history."
                        : "Disconnect and connect a different bank account to restore imports."}
                    </p>
                    <div className="flex flex-shrink-0 items-center gap-4">
                      {isPlaidUpdateModeEligible(connection.item_error_code) && (
                        <ReadOnlyGuard>
                          <button
                            type="button"
                            className="text-[12px] font-semibold underline underline-offset-2 hover:opacity-80"
                            onClick={() => void reconnectPlaid(connection.id)}
                            disabled={plaidActionBusy}
                          >
                            {isReconnecting ? "Reconnecting…" : "Reconnect"}
                          </button>
                        </ReadOnlyGuard>
                      )}
                      <ReadOnlyGuard>
                        <button
                          type="button"
                          className="text-[12px] font-semibold underline underline-offset-2 hover:opacity-80"
                          onClick={() => setPlaidDisconnectConfirmConnectionId(connection.id)}
                          disabled={plaidActionBusy}
                        >
                          Disconnect
                        </button>
                      </ReadOnlyGuard>
                    </div>
                  </div>
                )}

                <div className="card flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="text-[14px] font-semibold text-slate-100 truncate">
                        {formatPlaidConnectionLabel(connection.institution_name)}
                      </div>
                      {connection.item_error_code ? (
                        <span className="badge badge-amber text-[10px]">Needs attention</span>
                      ) : (
                        <span className="badge badge-green text-[10px]">Connected</span>
                      )}
                    </div>
                    <div className="text-[12px] text-[var(--text-secondary)]">
                      Connected {new Date(connection.connected_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      {" · "}
                      {formatPlaidLastSynced(connection)}
                    </div>
                    {connection.has_new_transactions && !connection.item_error_code && (
                      <p className="text-[11px] text-emerald-200/90 mt-1">
                        New transactions are available — click Sync Now to import them.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                    <ReadOnlyGuard>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void syncPlaidConnection(connection.id)}
                        disabled={plaidActionBusy}
                      >
                        {isSyncing ? "Syncing…" : "Sync Now"}
                      </button>
                    </ReadOnlyGuard>
                    <ReadOnlyGuard>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setPlaidDisconnectConfirmConnectionId(connection.id)}
                        disabled={plaidActionBusy}
                      >
                        Disconnect
                      </button>
                    </ReadOnlyGuard>
                  </div>
                </div>

                <PlaidConnectedAccountsList
                  accounts={plaidAccounts.filter(
                    (account) => account.plaid_connection_id === connection.id
                  )}
                  disabled={plaidActionBusy}
                  togglingAccountId={togglingPlaidAccountId}
                  confirmAccountId={plaidAccountConfirmId}
                  onRequestToggle={(accountId) => setPlaidAccountConfirmId(accountId)}
                  onCancelToggle={() => setPlaidAccountConfirmId(null)}
                  onConfirmToggle={(accountId, included) => void togglePlaidAccount(accountId, included)}
                />

                {syncResult && (
                  <div
                    className={clsx(
                      "card border",
                      syncResult.skippedRemovedPosted > 0
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-emerald-500/30 bg-emerald-500/5"
                    )}
                  >
                    <div className="text-[13px] font-semibold text-slate-100 mb-2">
                      Last sync — {formatPlaidConnectionLabel(connection.institution_name)}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                      <div>
                        <div className="text-[var(--text-muted)]">Added</div>
                        <div className="font-semibold text-slate-100">{syncResult.added}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">Updated</div>
                        <div className="font-semibold text-slate-100">{syncResult.modified}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">Removed</div>
                        <div className="font-semibold text-slate-100">{syncResult.removed}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">Posted removals skipped</div>
                        <div className="font-semibold text-slate-100">{syncResult.skippedRemovedPosted}</div>
                      </div>
                    </div>
                    {syncResult.added > 0 && (
                      <div className="text-[11px] text-[var(--text-secondary)] mt-3 hidden md:block">
                        New transactions are in the{" "}
                        <Link href="/transactions?tab=needs_review" className="text-[var(--accent)] hover:underline">
                          review queue
                        </Link>
                        .
                      </div>
                    )}
                    <PostSyncReviewCTA count={syncResult.added} />
                  </div>
                )}
              </div>
            );
          })}

          {plaidDisconnectConfirmConnectionId && (
            <div className="card border border-red-500/40 bg-red-500/5">
              <div className="text-[13px] font-semibold text-slate-100 mb-1">Disconnect this bank account?</div>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {(() => {
                  const connection = plaidConnections.find(
                    (entry) => entry.id === plaidDisconnectConfirmConnectionId
                  );
                  const label = formatPlaidConnectionLabel(connection?.institution_name);
                  return (
                    <>
                      This will stop automatic syncing for <span className="text-slate-100">{label}</span>.
                      Previously imported transactions will remain in your review queue and P&L.
                    </>
                  );
                })()}
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  className="btn-outline text-[12px]"
                  onClick={() => setPlaidDisconnectConfirmConnectionId(null)}
                  disabled={disconnectingPlaidConnectionId !== null}
                >
                  Cancel
                </button>
                <ReadOnlyGuard>
                  <button
                    type="button"
                    className="text-[12px] px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700"
                    onClick={() => void disconnectPlaid(plaidDisconnectConfirmConnectionId)}
                    disabled={disconnectingPlaidConnectionId !== null}
                  >
                    {disconnectingPlaidConnectionId === plaidDisconnectConfirmConnectionId
                      ? "Disconnecting…"
                      : "Disconnect Bank Account"}
                  </button>
                </ReadOnlyGuard>
              </div>
            </div>
          )}

          <div className="card flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold text-slate-100">Import Bank Transactions</div>
              <div className="text-[12px] text-[var(--text-muted)] mt-1">
                Upload a bank CSV (date, description, amount, and debit/credit or signed amounts). After saving, review and
                categorize on the{" "}
                <Link href="/transactions?tab=needs_review" className="text-[var(--accent)] hover:underline">
                  Transactions page
                </Link>
                .
              </div>
              {stagedTransactions.length > 0 && (
                <div className="text-[12px] text-emerald-200/90 mt-2">
                  {stagedTransactions.length} transaction{stagedTransactions.length === 1 ? "" : "s"} ready to import.
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <ReadOnlyGuard>
                <label className="btn-outline cursor-pointer">
                  Upload CSV
                  <input
                    id="financials-input"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCSVUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </ReadOnlyGuard>
              {stagedTransactions.length > 0 && (
                <ReadOnlyGuard>
                  <button type="button" className="btn-primary" onClick={() => void saveStagedToBank()} disabled={saving}>
                    {saving ? "Saving…" : `Save ${stagedTransactions.length} to Queue`}
                  </button>
                </ReadOnlyGuard>
              )}
            </div>
          </div>

          <div className="card">
            <p className="text-[13px] text-[var(--text-secondary)]">
              Review and categorize your transactions on the{" "}
              <Link href="/transactions?tab=needs_review" className="text-[var(--accent)] hover:underline font-medium">
                Transactions page
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {/* ─── TAB 5: QUICKBOOKS ─── */}
      {activeTab === "quickbooks" && (
        <div className="space-y-4 max-w-3xl">
          {qbConnection?.error_code && (
            <div
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-3 rounded-xl border"
              style={{
                background: "var(--bg-warning-tint, var(--bg-info-tint))",
                borderColor: "var(--border)",
                color: "var(--text-warning, var(--text-info))",
              }}
            >
              {isQuickBooksUnsupportedProductError(qbConnection.error_code) ? (
                <p className="text-[12px] leading-snug">
                  {formatQuickBooksConnectionErrorMessage(
                    qbConnection.error_code,
                    qbConnection.error_message
                  )}
                </p>
              ) : (
                <p className="text-[12px] leading-snug">
                  Your QuickBooks connection needs attention.{" "}
                  {formatQuickBooksConnectionErrorMessage(
                    qbConnection.error_code,
                    qbConnection.error_message
                  )}{" "}
                  Reconnect to keep your data up to date.
                </p>
              )}
              <div className="flex flex-shrink-0 items-center gap-4">
                <ReadOnlyGuard>
                  <button
                    type="button"
                    className="text-[12px] font-semibold underline underline-offset-2 hover:opacity-80"
                    onClick={initiateQuickBooksConnect}
                    disabled={connectingQb || disconnectingQb || syncingQb}
                  >
                    {connectingQb
                      ? "Reconnecting…"
                      : isQuickBooksUnsupportedProductError(qbConnection.error_code)
                        ? "Reconnect with QuickBooks Online"
                        : "Reconnect"}
                  </button>
                </ReadOnlyGuard>
                <ReadOnlyGuard>
                  <button
                    type="button"
                    className="text-[12px] font-semibold underline underline-offset-2 hover:opacity-80"
                    onClick={() => setShowQbDisconnectConfirm(true)}
                    disabled={connectingQb || disconnectingQb || syncingQb}
                  >
                    Disconnect
                  </button>
                </ReadOnlyGuard>
              </div>
            </div>
          )}

          <div className="card flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-[18px] font-bold flex-shrink-0"
              style={{ background: "#2ca01c" }}
            >
              QB
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="text-[14px] font-semibold text-slate-100">QuickBooks Online</div>
                {qbConnection ? (
                  <span className="badge badge-green text-[10px]">Connected</span>
                ) : (
                  <span className="badge badge-amber text-[10px]">Not Connected</span>
                )}
              </div>
              <div className="text-[12px] text-[var(--text-secondary)]">
                {qbConnection
                  ? `Connected to QuickBooks company ${qbConnection.realm_id}.`
                  : "Connect QuickBooks to automatically sync monthly revenue, expenses, and debt service."}
              </div>
              {qbConnection && (
                <div className="text-[11px] text-[var(--text-muted)] mt-1">
                  {formatQuickBooksSyncStatus(qbConnection)}
                </div>
              )}
              {quickBooksBlockedByPlaid && !qbConnection && (
                <div className="text-[11px] text-amber-200 mt-1">
                  Disconnect all bank accounts before connecting QuickBooks for this store.
                </div>
              )}
            </div>
            {qbConnection ? (
              <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                <ReadOnlyGuard>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => syncQuickBooks()}
                    disabled={syncingQb || disconnectingQb}
                  >
                    {syncingQb ? "Syncing…" : "Sync Now"}
                  </button>
                </ReadOnlyGuard>
                <ReadOnlyGuard>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setShowQbDisconnectConfirm(true)}
                    disabled={disconnectingQb || syncingQb}
                  >
                    Disconnect
                  </button>
                </ReadOnlyGuard>
              </div>
            ) : (
              <ReadOnlyGuard>
                <button
                  type="button"
                  className={clsx(
                    "btn-primary flex-shrink-0",
                    (!store?.id || quickBooksBlockedByPlaid) && "pointer-events-none opacity-50"
                  )}
                  onClick={initiateQuickBooksConnect}
                  disabled={!store?.id || connectingQb || quickBooksBlockedByPlaid}
                >
                  {connectingQb ? "Connecting…" : "Connect QuickBooks"}
                </button>
              </ReadOnlyGuard>
            )}
          </div>

          {showQbDisconnectConfirm && (
            <div className="card border border-red-500/40 bg-red-500/5">
              <div className="text-[13px] font-semibold text-slate-100 mb-1">Disconnect QuickBooks?</div>
              <p className="text-[12px] text-[var(--text-secondary)]">
                This will stop automatic syncing. Previously synced data will remain in your P&L.
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  className="btn-outline text-[12px]"
                  onClick={() => setShowQbDisconnectConfirm(false)}
                  disabled={disconnectingQb}
                >
                  Cancel
                </button>
                <ReadOnlyGuard>
                  <button
                    type="button"
                    className="text-[12px] px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700"
                    onClick={() => void disconnectQuickBooks()}
                    disabled={disconnectingQb}
                  >
                    {disconnectingQb ? "Disconnecting…" : "Disconnect QuickBooks"}
                  </button>
                </ReadOnlyGuard>
              </div>
            </div>
          )}

          {showQbSourceWarning && (
            <div className="card border border-amber-500/40 bg-amber-500/5">
              <div className="text-[13px] font-semibold text-slate-100 mb-1">Switch data source to QuickBooks?</div>
              <p className="text-[12px] text-[var(--text-secondary)]">
                This store currently uses Bank Import for financial data. Connecting QuickBooks will make QuickBooks
                the primary source going forward — bank-imported months won&apos;t be affected unless you manually edit
                them, but new data will come from QuickBooks.
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  className="btn-outline text-[12px]"
                  onClick={() => setShowQbSourceWarning(false)}
                  disabled={connectingQb}
                >
                  Cancel
                </button>
                <ReadOnlyGuard>
                  <button
                    type="button"
                    className="btn-primary text-[12px]"
                    onClick={confirmQuickBooksConnect}
                    disabled={connectingQb}
                  >
                    {connectingQb ? "Continuing…" : "Continue with QuickBooks"}
                  </button>
                </ReadOnlyGuard>
              </div>
            </div>
          )}

          {qbSyncResult && (
            <div
              className={clsx(
                "card border",
                qbSyncResult.unmappedAccounts.length > 0 || qbSyncResult.skippedMonths.length > 0
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-green-500/40 bg-green-500/5"
              )}
            >
              <div className="text-[13px] font-semibold text-slate-100 mb-1">Sync complete</div>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {qbSyncResult.monthsSynced === 1
                  ? "1 month of P&L data was imported from QuickBooks."
                  : `${qbSyncResult.monthsSynced} months of P&L data were imported from QuickBooks.`}
              </p>
              {qbSyncResult.skippedMonths.length > 0 && (
                <div className="mt-3 text-[12px] text-amber-200">
                  <p className="font-medium">
                    {qbSyncResult.skippedMonths.length} month{qbSyncResult.skippedMonths.length === 1 ? "" : "s"}{" "}
                    skipped because {qbSyncResult.skippedMonths.length === 1 ? "it was" : "they were"} manually edited:{" "}
                    {qbSyncResult.skippedMonths.map((month) => formatSkippedMonthLabel(month.year, month.month)).join(", ")}.
                  </p>
                  <p className="mt-1 text-[var(--text-secondary)]">
                    Force resync will replace your manual edits with QuickBooks data for the selected month
                    {qbSyncResult.skippedMonths.length === 1 ? "" : "s"}.
                  </p>
                  <div className="mt-3 space-y-2">
                    {qbSyncResult.skippedMonths.map((month) => {
                      const key = monthKey(month.year, month.month);
                      const isResyncing = forceResyncingMonths.has(key);
                      return (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span>{formatSkippedMonthLabel(month.year, month.month)}</span>
                          <ReadOnlyGuard>
                            <button
                              type="button"
                              className="btn-outline text-[11px]"
                              onClick={() => forceResyncQuickBooks([month])}
                              disabled={syncingQb || isResyncing}
                            >
                              {isResyncing ? "Resyncing…" : "Force resync"}
                            </button>
                          </ReadOnlyGuard>
                        </div>
                      );
                    })}
                  </div>
                  {qbSyncResult.skippedMonths.length > 1 && (
                    <ReadOnlyGuard>
                      <button
                        type="button"
                        className="btn-outline mt-3 text-[12px]"
                        onClick={() => forceResyncQuickBooks(qbSyncResult.skippedMonths)}
                        disabled={syncingQb}
                      >
                        {syncingQb ? "Resyncing…" : "Force resync all skipped months"}
                      </button>
                    </ReadOnlyGuard>
                  )}
                </div>
              )}
              {qbSyncResult.unmappedAccounts.length > 0 && (
                <div className="mt-3 text-[12px] text-amber-200">
                  <p className="font-medium">
                    {qbSyncResult.unmappedAccounts.length} QuickBooks{" "}
                    {qbSyncResult.unmappedAccounts.length === 1 ? "account" : "accounts"} couldn&apos;t be
                    matched.
                  </p>
                  <p className="mt-1 text-[var(--text-secondary)]">
                    Add mapping rules for: {qbSyncResult.unmappedAccounts.join(", ")}.
                  </p>
                  <button
                    type="button"
                    className="btn-outline mt-3 text-[12px]"
                    onClick={scrollToQbAccountMapping}
                  >
                    Go to Account Mapping
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="card" id="qb-account-mapping">
            <div className="section-title">Account Mapping</div>
            <p className="text-[12px] text-[var(--text-muted)] mb-4">
              Map QuickBooks accounts to LaundroCFO fields. Saved to{" "}
              <code className="text-blue-300 text-[11px] bg-blue-500/10 px-1 rounded">quickbooks_mapping</code>.
            </p>
            <div className="table-scroll">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[var(--text-secondary)]border-b border-[var(--border)]">
                    <th className="pb-3 pr-4 font-medium">QuickBooks Account</th>
                    <th className="pb-3 font-medium">LaundroCFO Field</th>
                  </tr>
                </thead>
                <tbody>
                  {qbMappings.map((row, idx) => (
                    <tr key={idx} className="border-b border-[var(--border)]">
                      <td className="py-2.5 pr-4">
                        <input
                          id="financials-qbmappings"
                          type="text"
                          value={row.qb_account_name}
                          onChange={(e) =>
                            setQbMappings((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, qb_account_name: e.target.value } : m))
                            )
                          }
                          onKeyDown={preventEnterSubmit}
                          className={clsx(INPUT_CLASS, "py-1.5 text-[12px]")}
                        />
                      </td>
                      <td className="py-2.5">
                        <select
                          id="financials-qbmappings-2"
                          value={row.laundrocfo_field}
                          onChange={(e) =>
                            setQbMappings((prev) =>
                              prev.map((m, i) =>
                                i === idx ? { ...m, laundrocfo_field: e.target.value as PlCategoryField } : m
                              )
                            )
                          }
                          className={clsx(INPUT_CLASS, "py-1.5 text-[12px]")}
                        >
                          {PL_CATEGORY_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {CATEGORY_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="btn-outline"
                onClick={() =>
                  setQbMappings((prev) => [...prev, { qb_account_name: "", laundrocfo_field: "other_expenses" }])
                }
              >
                Add Row
              </button>
              <button type="button" className="btn-primary" onClick={saveQBMappings} disabled={saving}>
                {saving ? "Saving…" : "Save Mappings"}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Integration Roadmap</div>
            <div className="space-y-2">
              {ROADMAP.map((item) => (
                <div
                  key={item.feature}
                  className="flex items-center justify-between py-2.5border-b border-[var(--border)] last:border-b-0"
                >
                  <span className="text-[13px] text-[var(--text-secondary)]">{item.feature}</span>
                  {item.status === "live" ? (
                    <span className="badge badge-green text-[10px]">Live</span>
                  ) : (
                    <span className="badge badge-blue text-[10px]">Coming Soon</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
