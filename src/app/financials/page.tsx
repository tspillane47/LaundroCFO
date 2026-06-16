"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { toNum, toNullableText } from "@/lib/formHelpers";
import { useStores } from "@/lib/store-context";
import { fmtDollar, fmtMultiple, fmtPct } from "@/lib/calculations";
import { MetricCard } from "@/components/ui/MetricCard";
import { MetricTooltip } from "@/components/ui/MetricTooltip";
import {
  financials as demoFinancials,
} from "@/lib/data";
import { INPUT_CLASS, preventEnterSubmit } from "@/components/occupancy/shared";
import { PageError } from "@/components/ui/PageError";
import {
  type BankTransaction,
  type CalculatedMonthly,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
  type PlCategoryField,
  type RatioBenchmark,
  type StoreFinancialProfile,
  MONTH_NAMES,
  MONTH_SHORT,
  PL_CATEGORY_FIELDS,
  buildRatioBenchmarks,
  buildUtilitiesLookup,
  calcMonthlyWithUtilities,
  calcRatios,
  calcTtmMetrics,
  calcYoYMetrics,
  dscrSubColor,
  dscrTextColor,
  emptyMonthlyForm,
  enrichMonthlyRecords,
  getChartRecords,
  monthChartLabel,
  monthKey,
  ratioStatusColor,
  recordToForm,
  sortRecordsDesc,
  suggestTransactionCategory,
  parseBankCsv,
  inferTransactionType,
  normalizeVendorPattern,
  categorizeWithRules,
  findMatchingVendorRule,
  findMatchingAmountRule,
  isGenericTransactionDescription,
  mapBankCategoryToPlField,
  mapBankCategoryToUtilityField,
  mapBankCategoryToRevenueField,
  sumRevenueBreakdown,
  isCategoryReadyToPost,
  getImportCategoriesForType,
  markDuplicateTransactions,
  UTILITY_IMPORT_CATEGORIES,
  INCOME_IMPORT_CATEGORIES,
  BANK_IMPORT_CATEGORY_LABELS,
  type TransactionType,
  type BankImportCategory,
  type CategorizationRule,
  type RuleType,
  type RuleMatchKind,
  type UtilityImportField,
  type RevenueBreakdownField,
} from "@/lib/financials";

type TabId = "pl" | "trends" | "ratios" | "bank" | "quickbooks";
type MonthlyForm = Omit<MonthlyFinancialRecord, "id" | "store_id">;
type NumericFormField = Exclude<keyof MonthlyForm, "notes">;

type StagedTransaction = {
  tempId: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  type: TransactionType;
  category: BankImportCategory;
  suggested: BankImportCategory;
  ruleApplied?: RuleMatchKind;
  possibleDuplicate?: boolean;
};

type ReviewTransaction = {
  key: string;
  isStaged: boolean;
  transaction_date: string;
  description: string | null;
  amount: number;
  type: TransactionType;
  category: BankImportCategory;
  suggested: BankImportCategory;
  ruleApplied?: RuleMatchKind;
  possibleDuplicate?: boolean;
  staged?: StagedTransaction;
  bank?: BankTransaction;
};

type TransactionGroup = {
  groupKey: string;
  vendorPattern: string;
  description: string;
  count: number;
  totalAmount: number;
  type: TransactionType;
  category: BankImportCategory;
  suggested: BankImportCategory;
  ruleApplied: RuleMatchKind;
  items: ReviewTransaction[];
};

type QBMappingRow = {
  id?: string;
  qb_account_name: string;
  laundrocfo_field: PlCategoryField;
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
  { key: "supplies", label: "Supplies" },
  { key: "repairs_maintenance", label: "Repairs & Maintenance" },
  { key: "rent", label: "Rent" },
  { key: "payroll", label: "Payroll" },
  { key: "insurance_expense", label: "Insurance" },
  { key: "marketing", label: "Advertising / Marketing" },
  { key: "professional_fees", label: "Professional Fees" },
  { key: "bank_charges", label: "Bank Charges" },
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
  marketing: "Advertising / Marketing",
  professional_fees: "Professional Fees",
  bank_charges: "Bank Charges",
  other_expenses: "Other Expenses",
  debt_service: "Debt Service",
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
  { feature: "QuickBooks Online sync", status: "soon" as const },
  { feature: "Plaid bank feed", status: "soon" as const },
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
    <div className="bg-[#1e2a3a] border border-white/10 rounded-lg p-3 text-xs">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-slate-300">{entry.name}:</span>
          <span className="text-slate-100 font-semibold">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function RatioCard({ item }: { item: RatioBenchmark }) {
  const max = item.progressMax ?? (item.unit === "x" ? 3 : item.unit === "$" ? item.top25 * 1.5 : 30);
  const progress = Math.min(100, Math.max(0, (item.value / max) * 100));
  const isGood = item.lowerIsBetter
    ? item.value <= item.top25
    : item.value >= item.top25;
  const isWarn = item.lowerIsBetter
    ? item.value <= item.bottom25
    : item.value >= item.bottom25;
  const color = isGood ? "text-green-400" : isWarn ? "text-amber-400" : "text-red-400";
  const barColor = isGood ? "bg-green-500" : isWarn ? "bg-amber-500" : "bg-red-500";

  const display =
    item.unit === "$"
      ? `$${Math.round(item.value).toLocaleString()}`
      : item.unit === "x"
        ? fmtMultiple(item.value)
        : fmtPct(item.value);

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
      <div className="text-[11px] text-slate-500 mt-1">Industry median: {benchDisplay}</div>
      <div className="progress-bar mt-3">
        <div className={clsx("h-full rounded-full", barColor)} style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600 mt-1.5">
        <span>Top 25%: {item.unit === "$" ? `$${Math.round(item.top25).toLocaleString()}` : item.unit === "x" ? fmtMultiple(item.top25) : fmtPct(item.top25)}</span>
        <span>Bottom 25%: {item.unit === "$" ? `$${Math.round(item.bottom25).toLocaleString()}` : item.unit === "x" ? fmtMultiple(item.bottom25) : fmtPct(item.bottom25)}</span>
      </div>
    </div>
  );
}

function normalizeTransactionAmount(amount: number): number {
  return Math.abs(amount);
}

function emptyUtilityDelta(): Record<UtilityImportField, number> {
  return { water: 0, gas: 0, electric: 0, sewer: 0, trash: 0, internet: 0 };
}

function monthPeriodKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function parseMonthPeriodKey(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

function CategoryBadge({ category }: { category: BankImportCategory }) {
  if (category === "needs_review") {
    return <span className="badge badge-amber text-[10px]">{BANK_IMPORT_CATEGORY_LABELS[category]}</span>;
  }
  return <span className="badge badge-blue text-[10px]">{BANK_IMPORT_CATEGORY_LABELS[category]}</span>;
}

function TypeBadge({ type }: { type: TransactionType }) {
  return (
    <span
      className={clsx(
        "badge text-[10px]",
        type === "income" ? "badge-green" : "badge-red"
      )}
    >
      {type === "income" ? "Income" : "Expense"}
    </span>
  );
}

function RuleAppliedBadge({ kind }: { kind: RuleMatchKind }) {
  if (!kind) return null;
  return (
    <span className="badge badge-green text-[10px]">
      Rule Applied ({kind === "amount" ? "Amount" : "Vendor"})
    </span>
  );
}

function RuleFormPanel({
  type,
  vendorPattern,
  amount,
  category,
  ruleType,
  ruleAmount,
  ruleTolerance,
  onRuleTypeChange,
  onCategoryChange,
  onAmountChange,
  onToleranceChange,
  onSave,
  onCancel,
  saving,
  message,
}: {
  type: TransactionType;
  vendorPattern: string;
  amount: number;
  category: BankImportCategory;
  ruleType: RuleType;
  ruleAmount: string;
  ruleTolerance: string;
  onRuleTypeChange: (t: RuleType) => void;
  onCategoryChange: (c: BankImportCategory) => void;
  onAmountChange: (v: string) => void;
  onToleranceChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  message: { type: "error" | "success"; text: string } | null;
}) {
  return (
    <div className="space-y-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
          <input
            type="radio"
            name="rule-type"
            checked={ruleType === "vendor"}
            onChange={() => onRuleTypeChange("vendor")}
            className="border-white/20"
          />
          By vendor name
        </label>
        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
          <input
            type="radio"
            name="rule-type"
            checked={ruleType === "amount"}
            onChange={() => onRuleTypeChange("amount")}
            className="border-white/20"
          />
          By amount
        </label>
      </div>
      {ruleType === "vendor" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-300">
            Always categorize transactions containing{" "}
            <span className="font-mono text-slate-100">{vendorPattern}</span> as:
          </span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as BankImportCategory)}
            className={clsx(INPUT_CLASS, "w-44 py-1.5 text-[12px]")}
          >
            {getImportCategoriesForType(type).map((f) => (
              <option key={f} value={f}>
                {BANK_IMPORT_CATEGORY_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-300">
            Always categorize {type === "income" ? "income" : "expense"} transactions of
          </span>
          <span className="text-slate-400">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={ruleAmount}
            onChange={(e) => onAmountChange(e.target.value)}
            className={clsx(INPUT_CLASS, "w-28 py-1.5 text-[12px] tabular-nums")}
          />
          <span className="text-slate-400">within $</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={ruleTolerance}
            onChange={(e) => onToleranceChange(e.target.value)}
            className={clsx(INPUT_CLASS, "w-20 py-1.5 text-[12px] tabular-nums")}
          />
          <span className="text-slate-300">as:</span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as BankImportCategory)}
            className={clsx(INPUT_CLASS, "w-44 py-1.5 text-[12px]")}
          >
            {getImportCategoriesForType(type).map((f) => (
              <option key={f} value={f}>
                {BANK_IMPORT_CATEGORY_LABELS[f]}
              </option>
            ))}
          </select>
          <span className="text-slate-500">(from ${amount.toFixed(2)})</span>
        </div>
      )}
      {message && (
        <div
          className={clsx(
            "rounded-lg px-3 py-2 text-[12px]",
            message.type === "error"
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : "bg-green-500/10 border border-green-500/20 text-green-400"
          )}
        >
          {message.text}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary text-[11px]" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save Rule"}
        </button>
        <button type="button" className="btn-outline text-[11px]" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function amountRuleVendorPattern(type: TransactionType, amount: number): string {
  return `__AMOUNT__:${type}:${amount.toFixed(2)}`;
}

export default function FinancialsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedStore, isAllStores, stores, loading: storesLoading } = useStores();

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
  const [utilityRecords, setUtilityRecords] = useState<MonthlyUtilityRecord[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [stagedTransactions, setStagedTransactions] = useState<StagedTransaction[]>([]);
  const [selectedTxnKeys, setSelectedTxnKeys] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<BankImportCategory>("self_service_revenue");
  const [groupSimilar, setGroupSimilar] = useState(true);
  const [categorizationRules, setCategorizationRules] = useState<CategorizationRule[]>([]);
  const [ruleFormKey, setRuleFormKey] = useState<string | null>(null);
  const [ruleFormCategory, setRuleFormCategory] = useState<BankImportCategory>("self_service_revenue");
  const [ruleFormType, setRuleFormType] = useState<RuleType>("vendor");
  const [ruleFormAmount, setRuleFormAmount] = useState("");
  const [ruleFormTolerance, setRuleFormTolerance] = useState("0.01");
  const [ruleFormTxnType, setRuleFormTxnType] = useState<TransactionType>("expense");
  const [ruleFormVendorPattern, setRuleFormVendorPattern] = useState("");
  const [ruleFormSourceAmount, setRuleFormSourceAmount] = useState(0);
  const [ruleFormSaving, setRuleFormSaving] = useState(false);
  const [ruleFormMessage, setRuleFormMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    null
  );
  const [showManageRules, setShowManageRules] = useState(false);
  const [qbMappings, setQbMappings] = useState<QBMappingRow[]>(DEFAULT_QB_MAPPINGS);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MonthlyForm>(() => emptyMonthlyForm());
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [clearAllStoreNameInput, setClearAllStoreNameInput] = useState("");
  const [duplicateImportCount, setDuplicateImportCount] = useState(0);
  const [posting, setPosting] = useState(false);
  const [postingCount, setPostingCount] = useState(0);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  const loadData = useCallback(async () => {
    if (!selectedStore?.id) {
      setStore(null);
      setRecords([]);
      setBankTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(false);

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
      { data: utilitiesData, error: utilitiesError },
      { data: bankData, error: bankError },
      { data: mappingData, error: mappingError },
      { data: rulesData, error: rulesError },
    ] = await Promise.all([
      supabase.from("stores").select("*").eq("id", selectedStore.id).single(),
      supabase
        .from("monthly_financials")
        .select("*")
        .eq("store_id", selectedStore.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
      supabase
        .from("monthly_utilities")
        .select("year, month, water, gas, electric, sewer, trash, internet")
        .eq("store_id", selectedStore.id),
      supabase
        .from("bank_transactions")
        .select("*")
        .eq("store_id", selectedStore.id)
        .eq("is_reviewed", false)
        .order("transaction_date", { ascending: false }),
      supabase.from("quickbooks_mapping").select("*").eq("store_id", selectedStore.id),
      supabase
        .from("categorization_rules")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const errors = [storeError, financialsError, utilitiesError, bankError, mappingError, rulesError]
      .filter(Boolean)
      .map((e) => e!.message);
    if (errors.length > 0) setError(errors.join(" · "));

    setStore(storeData as StoreFinancialProfile);
    const utilityRows = (utilitiesData ?? []) as MonthlyUtilityRecord[];
    setUtilityRecords(utilityRows);
    const utilitiesLookup = buildUtilitiesLookup(utilityRows);
    const sorted = enrichMonthlyRecords(
      sortRecordsDesc((financialsData ?? []) as MonthlyFinancialRecord[]),
      utilitiesLookup
    );
    setRecords(sorted);
    setBankTransactions((bankData ?? []) as BankTransaction[]);
    setCategorizationRules((rulesData ?? []) as CategorizationRule[]);

    if ((mappingData ?? []).length > 0) {
      setQbMappings(
        (mappingData as { id: string; qb_account_name: string; laundrocfo_field: PlCategoryField }[]).map((m) => ({
          id: m.id,
          qb_account_name: m.qb_account_name,
          laundrocfo_field: m.laundrocfo_field,
        }))
      );
    } else {
      setQbMappings(DEFAULT_QB_MAPPINGS);
    }

    if (sorted.length > 0) {
      setSelectedYear(sorted[0].year);
      setSelectedMonth(sorted[0].month);
    }

    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id, supabase]);

  useEffect(() => {
    if (storesLoading) return;
    loadData();
  }, [storesLoading, loadData]);

  const ttm = useMemo(() => calcTtmMetrics(records), [records]);
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

  const yearChartData = useMemo(
    () =>
      yearRecords.map((r, i) => ({
        label: MONTH_SHORT[i],
        revenue: r?.revenue ?? 0,
        ebitda: r?.ebitda ?? 0,
      })),
    [yearRecords]
  );

  const trendChartData = useMemo(() => {
    return getChartRecords(records, 24).map((r) => ({
      label: monthChartLabel(r.year, r.month),
      revenue: r.revenue,
      ebitda: r.ebitda,
      ebitdaMargin: r.ebitdaMargin,
    }));
  }, [records]);

  const utilitiesLookup = useMemo(() => buildUtilitiesLookup(utilityRecords), [utilityRecords]);

  const liveCalc = useMemo(
    () =>
      calcMonthlyWithUtilities(
        {
          id: selectedRecord?.id ?? "",
          store_id: store?.id ?? "",
          ...form,
          utilities: selectedRecord?.utilities ?? 0,
          year: selectedYear,
          month: selectedMonth,
        },
        utilitiesLookup.get(monthKey(selectedYear, selectedMonth))
      ),
    [form, selectedRecord?.id, selectedRecord?.utilities, store?.id, selectedYear, selectedMonth, utilitiesLookup]
  );

  const monthsWithData = useMemo(
    () => new Set(records.filter((r) => r.year === selectedYear).map((r) => r.month)),
    [records, selectedYear]
  );

  const reviewTransactions = useMemo((): ReviewTransaction[] => {
    const staged: ReviewTransaction[] = stagedTransactions.map((txn) => ({
      key: txn.tempId,
      isStaged: true,
      transaction_date: txn.transaction_date,
      description: txn.description,
      amount: txn.amount,
      type: txn.type,
      category: txn.category,
      suggested: txn.suggested,
      ruleApplied: txn.ruleApplied,
      possibleDuplicate: txn.possibleDuplicate,
      staged: txn,
    }));

    const bank: ReviewTransaction[] = bankTransactions.map((txn) => {
      const type = inferTransactionType(txn.amount, txn.category);
      const amount = Math.abs(txn.amount);
      const storedCategory = txn.category as BankImportCategory | null;
      const { category, suggested, ruleApplied } = categorizeWithRules(
        txn.description,
        type,
        amount,
        categorizationRules
      );
      if (ruleApplied) {
        return {
          key: txn.id,
          isStaged: false,
          transaction_date: txn.transaction_date,
          description: txn.description,
          amount,
          type,
          category,
          suggested: category,
          ruleApplied,
          bank: txn,
        };
      }
      const keywordSuggested = suggestTransactionCategory(txn.description, type);
      return {
        key: txn.id,
        isStaged: false,
        transaction_date: txn.transaction_date,
        description: txn.description,
        amount,
        type,
        category: storedCategory ?? keywordSuggested,
        suggested: keywordSuggested,
        ruleApplied: false,
        bank: txn,
      };
    });

    return [...staged, ...bank];
  }, [stagedTransactions, bankTransactions, categorizationRules]);

  const transactionGroups = useMemo((): TransactionGroup[] => {
    const map = new Map<string, TransactionGroup>();

    for (const txn of reviewTransactions) {
      const vendorPattern = normalizeVendorPattern(txn.description);
      const groupKey = isGenericTransactionDescription(txn.description)
        ? `__individual__::${txn.key}`
        : `${vendorPattern || "(no description)"}::${txn.type}`;

      const existing = map.get(groupKey);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += txn.amount;
        existing.items.push(txn);
        if (txn.ruleApplied) existing.ruleApplied = txn.ruleApplied;
        const categories = new Set(existing.items.map((i) => i.category));
        if (categories.size === 1) existing.category = txn.category;
      } else {
        map.set(groupKey, {
          groupKey,
          vendorPattern: vendorPattern || "(no description)",
          description: txn.description ?? vendorPattern ?? "(no description)",
          count: 1,
          totalAmount: txn.amount,
          type: txn.type,
          category: txn.category,
          suggested: txn.suggested,
          ruleApplied: txn.ruleApplied ?? false,
          items: [txn],
        });
      }
    }

    const groups = Array.from(map.values()).sort((a, b) => b.count - a.count);
    console.log(
      "[Bank Import] Grouping:",
      reviewTransactions.length,
      "transactions ->",
      groups.length,
      "groups"
    );
    return groups;
  }, [reviewTransactions]);

  const selectableReviewKeys = useMemo(
    () => reviewTransactions.filter((t) => !t.possibleDuplicate).map((t) => t.key),
    [reviewTransactions]
  );
  const allSelected =
    selectableReviewKeys.length > 0 &&
    selectableReviewKeys.every((k) => selectedTxnKeys.has(k));
  const someSelected = selectedTxnKeys.size > 0;
  const duplicateReviewCount = useMemo(
    () => reviewTransactions.filter((t) => t.possibleDuplicate).length,
    [reviewTransactions]
  );

  function openMonthForm(month: number) {
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
    if (!store?.id || !userId || saving || saveStatus === "success") return;
    setSaving(true);
    setSaveStatus("idle");
    setError("");
    setSuccess("");

    try {
      const payload = {
        store_id: store.id,
        user_id: userId,
        year: toNum(selectedYear),
        month: toNum(selectedMonth),
        self_service_revenue: toNum(selectedRecord?.self_service_revenue ?? 0),
        wdf_revenue: toNum(selectedRecord?.wdf_revenue ?? 0),
        commercial_revenue: toNum(selectedRecord?.commercial_revenue ?? 0),
        vending_revenue: toNum(selectedRecord?.vending_revenue ?? 0),
        other_revenue: toNum(selectedRecord?.other_revenue ?? 0),
        revenue: toNum(form.revenue),
        utilities: selectedRecord?.utilities ?? 0,
        rent: toNum(form.rent),
        payroll: toNum(form.payroll),
        repairs_maintenance: toNum(form.repairs_maintenance),
        insurance_expense: toNum(form.insurance_expense),
        supplies: toNum(form.supplies),
        marketing: toNum(form.marketing),
        professional_fees: toNum(form.professional_fees),
        bank_charges: toNum(form.bank_charges),
        other_expenses: toNum(form.other_expenses),
        debt_service: toNum(form.debt_service),
        notes: toNullableText(form.notes),
      };

      if (selectedRecord?.id) {
        const { error: updateError } = await supabase
          .from("monthly_financials")
          .update(payload)
          .eq("id", selectedRecord.id);
        if (updateError) {
          console.error("Monthly financials save error:", updateError);
          setSaveStatus("error");
          setError("We couldn't save this. Please try again.");
          setSaving(false);
          return;
        }
      } else {
        const { error: insertError } = await supabase.from("monthly_financials").insert(payload);
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
      setTimeout(() => {
        setShowForm(false);
        setSaveStatus("idle");
        setSaving(false);
      }, 600);
      await loadData();
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
      console.log("[Bank Import] CSV parsed:", parsed.length, "transactions");
      if (parsed.length === 0) {
        setError(
          "Could not parse CSV. Expected columns: Processed Date, Description, Credit or Debit, Amount."
        );
        return;
      }

      if (!store?.id) {
        setError("Select a store before importing transactions.");
        return;
      }

      let rules = categorizationRules;
      if (userId) {
        const { data: freshRules } = await supabase
          .from("categorization_rules")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (freshRules) {
          rules = freshRules as CategorizationRule[];
          setCategorizationRules(rules);
        }
      }

      const { data: existingBankRows } = await supabase
        .from("bank_transactions")
        .select("transaction_date, amount, category")
        .eq("store_id", store.id);

      const existingForDedup = [
        ...(existingBankRows ?? []).map((row) => ({
          transaction_date: row.transaction_date,
          amount: Math.abs(row.amount),
          type: inferTransactionType(row.amount, row.category),
        })),
        ...bankTransactions.map((txn) => ({
          transaction_date: txn.transaction_date,
          amount: Math.abs(txn.amount),
          type: inferTransactionType(txn.amount, txn.category),
        })),
        ...stagedTransactions.map((txn) => ({
          transaction_date: txn.transaction_date,
          amount: txn.amount,
          type: txn.type,
        })),
      ];

      const parsedForDedup = parsed.map((row) => ({
        transaction_date: row.date,
        amount: row.amount,
        type: row.type,
      }));
      const withDuplicateFlags = markDuplicateTransactions(parsedForDedup, existingForDedup);
      const duplicateCount = withDuplicateFlags.filter((row) => row.possibleDuplicate).length;
      setDuplicateImportCount(duplicateCount);

      const baseId = Date.now();
      const staged: StagedTransaction[] = withDuplicateFlags.map((row, i) => {
        const { category, suggested, ruleApplied } = categorizeWithRules(
          parsed[i].description,
          row.type,
          row.amount,
          rules
        );
        return {
          tempId: `csv-${baseId}-${i}`,
          transaction_date: row.transaction_date,
          description: parsed[i].description,
          amount: row.amount,
          type: row.type,
          category,
          suggested,
          ruleApplied,
          possibleDuplicate: row.possibleDuplicate,
        };
      });
      setStagedTransactions((prev) => [...staged, ...prev]);
      const dupMsg =
        duplicateCount > 0
          ? ` ${duplicateCount} possible duplicate${duplicateCount === 1 ? "" : "s"} flagged — review before posting.`
          : "";
      setSuccess(`Parsed ${staged.length} transaction${staged.length === 1 ? "" : "s"} from CSV.${dupMsg}`);
    };
    reader.readAsText(file);
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedTxnKeys(checked ? new Set(selectableReviewKeys) : new Set());
  }

  function toggleSelectKey(key: string, checked: boolean) {
    setSelectedTxnKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function updateReviewCategory(key: string, category: BankImportCategory) {
    setStagedTransactions((prev) =>
      prev.map((t) => (t.tempId === key ? { ...t, category } : t))
    );
    setBankTransactions((prev) =>
      prev.map((t) => (t.id === key ? { ...t, category } : t))
    );
    const bankTxn = bankTransactions.find((t) => t.id === key);
    if (bankTxn) {
      supabase.from("bank_transactions").update({ category }).eq("id", key);
    }
  }

  function applyBulkCategory() {
    const keys = Array.from(selectedTxnKeys);
    setStagedTransactions((prev) =>
      prev.map((t) => (keys.includes(t.tempId) ? { ...t, category: bulkCategory } : t))
    );
    setBankTransactions((prev) =>
      prev.map((t) => (keys.includes(t.id) ? { ...t, category: bulkCategory } : t))
    );
    keys.forEach((key) => {
      if (bankTransactions.some((t) => t.id === key)) {
        supabase.from("bank_transactions").update({ category: bulkCategory }).eq("id", key);
      }
    });
    setSuccess(`Applied ${BANK_IMPORT_CATEGORY_LABELS[bulkCategory]} to ${keys.length} transaction${keys.length === 1 ? "" : "s"}.`);
  }

  async function ignoreAllTransactions() {
    const count = reviewCount;
    if (count === 0) return;
    const confirmed = window.confirm(
      `This will remove all ${count} pending transactions from this import. This cannot be undone. Continue?`
    );
    if (!confirmed) return;

    setStagedTransactions([]);
    for (const txn of bankTransactions) {
      await supabase.from("bank_transactions").update({ is_reviewed: true }).eq("id", txn.id);
    }
    setBankTransactions([]);
    setSelectedTxnKeys(new Set());
    setSuccess(`Removed ${count} pending transaction${count === 1 ? "" : "s"}.`);
  }

  function openRuleForm(
    key: string,
    category: BankImportCategory,
    type: TransactionType,
    vendorPattern: string,
    amount: number
  ) {
    setRuleFormKey(key);
    setRuleFormCategory(category === "needs_review" ? (type === "income" ? "self_service_revenue" : "water") : category);
    setRuleFormType("vendor");
    setRuleFormAmount(amount.toFixed(2));
    setRuleFormTolerance("0.01");
    setRuleFormTxnType(type);
    setRuleFormVendorPattern(vendorPattern);
    setRuleFormSourceAmount(amount);
    setRuleFormMessage(null);
  }

  async function saveCategorizationRule() {
    setRuleFormMessage(null);

    let activeUserId = userId;
    if (!activeUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRuleFormMessage({ type: "error", text: "Couldn't save rule. Please sign in and try again." });
        return;
      }
      activeUserId = user.id;
      setUserId(user.id);
    }

    if (ruleFormType === "vendor") {
      if (!ruleFormVendorPattern.trim()) {
        setRuleFormMessage({ type: "error", text: "Enter a vendor pattern for the rule." });
        return;
      }

      setRuleFormSaving(true);
      try {
        const { data, error: insertError } = await supabase
          .from("categorization_rules")
          .insert({
            user_id: activeUserId,
            vendor_pattern: ruleFormVendorPattern.trim().toUpperCase(),
            category: ruleFormCategory,
            rule_type: "vendor",
          })
          .select()
          .single();

        if (insertError) {
          console.error("[Bank Import] Failed to save vendor rule:", insertError);
          setRuleFormMessage({ type: "error", text: "Couldn't save rule. Please try again." });
          return;
        }

        const rule = data as CategorizationRule;
        setCategorizationRules((prev) => [rule, ...prev]);

        setStagedTransactions((prev) =>
          prev.map((t) => {
            if (findMatchingAmountRule([rule], t.amount, t.type)) return t;
            const normalized = normalizeVendorPattern(t.description);
            if (normalized.includes(rule.vendor_pattern.toUpperCase())) {
              return { ...t, category: ruleFormCategory, suggested: ruleFormCategory, ruleApplied: "vendor" as const };
            }
            return t;
          })
        );

        setRuleFormKey(null);
        setSuccess(`Rule saved: "${rule.vendor_pattern}" → ${BANK_IMPORT_CATEGORY_LABELS[ruleFormCategory]}`);
      } catch (err) {
        console.error("[Bank Import] Failed to save vendor rule:", err);
        setRuleFormMessage({ type: "error", text: "Couldn't save rule. Please try again." });
      } finally {
        setRuleFormSaving(false);
      }
      return;
    }

    const amount = Math.abs(parseFloat(ruleFormAmount));
    const tolerance = parseFloat(ruleFormTolerance);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRuleFormMessage({ type: "error", text: "Enter a valid amount for the rule." });
      return;
    }
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      setRuleFormMessage({ type: "error", text: "Enter a valid tolerance (0 or greater)." });
      return;
    }

    setRuleFormSaving(true);
    try {
      const { data, error: insertError } = await supabase
        .from("categorization_rules")
        .insert({
          user_id: activeUserId,
          vendor_pattern: amountRuleVendorPattern(ruleFormTxnType, amount),
          category: ruleFormCategory,
          rule_type: "amount",
          amount,
          amount_tolerance: tolerance,
          transaction_type: ruleFormTxnType,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[Bank Import] Failed to save amount rule:", insertError);
        setRuleFormMessage({ type: "error", text: "Couldn't save rule. Please try again." });
        return;
      }

      const rule = data as CategorizationRule;
      setCategorizationRules((prev) => [rule, ...prev]);

      setStagedTransactions((prev) =>
        prev.map((t) => {
          if (findMatchingAmountRule([rule], t.amount, t.type)) {
            return { ...t, category: ruleFormCategory, suggested: ruleFormCategory, ruleApplied: "amount" as const };
          }
          return t;
        })
      );

      setRuleFormKey(null);
      setRuleFormMessage(null);
      setSuccess("Rule saved");
    } catch (err) {
      console.error("[Bank Import] Failed to save amount rule:", err);
      setRuleFormMessage({ type: "error", text: "Couldn't save rule. Please try again." });
    } finally {
      setRuleFormSaving(false);
    }
  }

  async function deleteCategorizationRule(ruleId: string) {
    const { error: deleteError } = await supabase.from("categorization_rules").delete().eq("id", ruleId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setCategorizationRules((prev) => prev.filter((r) => r.id !== ruleId));
    setSuccess("Rule deleted.");
  }

  async function postReviewTransaction(txn: ReviewTransaction) {
    await postTransactionsBatch([txn]);
  }

  async function postSelectedTransactions() {
    const selected = reviewTransactions.filter((t) => selectedTxnKeys.has(t.key));
    if (selected.length === 0) return;
    await postTransactionsBatch(selected);
    setSelectedTxnKeys(new Set());
  }

  async function ignoreReviewTransaction(txn: ReviewTransaction) {
    if (txn.isStaged && txn.staged) {
      await ignoreTransaction(txn.staged, true);
    } else if (txn.bank) {
      await ignoreTransaction(txn.bank, false);
    }
  }

  async function ignoreSelectedTransactions() {
    const selected = reviewTransactions.filter((t) => selectedTxnKeys.has(t.key));
    for (const txn of selected) {
      await ignoreReviewTransaction(txn);
    }
    setSelectedTxnKeys(new Set());
  }

  async function postGroupTransactions(group: TransactionGroup) {
    if (!isCategoryReadyToPost(group.category)) {
      setError("Assign a category before posting. Transactions marked Needs Review cannot be posted.");
      return;
    }
    const txns = group.items.map((txn) => ({ ...txn, category: group.category }));
    await postTransactionsBatch(txns);
  }

  async function ignoreGroupTransactions(group: TransactionGroup) {
    for (const txn of group.items) {
      await ignoreReviewTransaction(txn);
    }
  }

  function updateGroupCategory(groupKey: string, category: BankImportCategory) {
    const group = transactionGroups.find((g) => g.groupKey === groupKey);
    if (!group) return;
    for (const txn of group.items) {
      updateReviewCategory(txn.key, category);
    }
  }

  async function clearMonthFinancialData() {
    if (!selectedRecord?.id || !store?.id) return;
    const monthLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
    const confirmed = window.confirm(
      `This will permanently delete all P&L data for ${monthLabel}. This cannot be undone.`
    );
    if (!confirmed) return;

    const { error: deleteError } = await supabase
      .from("monthly_financials")
      .delete()
      .eq("id", selectedRecord.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    invalidateValuationCache(store.id);
    setShowForm(false);
    setSuccess(`Cleared P&L data for ${monthLabel}.`);
    await loadData();
  }

  async function clearAllFinancialData() {
    if (!store?.id) return;
    const storeName = (store.name ?? "").trim();
    if (clearAllStoreNameInput.trim() !== storeName) {
      setError("Store name does not match. Type the exact store name to confirm.");
      return;
    }

    const { error: deleteError } = await supabase
      .from("monthly_financials")
      .delete()
      .eq("store_id", store.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    invalidateValuationCache(store.id);
    setShowClearAllConfirm(false);
    setClearAllStoreNameInput("");
    setShowForm(false);
    setSuccess(`Cleared all P&L data for ${storeName || "this store"}.`);
    await loadData();
  }

  async function saveStagedToBank() {
    if (!store?.id || !userId || stagedTransactions.length === 0) return;
    setSaving(true);
    const rows = stagedTransactions.map((t) => ({
      store_id: store.id,
      user_id: userId,
      transaction_date: t.transaction_date,
      description: t.description,
      amount: t.amount,
      category: t.category,
      is_reviewed: false,
    }));
    const { error: insertError } = await supabase.from("bank_transactions").insert(rows);
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    setStagedTransactions([]);
    setSuccess(`Saved ${rows.length} transactions to review queue.`);
    setSaving(false);
    await loadData();
  }

  async function postTransactionsBatch(transactions: ReviewTransaction[]) {
    if (!store?.id || !userId || transactions.length === 0) return;

    for (const txn of transactions) {
      if (!isCategoryReadyToPost(txn.category)) {
        setError("Assign a category before posting. Transactions marked Needs Review cannot be posted.");
        return;
      }
    }

    setPosting(true);
    setPostingCount(transactions.length);
    setError("");

    type BatchItem = {
      txn: ReviewTransaction;
      year: number;
      month: number;
      amount: number;
      importCategory: BankImportCategory;
    };

    const items: BatchItem[] = transactions.map((txn) => {
      const dateSource = txn.isStaged ? txn.staged! : txn.bank!;
      const date = new Date(dateSource.transaction_date.split("T")[0] + "T12:00:00");
      return {
        txn,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        amount: normalizeTransactionAmount(dateSource.amount),
        importCategory: txn.category,
      };
    });

    const utilityDeltaMap = new Map<string, Record<UtilityImportField, number>>();
    const revenueDeltaMap = new Map<string, Partial<Record<RevenueBreakdownField, number>>>();
    const financialDeltaMap = new Map<string, Partial<Record<PlCategoryField, number>>>();
    const stagedIdsToRemove = new Set<string>();
    const bankIdsToReview: string[] = [];

    for (const item of items) {
      const periodKey = monthPeriodKey(item.year, item.month);
      const revenueField = mapBankCategoryToRevenueField(item.importCategory);
      const utilityField = mapBankCategoryToUtilityField(item.importCategory);

      if (revenueField) {
        const deltas = revenueDeltaMap.get(periodKey) ?? {};
        deltas[revenueField] = (deltas[revenueField] ?? 0) + item.amount;
        revenueDeltaMap.set(periodKey, deltas);
      } else if (utilityField) {
        const deltas = utilityDeltaMap.get(periodKey) ?? emptyUtilityDelta();
        deltas[utilityField] += item.amount;
        utilityDeltaMap.set(periodKey, deltas);
      } else {
        const plField = mapBankCategoryToPlField(item.importCategory);
        if (!plField) {
          setPosting(false);
          setPostingCount(0);
          setError("This category cannot be posted. Re-categorize the transaction and try again.");
          return;
        }
        const fieldDeltas = financialDeltaMap.get(periodKey) ?? {};
        fieldDeltas[plField] = (fieldDeltas[plField] ?? 0) + item.amount;
        financialDeltaMap.set(periodKey, fieldDeltas);
      }

      if (item.txn.isStaged && item.txn.staged) {
        stagedIdsToRemove.add(item.txn.staged.tempId);
      } else if (item.txn.bank) {
        bankIdsToReview.push(item.txn.bank.id);
      }
    }

    try {
      const dbOps: PromiseLike<{ error: { message: string } | null }>[] = [];
      let existingUtilityRows: (MonthlyUtilityRecord & { notes?: string | null })[] = [];

      if (utilityDeltaMap.size > 0) {
        const { data: utilityData, error: utilityFetchError } = await supabase
          .from("monthly_utilities")
          .select("*")
          .eq("store_id", store.id);

        if (utilityFetchError) {
          setError(utilityFetchError.message);
          return;
        }

        existingUtilityRows = (utilityData ?? []) as (MonthlyUtilityRecord & { notes?: string | null })[];

        const utilityUpserts = Array.from(utilityDeltaMap.entries()).map(([periodKey, deltas]) => {
          const { year, month } = parseMonthPeriodKey(periodKey);
          const existing = existingUtilityRows.find((r) => r.year === year && r.month === month);
          return {
            store_id: store.id,
            user_id: userId,
            year: toNum(year),
            month: toNum(month),
            water: toNum((existing?.water ?? 0) + deltas.water),
            gas: toNum((existing?.gas ?? 0) + deltas.gas),
            electric: toNum((existing?.electric ?? 0) + deltas.electric),
            sewer: toNum((existing?.sewer ?? 0) + deltas.sewer),
            trash: toNum((existing?.trash ?? 0) + deltas.trash),
            internet: toNum((existing?.internet ?? 0) + deltas.internet),
            notes: existing?.notes ?? null,
          };
        });

        dbOps.push(
          supabase
            .from("monthly_utilities")
            .upsert(utilityUpserts, { onConflict: "store_id,year,month" })
        );
      }

      const financialResults: {
        year: number;
        month: number;
        payload: MonthlyFinancialRecord;
        error: { message: string } | null;
      }[] = [];

      for (const periodKey of Array.from(
        new Set([...Array.from(revenueDeltaMap.keys()), ...Array.from(financialDeltaMap.keys())])
      )) {
        const { year, month } = parseMonthPeriodKey(periodKey);
        const existing = records.find((r) => r.year === year && r.month === month);
        const base = existing
          ? recordToForm(existing)
          : { ...emptyMonthlyForm(store), year, month };
        const revenueDeltas = revenueDeltaMap.get(periodKey) ?? {};
        const fieldDeltas = financialDeltaMap.get(periodKey) ?? {};

        let updated = { ...base };
        for (const [field, delta] of Object.entries(fieldDeltas) as [PlCategoryField, number][]) {
          const currentFieldValue = (updated[field as NumericFormField] as number) ?? 0;
          updated = { ...updated, [field]: currentFieldValue + delta };
        }

        const breakdown = {
          self_service_revenue: toNum(
            (base.self_service_revenue ?? 0) + (revenueDeltas.self_service_revenue ?? 0)
          ),
          wdf_revenue: toNum((base.wdf_revenue ?? 0) + (revenueDeltas.wdf_revenue ?? 0)),
          commercial_revenue: toNum(
            (base.commercial_revenue ?? 0) + (revenueDeltas.commercial_revenue ?? 0)
          ),
          vending_revenue: toNum((base.vending_revenue ?? 0) + (revenueDeltas.vending_revenue ?? 0)),
          other_revenue: toNum((base.other_revenue ?? 0) + (revenueDeltas.other_revenue ?? 0)),
        };

        const payload = {
          store_id: store.id,
          user_id: userId,
          year: toNum(year),
          month: toNum(month),
          self_service_revenue: breakdown.self_service_revenue,
          wdf_revenue: breakdown.wdf_revenue,
          commercial_revenue: breakdown.commercial_revenue,
          vending_revenue: breakdown.vending_revenue,
          other_revenue: breakdown.other_revenue,
          revenue: sumRevenueBreakdown(breakdown),
          utilities: existing?.utilities ?? 0,
          rent: toNum(updated.rent),
          payroll: toNum(updated.payroll),
          repairs_maintenance: toNum(updated.repairs_maintenance),
          insurance_expense: toNum(updated.insurance_expense),
          supplies: toNum(updated.supplies),
          marketing: toNum(updated.marketing),
          professional_fees: toNum(updated.professional_fees),
          bank_charges: toNum(updated.bank_charges),
          other_expenses: toNum(updated.other_expenses),
          debt_service: toNum(updated.debt_service),
          notes: toNullableText(updated.notes),
        };

        if (existing?.id) {
          const { error } = await supabase
            .from("monthly_financials")
            .update(payload)
            .eq("id", existing.id);
          financialResults.push({
            year,
            month,
            payload: { ...payload, id: existing.id },
            error,
          });
        } else {
          const { data, error } = await supabase
            .from("monthly_financials")
            .insert(payload)
            .select()
            .single();
          financialResults.push({
            year,
            month,
            payload: (data ?? { ...payload, id: "" }) as MonthlyFinancialRecord,
            error,
          });
        }
      }

      if (bankIdsToReview.length > 0) {
        dbOps.push(
          supabase
            .from("bank_transactions")
            .update({ is_reviewed: true })
            .in("id", bankIdsToReview)
        );
      }

      const parallelResults = await Promise.all(dbOps);
      const firstDbError =
        parallelResults.find((r) => r.error)?.error ??
        financialResults.find((r) => r.error)?.error;

      if (firstDbError) {
        setError(firstDbError.message);
        return;
      }

      const nextUtilityRecords = [...utilityRecords];
      for (const [periodKey, deltas] of Array.from(utilityDeltaMap.entries())) {
        const { year, month } = parseMonthPeriodKey(periodKey);
        const idx = nextUtilityRecords.findIndex((r) => r.year === year && r.month === month);
        if (idx >= 0) {
          const row = nextUtilityRecords[idx];
          nextUtilityRecords[idx] = {
            ...row,
            water: row.water + deltas.water,
            gas: row.gas + deltas.gas,
            electric: row.electric + deltas.electric,
            sewer: row.sewer + deltas.sewer,
            trash: row.trash + deltas.trash,
            internet: row.internet + deltas.internet,
          };
        } else {
          nextUtilityRecords.push({
            year,
            month,
            water: deltas.water,
            gas: deltas.gas,
            electric: deltas.electric,
            sewer: deltas.sewer,
            trash: deltas.trash,
            internet: deltas.internet,
          });
        }
      }

      const nextRawRecords = [...records] as MonthlyFinancialRecord[];
      for (const result of financialResults) {
        const idx = nextRawRecords.findIndex(
          (r) => r.year === result.year && r.month === result.month
        );
        if (idx >= 0) {
          nextRawRecords[idx] = { ...nextRawRecords[idx], ...result.payload };
        } else {
          nextRawRecords.push(result.payload);
        }
      }

      const utilitiesLookup = buildUtilitiesLookup(nextUtilityRecords);
      const nextRecords = enrichMonthlyRecords(sortRecordsDesc(nextRawRecords), utilitiesLookup);
      const bankIdsSet = new Set(bankIdsToReview);

      setUtilityRecords(nextUtilityRecords);
      setRecords(nextRecords);
      setStagedTransactions((prev) => prev.filter((t) => !stagedIdsToRemove.has(t.tempId)));
      setBankTransactions((prev) => prev.filter((t) => !bankIdsSet.has(t.id)));
      setSuccess(
        transactions.length === 1
          ? "Posted 1 transaction to P&L."
          : `Posted ${transactions.length} transactions to P&L.`
      );
    } catch {
      setError("Failed to post transactions. Please try again.");
    } finally {
      setPosting(false);
      setPostingCount(0);
    }
  }

  async function ignoreTransaction(txn: BankTransaction | StagedTransaction, isStaged: boolean) {
    if (isStaged) {
      setStagedTransactions((prev) => prev.filter((t) => t.tempId !== (txn as StagedTransaction).tempId));
      return;
    }
    await supabase.from("bank_transactions").update({ is_reviewed: true }).eq("id", (txn as BankTransaction).id);
    setBankTransactions((prev) => prev.filter((t) => t.id !== (txn as BankTransaction).id));
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
      laundrocfo_field: m.laundrocfo_field,
    }));

    const { error: insertError } = await supabase.from("quickbooks_mapping").insert(rows);
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSuccess("QuickBooks account mappings saved.");
    setSaving(false);
    await loadData();
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (storesLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Loading financials…
        </div>
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          No stores yet. Add your first store to view financials.
        </p>
        <Link href="/onboarding" className="btn-primary inline-flex mt-4 text-[13px]">
          Add Store →
        </Link>
      </div>
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
  const reviewCount = bankTransactions.length + stagedTransactions.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[15px] font-semibold text-slate-100">Financials</h1>
        <p className="text-[12px] text-slate-500 mt-1">
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

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", display: "flex", gap: "8px", paddingBottom: "4px" }}>
        <div className="flex flex-wrap gap-1 border-b border-white/[0.06]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              )}
            >
              {tab.label}
              {tab.id === "bank" && reviewCount > 0 && (
                <span className="ml-2 badge badge-amber text-[10px]">{reviewCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── TAB 1: P&L ─── */}
      {activeTab === "pl" && (
        <div className="space-y-5">
          {records.length === 0 && !showForm && (
            <div className="card text-center py-10">
              <p className="text-[14px] text-slate-400 mb-4">
                Add your first month of financials to get started
              </p>
              <button type="button" className="btn-primary" onClick={() => openMonthForm(selectedMonth)}>
                Add Month
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 grid-4">
            <MetricCard
              label="TTM Revenue"
              value={fmtDollar(ttm.ttmRevenue || demoFinancials.annualRevenue)}
              sub={ttm.monthsUsed < 12 ? `${ttm.monthsUsed} mo. of data` : "Trailing 12-month gross revenue"}
              subColor="muted"
            />
            <div className="card">
              <div className="metric-label">
                <MetricTooltip
                  label="TTM EBITDA"
                  explanation="Earnings Before Interest, Taxes, Depreciation & Amortization. The primary profit metric for laundromat valuation."
                />
              </div>
              <div className="metric-value">{fmtDollar(ttm.ttmEbitda || demoFinancials.ebitda)}</div>
              <div className="text-[12px] mt-1 text-slate-500">
                Earnings before interest, taxes, depreciation, amortization
              </div>
            </div>
            <MetricCard label="EBITDA Margin" value={fmtPct(ttm.ttmEbitdaMargin || (demoFinancials.ebitda / demoFinancials.annualRevenue) * 100)} sub="TTM" subColor="muted" />
            <div className="card">
              <div className="metric-label">
                <MetricTooltip
                  label="DSCR"
                  explanation="Debt Service Coverage Ratio. Measures ability to cover loan payments. Lenders require minimum 1.25x."
                />
              </div>
              <div className="metric-value">
                {fmtMultiple(
                  ttm.ttmDebtService > 0
                    ? ttm.dscr
                    : demoFinancials.cashFlow / demoFinancials.annualDebtService
                )}
              </div>
              <div className="text-[12px] mt-1 text-slate-500">Net cash flow ÷ annual debt service</div>
              <div
                className={clsx(
                  "text-[12px] mt-1",
                  (ttm.ttmDebtService > 0 ? ttm.dscr : demoFinancials.cashFlow / demoFinancials.annualDebtService) >= 1.5
                    ? "text-green-400"
                    : (ttm.ttmDebtService > 0 ? ttm.dscr : demoFinancials.cashFlow / demoFinancials.annualDebtService) >= 1.25
                      ? "text-amber-400"
                      : "text-red-400"
                )}
              >
                {(ttm.ttmDebtService > 0 ? ttm.dscr : demoFinancials.cashFlow / demoFinancials.annualDebtService) >= 1.5
                  ? "Strong"
                  : (ttm.ttmDebtService > 0 ? ttm.dscr : demoFinancials.cashFlow / demoFinancials.annualDebtService) >= 1.25
                    ? "Adequate"
                    : "Below threshold"}
              </div>
            </div>
            <div className="card">
              <div className="metric-label">
                <MetricTooltip
                  label="NOI"
                  explanation="Net Operating Income. Revenue minus all operating expenses including rent but before debt service."
                />
              </div>
              <div className="metric-value">{fmtDollar(ttm.ttmNoi || demoFinancials.noi)}</div>
              <div className="text-[12px] mt-1 text-slate-500">Net operating income after rent and operating expenses</div>
            </div>
          </div>

          <div className="card">
            <div className="flex flex-wrap items-center gap-4 justify-between">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <div className="metric-label mb-1.5">Year</div>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
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
                          onClick={() => {
                            setSelectedMonth(month);
                            setShowForm(false);
                          }}
                          className={clsx(
                            "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                            isSelected
                              ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                              : hasData
                                ? "bg-[#243347] border-white/10 text-slate-300 hover:border-blue-500/30"
                                : "bg-transparent border-white/[0.06] text-slate-600 hover:text-slate-400"
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
              <button type="button" className="btn-primary" onClick={() => openMonthForm(selectedMonth)}>
                {selectedRecord ? "Edit Month" : "Add Month"}
              </button>
              {selectedRecord && (
                <button
                  type="button"
                  className="btn-outline text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={clearMonthFinancialData}
                >
                  Clear Financial Data for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                </button>
              )}
              <button
                type="button"
                className="btn-outline text-red-400 border-red-500/30 hover:bg-red-500/10"
                onClick={() => {
                  setClearAllStoreNameInput("");
                  setShowClearAllConfirm(true);
                }}
              >
                Clear All Financial Data
              </button>
            </div>
          </div>

          {showClearAllConfirm && (
            <div className="card border border-red-500/30 bg-red-500/5">
              <div className="section-title text-red-300">Clear All Financial Data</div>
              <p className="text-[13px] text-slate-300 mb-4">
                This will permanently delete <strong>all</strong> P&L records for{" "}
                <span className="text-slate-100">{store?.name ?? "this store"}</span>. This cannot be
                undone.
              </p>
              <p className="text-[12px] text-slate-400 mb-2">
                Type the store name to confirm:{" "}
                <span className="font-mono text-slate-200">{store?.name ?? ""}</span>
              </p>
              <input
                type="text"
                value={clearAllStoreNameInput}
                onChange={(e) => setClearAllStoreNameInput(e.target.value)}
                onKeyDown={preventEnterSubmit}
                className={clsx(INPUT_CLASS, "max-w-md mb-4")}
                placeholder="Store name"
                aria-label="Confirm store name"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-outline text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={clearAllFinancialData}
                  disabled={clearAllStoreNameInput.trim() !== (store?.name ?? "").trim()}
                >
                  Permanently Delete All P&L Data
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setShowClearAllConfirm(false);
                    setClearAllStoreNameInput("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showForm && (
            <div className="card">
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
                      type="number"
                      value={form[key] === 0 && key !== "revenue" ? "" : form[key]}
                      onChange={(e) => setFormField(key, e.target.value)}
                      onKeyDown={preventEnterSubmit}
                      className={INPUT_CLASS}
                      placeholder="0"
                    />
                  </div>
                ))}
                <div className="flex items-end">
                  <p className="text-[13px] pb-2" style={{ color: "var(--text-secondary)" }}>
                    Utilities are now tracked in the{" "}
                    <Link href="/utilities" className="text-blue-400 hover:underline">
                      Utilities section →
                    </Link>
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card2">
                  <div className="metric-label">Total Expenses</div>
                  <div className="text-lg font-bold text-red-400">{fmtDollar(liveCalc.totalExpenses)}</div>
                </div>
                <div className="card2">
                  <div className="metric-label">EBITDA</div>
                  <div className="text-lg font-bold text-green-400">{fmtDollar(liveCalc.ebitda)}</div>
                </div>
                <div className="card2">
                  <div className="metric-label">EBITDA Margin</div>
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
                <button type="button" className="btn-primary" onClick={saveMonthlyRecord} disabled={saving || saveStatus === "success"}>
                  {saveStatus === "success" ? "Saved ✓" : saving ? "Saving…" : "Save to monthly_financials"}
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="section-title">P&L — {selectedYear}</div>
            <div className="table-scroll">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-white/[0.06]">
                  <th className="pb-3 pr-3 font-medium">Month</th>
                  <th className="pb-3 pr-3 font-medium text-right">Revenue</th>
                  <th className="pb-3 pr-3 font-medium text-right">Expenses</th>
                  <th className="pb-3 pr-3 font-medium text-right">EBITDA</th>
                  <th className="pb-3 pr-3 font-medium text-right">Margin</th>
                  <th className="pb-3 pr-3 font-medium text-right">Debt Svc</th>
                  <th className="pb-3 font-medium text-right">NOI</th>
                </tr>
              </thead>
              <tbody>
                {yearRecords.map((r, i) => (
                  <tr
                    key={i}
                    className={clsx(
                      "border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.02]",
                      selectedMonth === i + 1 && "bg-blue-500/5"
                    )}
                    onClick={() => setSelectedMonth(i + 1)}
                  >
                    <td className="py-2.5 pr-3 text-slate-300">{MONTH_NAMES[i]}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-200">
                      {r ? fmtDollar(r.revenue) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-red-400/80">
                      {r ? fmtDollar(r.totalExpenses) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-green-400">
                      {r ? fmtDollar(r.ebitda) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-400">
                      {r ? fmtPct(r.ebitdaMargin) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-400">
                      {r ? fmtDollar(r.debt_service) : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-blue-400">
                      {r ? fmtDollar(r.noi) : "—"}
                    </td>
                  </tr>
                ))}
                {yearTotals && (
                  <tr className="font-semibold bg-[#243347]/50">
                    <td className="py-3 pr-3 text-slate-100">Total</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{fmtDollar(yearTotals.revenue)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums text-red-400">
                      {fmtDollar(yearTotals.totalExpenses)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-green-400">
                      {fmtDollar(yearTotals.ebitda)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {yearTotals.revenue > 0
                        ? fmtPct((yearTotals.ebitda / yearTotals.revenue) * 100)
                        : "—"}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{fmtDollar(yearTotals.debt_service)}</td>
                    <td className="py-3 text-right tabular-nums text-blue-400">{fmtDollar(yearTotals.noi)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Revenue vs EBITDA — {selectedYear}</div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearChartData} barGap={4}>
                  <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ebitda" name="EBITDA" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
            <div className="card text-center py-10 text-[14px] text-slate-500">
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
                  <span className="text-[11px] text-slate-600 font-normal ml-auto">22% industry median reference</span>
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
                <div className="text-[11px] text-slate-500 mt-1">Target: below 15%</div>
              </div>
              <div className="card2">
                <div className="metric-label">Occupancy Cost Ratio</div>
                <div className={clsx("text-[20px] font-bold", ratioStatusColor(occupancyPct, { good: 15, warn: 20 }))}>
                  {fmtPct(occupancyPct)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Rent as % of TTM revenue</div>
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
            <div className="flex justify-between text-[11px] text-slate-600 mt-2">
              <span>0%</span>
              <span>15% alert</span>
              <span>20% critical</span>
            </div>
            <div className="mt-4 text-[12px] text-slate-400 leading-relaxed">
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
          <div className="card flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold text-slate-100">Import Bank Transactions</div>
              <div className="text-[12px] text-slate-500 mt-1">
                Upload a CSV with Processed Date, Description, Credit or Debit, and Amount columns.
                Income and expenses are detected from the Credit or Debit column.
              </div>
            </div>
            <div className="flex gap-2">
              <label className="btn-outline cursor-pointer">
                Upload CSV
                <input
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
              {stagedTransactions.length > 0 && (
                <button type="button" className="btn-primary" onClick={saveStagedToBank} disabled={saving}>
                  Save {stagedTransactions.length} to Queue
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div className="section-title flex flex-wrap items-center gap-3">
              <span>Transaction Review</span>
              <span className="text-[11px] text-slate-600 font-normal">
                {reviewCount} pending
              </span>
              {reviewCount > 0 && (
                <button
                  type="button"
                  className="btn-outline text-[11px] text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={ignoreAllTransactions}
                >
                  Ignore All {reviewCount} Transactions
                </button>
              )}
              <button
                type="button"
                className="ml-auto text-[12px] text-blue-400 hover:text-blue-300"
                onClick={() => setShowManageRules((v) => !v)}
              >
                {showManageRules ? "Hide Rules" : "Manage Rules"}
                {categorizationRules.length > 0 && (
                  <span className="ml-1.5 badge badge-blue text-[10px]">{categorizationRules.length}</span>
                )}
              </button>
              <label className="flex items-center gap-2 text-[12px] text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupSimilar}
                  onChange={(e) => setGroupSimilar(e.target.checked)}
                  className="rounded border-white/20"
                />
                Show individual rows
              </label>
            </div>

            {showManageRules && (
              <div className="mb-4 p-4 rounded-lg bg-[#243347]/50 border border-white/[0.06]">
                <div className="text-[13px] font-medium text-slate-200 mb-3">Categorization Rules</div>
                {categorizationRules.length === 0 ? (
                  <p className="text-[12px] text-slate-500">
                    No rules yet. Use &quot;Set as Rule&quot; on a transaction group to auto-categorize future imports.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {categorizationRules.map((rule) => {
                      const isAmountRule = rule.rule_type === "amount";
                      return (
                      <div
                        key={rule.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-white/[0.04] last:border-b-0"
                      >
                        <div className="text-[12px] text-slate-300">
                          {isAmountRule ? (
                            <>
                              When{" "}
                              <span className="text-slate-100">
                                {rule.transaction_type === "income" ? "income" : "expense"}
                              </span>{" "}
                              amount ={" "}
                              <span className="font-mono text-slate-100">
                                ${Number(rule.amount ?? 0).toFixed(2)}
                              </span>{" "}
                              <span className="text-slate-500">
                                (±${Number(rule.amount_tolerance ?? 0.01).toFixed(2)})
                              </span>
                            </>
                          ) : (
                            <>
                              When description contains &apos;{rule.vendor_pattern}&apos;
                            </>
                          )}
                          <span className="text-slate-500 mx-2">→</span>
                          <CategoryBadge category={rule.category as BankImportCategory} />
                        </div>
                        <button
                          type="button"
                          className="text-[11px] text-red-400 hover:text-red-300"
                          onClick={() => deleteCategorizationRule(rule.id)}
                        >
                          Delete
                        </button>
                      </div>
                    );})}
                  </div>
                )}
              </div>
            )}

            {(duplicateImportCount > 0 || duplicateReviewCount > 0) && (
              <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[12px] text-amber-200">
                {duplicateReviewCount > 0
                  ? `${duplicateReviewCount} possible duplicate${duplicateReviewCount === 1 ? "" : "s"} detected (already imported or overlapping date range). Review before posting.`
                  : `${duplicateImportCount} possible duplicate${duplicateImportCount === 1 ? "" : "s"} detected (already imported or overlapping date range). Review before posting.`}
              </div>
            )}

            {someSelected && !groupSimilar && (
              <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <span className="text-[12px] text-blue-300 font-medium">
                  {selectedTxnKeys.size} selected
                </span>
                <span className="text-[12px] text-slate-500">Apply category to selected:</span>
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value as BankImportCategory)}
                  className={clsx(INPUT_CLASS, "w-44 py-1.5 text-[12px]")}
                >
                  {Array.from(
                    new Set(reviewTransactions.filter((t) => selectedTxnKeys.has(t.key)).map((t) => t.type))
                  ).length === 1
                    ? getImportCategoriesForType(
                        reviewTransactions.find((t) => selectedTxnKeys.has(t.key))!.type
                      ).map((f) => (
                        <option key={f} value={f}>
                          {BANK_IMPORT_CATEGORY_LABELS[f]}
                        </option>
                      ))
                    : ([...INCOME_IMPORT_CATEGORIES, ...UTILITY_IMPORT_CATEGORIES] as BankImportCategory[]).map((f) => (
                        <option key={f} value={f}>
                          {BANK_IMPORT_CATEGORY_LABELS[f]}
                        </option>
                      ))}
                </select>
                <button type="button" className="btn-outline text-[11px]" onClick={applyBulkCategory}>
                  Apply Category
                </button>
                <button
                  type="button"
                  className="btn-primary text-[11px]"
                  onClick={postSelectedTransactions}
                  disabled={posting}
                >
                  {posting ? `Posting ${postingCount} transaction${postingCount === 1 ? "" : "s"}…` : "Post Selected to P&L"}
                </button>
                <button type="button" className="btn-outline text-[11px]" onClick={ignoreSelectedTransactions}>
                  Ignore Selected
                </button>
              </div>
            )}

            {reviewCount === 0 ? (
              <p className="text-[13px] text-slate-500 py-6 text-center">
                No transactions to review. Upload a CSV to get started.
              </p>
            ) : groupSimilar ? (
              <div className="table-scroll">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-white/[0.06]">
                      <th className="pb-3 pr-3 font-medium">Vendor</th>
                      <th className="pb-3 pr-3 font-medium">Type</th>
                      <th className="pb-3 pr-3 font-medium">Count</th>
                      <th className="pb-3 pr-3 font-medium text-right">Total</th>
                      <th className="pb-3 pr-3 font-medium">Category</th>
                      <th className="pb-3 pr-3 font-medium">Suggestion</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionGroups.map((group) => (
                      <Fragment key={group.groupKey}>
                        <tr className="border-b border-white/[0.04]">
                          <td className="py-3 pr-3 text-slate-200 max-w-[240px]">
                            <div className="truncate font-medium" title={group.description}>
                              {group.vendorPattern}
                            </div>
                            {group.count > 1 && (
                              <div className="text-[10px] text-slate-500 truncate" title={group.description}>
                                e.g. {group.description}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-3">
                            <TypeBadge type={group.type} />
                          </td>
                          <td className="py-3 pr-3 text-slate-400">
                            {group.count} transaction{group.count === 1 ? "" : "s"}
                          </td>
                          <td className="py-3 pr-3 text-right font-semibold tabular-nums text-slate-100">
                            {fmtDollar(group.totalAmount)}
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              value={group.category}
                              onChange={(e) =>
                                updateGroupCategory(group.groupKey, e.target.value as BankImportCategory)
                              }
                              className={clsx(
                                INPUT_CLASS,
                                "w-40 py-1.5 text-[12px]",
                                group.category === "needs_review" && "border-amber-500/40"
                              )}
                            >
                              {getImportCategoriesForType(group.type).map((f) => (
                                <option key={f} value={f}>
                                  {BANK_IMPORT_CATEGORY_LABELS[f]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex flex-wrap items-center gap-1">
                              <CategoryBadge category={group.suggested} />
                              <RuleAppliedBadge kind={group.ruleApplied} />
                              {group.items.some((i) => i.possibleDuplicate) && (
                                <span className="badge badge-amber text-[10px]">Possible Duplicate</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              className="btn-primary text-[11px] mr-1.5"
                              onClick={() => postGroupTransactions(group)}
                              disabled={!isCategoryReadyToPost(group.category) || posting}
                            >
                              {posting
                                ? `Posting ${postingCount} transaction${postingCount === 1 ? "" : "s"}…`
                                : "Post All to P&L"}
                            </button>
                            <button
                              type="button"
                              className="btn-outline text-[11px] mr-1.5"
                              onClick={() => ignoreGroupTransactions(group)}
                            >
                              Ignore All
                            </button>
                            <button
                              type="button"
                              className="text-[11px] text-blue-400 hover:text-blue-300"
                              onClick={() =>
                                openRuleForm(
                                  group.groupKey,
                                  group.category,
                                  group.type,
                                  group.vendorPattern,
                                  group.count === 1 ? group.totalAmount : group.items[0]?.amount ?? group.totalAmount
                                )
                              }
                            >
                              Set as Rule
                            </button>
                          </td>
                        </tr>
                        {ruleFormKey === group.groupKey && (
                          <tr key={`${group.groupKey}-rule`} className="border-b border-white/[0.04] bg-blue-500/5">
                            <td colSpan={7} className="py-3 px-3">
                              <RuleFormPanel
                                type={group.type}
                                vendorPattern={group.vendorPattern}
                                amount={group.count === 1 ? group.totalAmount : group.items[0]?.amount ?? group.totalAmount}
                                category={ruleFormCategory}
                                ruleType={ruleFormType}
                                ruleAmount={ruleFormAmount}
                                ruleTolerance={ruleFormTolerance}
                                onRuleTypeChange={setRuleFormType}
                                onCategoryChange={setRuleFormCategory}
                                onAmountChange={setRuleFormAmount}
                                onToleranceChange={setRuleFormTolerance}
                                onSave={saveCategorizationRule}
                                onCancel={() => {
                                  setRuleFormKey(null);
                                  setRuleFormMessage(null);
                                }}
                                saving={ruleFormSaving}
                                message={ruleFormMessage}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-white/[0.06]">
                      <th className="pb-3 pr-2 font-medium w-8">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => toggleSelectAll(e.target.checked)}
                          className="rounded border-white/20"
                          aria-label="Select all transactions"
                        />
                      </th>
                      <th className="pb-3 pr-3 font-medium">Date</th>
                      <th className="pb-3 pr-3 font-medium">Description</th>
                      <th className="pb-3 pr-3 font-medium">Type</th>
                      <th className="pb-3 pr-3 font-medium text-right">Amount</th>
                      <th className="pb-3 pr-3 font-medium">Category</th>
                      <th className="pb-3 pr-3 font-medium">Suggestion</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewTransactions.map((txn) => (
                      <Fragment key={txn.key}>
                        <tr className="border-b border-white/[0.04]">
                          <td className="py-3 pr-2">
                            <input
                              type="checkbox"
                              checked={selectedTxnKeys.has(txn.key)}
                              onChange={(e) => toggleSelectKey(txn.key, e.target.checked)}
                              disabled={txn.possibleDuplicate}
                              className="rounded border-white/20 disabled:opacity-40"
                              aria-label={`Select ${txn.description ?? "transaction"}`}
                            />
                          </td>
                          <td className="py-3 pr-3 text-slate-300 whitespace-nowrap">
                            {new Date(txn.transaction_date.split("T")[0] + "T12:00:00").toLocaleDateString()}
                          </td>
                          <td className="py-3 pr-3 text-slate-200 max-w-[200px] truncate">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{txn.description ?? "—"}</span>
                              {txn.possibleDuplicate && (
                                <span className="badge badge-amber text-[10px] shrink-0">Possible Duplicate</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <TypeBadge type={txn.type} />
                          </td>
                          <td className="py-3 pr-3 text-right font-semibold tabular-nums text-slate-100">
                            {fmtDollar(txn.amount)}
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              value={txn.category}
                              onChange={(e) =>
                                updateReviewCategory(txn.key, e.target.value as BankImportCategory)
                              }
                              className={clsx(
                                INPUT_CLASS,
                                "w-40 py-1.5 text-[12px]",
                                txn.category === "needs_review" && "border-amber-500/40"
                              )}
                            >
                              {getImportCategoriesForType(txn.type).map((f) => (
                                <option key={f} value={f}>
                                  {BANK_IMPORT_CATEGORY_LABELS[f]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex flex-wrap items-center gap-1">
                              <CategoryBadge category={txn.suggested} />
                              <RuleAppliedBadge kind={txn.ruleApplied ?? false} />
                            </div>
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              className="btn-primary text-[11px] mr-1.5"
                              onClick={() => postReviewTransaction(txn)}
                              disabled={!isCategoryReadyToPost(txn.category) || posting}
                            >
                              {posting ? "Posting…" : "Post to P&L"}
                            </button>
                            <button
                              type="button"
                              className="btn-outline text-[11px] mr-1.5"
                              onClick={() => ignoreReviewTransaction(txn)}
                            >
                              Ignore
                            </button>
                            <button
                              type="button"
                              className="text-[11px] text-blue-400 hover:text-blue-300"
                              onClick={() =>
                                openRuleForm(
                                  txn.key,
                                  txn.category,
                                  txn.type,
                                  normalizeVendorPattern(txn.description) || "(no description)",
                                  txn.amount
                                )
                              }
                            >
                              Set as Rule
                            </button>
                          </td>
                        </tr>
                        {ruleFormKey === txn.key && (
                          <tr className="border-b border-white/[0.04] bg-blue-500/5">
                            <td colSpan={8} className="py-3 px-3">
                              <RuleFormPanel
                                type={txn.type}
                                vendorPattern={normalizeVendorPattern(txn.description) || "(no description)"}
                                amount={txn.amount}
                                category={ruleFormCategory}
                                ruleType={ruleFormType}
                                ruleAmount={ruleFormAmount}
                                ruleTolerance={ruleFormTolerance}
                                onRuleTypeChange={setRuleFormType}
                                onCategoryChange={setRuleFormCategory}
                                onAmountChange={setRuleFormAmount}
                                onToleranceChange={setRuleFormTolerance}
                                onSave={saveCategorizationRule}
                                onCancel={() => {
                                  setRuleFormKey(null);
                                  setRuleFormMessage(null);
                                }}
                                saving={ruleFormSaving}
                                message={ruleFormMessage}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 5: QUICKBOOKS ─── */}
      {activeTab === "quickbooks" && (
        <div className="space-y-4 max-w-3xl">
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
                <span className="badge badge-amber text-[10px]">Not Connected</span>
              </div>
              <div className="text-[12px] text-slate-400">
                Connect QuickBooks to automatically sync monthly revenue, expenses, and debt service.
              </div>
            </div>
            <button type="button" className="btn-primary flex-shrink-0" disabled>
              Connect QuickBooks
            </button>
          </div>

          <div className="card">
            <div className="section-title">Account Mapping</div>
            <p className="text-[12px] text-slate-500 mb-4">
              Map QuickBooks accounts to LaundroCFO fields. Saved to{" "}
              <code className="text-blue-300 text-[11px] bg-blue-500/10 px-1 rounded">quickbooks_mapping</code>.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-white/[0.06]">
                    <th className="pb-3 pr-4 font-medium">QuickBooks Account</th>
                    <th className="pb-3 font-medium">LaundroCFO Field</th>
                  </tr>
                </thead>
                <tbody>
                  {qbMappings.map((row, idx) => (
                    <tr key={idx} className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-4">
                        <input
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
                  className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-b-0"
                >
                  <span className="text-[13px] text-slate-300">{item.feature}</span>
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
