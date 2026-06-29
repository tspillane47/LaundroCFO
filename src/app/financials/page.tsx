"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useStores } from "@/lib/store-context";
import { fmtDollar, fmtMultiple, fmtPct } from "@/lib/calculations";
import { MetricCard } from "@/components/ui/MetricCard";
import { MetricTooltip } from "@/components/ui/MetricTooltip";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";
import { INPUT_CLASS, preventEnterSubmit } from "@/components/occupancy/shared";
import { PageError } from "@/components/ui/PageError";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  type BankTransaction,
  type CalculatedMonthly,
  type MonthlyFinancialRecord,
  type PlCategoryField,
  type RatioBenchmark,
  type StoreFinancialProfile,
  MONTH_NAMES,
  MONTH_SHORT,
  PL_CATEGORY_FIELDS,
  BANK_IMPORT_CATEGORY_LABELS,
  buildRatioBenchmarks,
  mapBankCategoryToPlField,
  calcMonthly,
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
} from "@/lib/financials";

type TabId = "pl" | "trends" | "ratios" | "bank" | "quickbooks";
type MonthlyForm = Omit<MonthlyFinancialRecord, "id" | "store_id">;
type NumericFormField = Exclude<keyof MonthlyForm, "notes">;

type StagedTransaction = {
  tempId: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  category: PlCategoryField;
  suggested: PlCategoryField;
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
    <div className="bg-[var(--bg-card)] dark:bg-[#1e2a3a] border border-[var(--border)] dark:border-white/10 rounded-lg p-3 text-xs shadow-sm">
      <div className="text-[var(--text-secondary)] dark:text-gray-800 dark:text-slate-400 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-[var(--text-secondary)] dark:text-gray-800 dark:text-slate-300">{entry.name}:</span>
          <span className="text-[var(--text-primary)] dark:text-slate-100 font-semibold">{fmt(entry.value)}</span>
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
      <div className="text-[11px] text-gray-700 dark:text-slate-500 mt-1">Industry median: {benchDisplay}</div>
      <div className="progress-bar mt-3">
        <div className={clsx("h-full rounded-full", barColor)} style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-gray-700 dark:text-slate-600 mt-1.5">
        <span>Top 25%: {item.unit === "$" ? `$${Math.round(item.top25).toLocaleString()}` : item.unit === "x" ? fmtMultiple(item.top25) : fmtPct(item.top25)}</span>
        <span>Bottom 25%: {item.unit === "$" ? `$${Math.round(item.bottom25).toLocaleString()}` : item.unit === "x" ? fmtMultiple(item.bottom25) : fmtPct(item.bottom25)}</span>
      </div>
    </div>
  );
}

function parseCSVTransactions(text: string): StagedTransaction[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const dateIdx = headers.findIndex((h) => /date|posted/.test(h));
  const descIdx = headers.findIndex((h) => /desc|memo|name|payee/.test(h));
  const amountIdx = headers.findIndex((h) => /amount|debit|credit|value/.test(h));

  if (dateIdx === -1 || amountIdx === -1) return [];

  return lines.slice(1).map((line, i) => {
    const cols = line.match(/(".*?"|[^,]+)/g)?.map((c) => c.trim().replace(/^"|"$/g, "")) ?? line.split(",");
    const rawDate = cols[dateIdx] ?? "";
    const description = descIdx >= 0 ? cols[descIdx] ?? null : null;
    let amount = parseFloat((cols[amountIdx] ?? "0").replace(/[$,]/g, ""));
    if (Number.isNaN(amount)) amount = 0;

    const parsed = new Date(rawDate);
    const transaction_date = Number.isNaN(parsed.getTime())
      ? new Date().toISOString().slice(0, 10)
      : parsed.toISOString().slice(0, 10);

    const suggestedRaw = suggestTransactionCategory(description);
    const suggested = mapBankCategoryToPlField(suggestedRaw) ?? "other_expenses";
    return {
      tempId: `csv-${i}-${Date.now()}`,
      transaction_date,
      description,
      amount,
      category: suggested,
      suggested,
    };
  });
}

function normalizeTransactionAmount(amount: number, field: PlCategoryField): number {
  const abs = Math.abs(amount);
  return field === "revenue" ? abs : abs;
}

export default function FinancialsPage() {
  const supabase = createClient();
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
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [stagedTransactions, setStagedTransactions] = useState<StagedTransaction[]>([]);
  const [qbMappings, setQbMappings] = useState<QBMappingRow[]>(DEFAULT_QB_MAPPINGS);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MonthlyForm>(() => emptyMonthlyForm());

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
      { data: bankData, error: bankError },
      { data: mappingData, error: mappingError },
    ] = await Promise.all([
      supabase.from("stores").select("*").eq("id", selectedStore.id).single(),
      supabase
        .from("monthly_financials")
        .select("*")
        .eq("store_id", selectedStore.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
      supabase
        .from("bank_transactions")
        .select("*")
        .eq("store_id", selectedStore.id)
        .eq("is_reviewed", false)
        .order("transaction_date", { ascending: false }),
      supabase.from("quickbooks_mapping").select("*").eq("store_id", selectedStore.id),
    ]);

    const errors = [storeError, financialsError, bankError, mappingError]
      .filter(Boolean)
      .map((e) => e!.message);
    if (errors.length > 0) setError(errors.join(" · "));

    setStore(storeData as StoreFinancialProfile);
    const sorted = enrichMonthlyRecords(sortRecordsDesc((financialsData ?? []) as MonthlyFinancialRecord[]));
    setRecords(sorted);
    setBankTransactions((bankData ?? []) as BankTransaction[]);

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
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSVTransactions(text);
      if (parsed.length === 0) {
        setError("Could not parse CSV. Include Date and Amount columns.");
        return;
      }
      setStagedTransactions((prev) => [...parsed, ...prev]);
      setSuccess(`Parsed ${parsed.length} transaction${parsed.length === 1 ? "" : "s"} from CSV.`);
    };
    reader.readAsText(file);
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

  async function postTransactionToPL(
    txn: BankTransaction | StagedTransaction,
    isStaged: boolean
  ) {
    if (!store?.id || !userId) return;
    const category = (txn.category ?? "other_expenses") as PlCategoryField;
    const date = new Date(txn.transaction_date.split("T")[0] + "T12:00:00");
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const amount = normalizeTransactionAmount(txn.amount, category);

    const existing = records.find((r) => r.year === year && r.month === month);
    const base = existing
      ? recordToForm(existing)
      : { ...emptyMonthlyForm(store), year, month };

    const currentFieldValue = (base[category as NumericFormField] as number) ?? 0;
    const updated = {
      ...base,
      [category]: currentFieldValue + amount,
    };

    const payload = {
      store_id: store.id,
      user_id: userId,
      year,
      month,
      revenue: updated.revenue,
      utilities: updated.utilities,
      rent: updated.rent,
      payroll: updated.payroll,
      repairs_maintenance: updated.repairs_maintenance,
      insurance_expense: updated.insurance_expense,
      supplies: updated.supplies,
      marketing: updated.marketing,
      professional_fees: updated.professional_fees,
      other_expenses: updated.other_expenses,
      debt_service: updated.debt_service,
      notes: updated.notes,
    };

    if (existing?.id) {
      await supabase.from("monthly_financials").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("monthly_financials").insert(payload);
    }

    if (isStaged) {
      setStagedTransactions((prev) => prev.filter((t) => t.tempId !== (txn as StagedTransaction).tempId));
    } else {
      await supabase.from("bank_transactions").update({ is_reviewed: true }).eq("id", (txn as BankTransaction).id);
    }

    setSuccess(`Posted to ${MONTH_NAMES[month - 1]} ${year} P&L (${CATEGORY_LABELS[category]}).`);
    await loadData();
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
    return <LoadingSkeleton variant="table" />;
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

  if (records.length === 0) {
    return (
      <EmptyState
        icon="FileSpreadsheet"
        title="No financial data yet"
        description="Upload your bank CSV to see your P&L"
        ctaLabel="Import Transactions"
        ctaHref="/transactions"
      />
    );
  }

  const occupancyPct = ratios && ttm.ttmRevenue > 0 ? (ratios.annualRent / ttm.ttmRevenue) * 100 : 0;
  const reviewCount = bankTransactions.length + stagedTransactions.length;
  const displayDscr = ttm.ttmDebtService > 0 ? ttm.dscr : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[15px] font-semibold text-slate-100">Financials</h1>
        <p className="text-[12px] text-gray-700 dark:text-slate-500 mt-1">
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
                  : "border-transparent text-gray-700 dark:text-gray-800 dark:text-slate-300 hover:text-slate-900 dark:hover:text-gray-800 dark:text-slate-300"
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
              <div className="text-[12px] mt-1 text-gray-700 dark:text-slate-500">
                Earnings before interest, taxes, depreciation, amortization
              </div>
            </div>
            <MetricCard label="EBITDA Margin" value={fmtPct(ttm.ttmEbitdaMargin || 0)} sub="TTM" subColor="muted" />
            <div className="card">
              <div className="metric-label">
                <DisclaimerLabel>DSCR</DisclaimerLabel>
              </div>
              <div className="metric-value">
                {displayDscr != null ? fmtMultiple(displayDscr) : "—"}
              </div>
              <div className="text-[12px] mt-1 text-gray-700 dark:text-slate-500">Net cash flow ÷ annual debt service</div>
              {displayDscr != null && (
                <div
                  className={clsx(
                    "text-[12px] mt-1",
                    displayDscr >= 1.5
                      ? "text-green-400"
                      : displayDscr >= 1.25
                        ? "text-amber-400"
                        : "text-red-400"
                  )}
                >
                  {displayDscr >= 1.5
                    ? "Strong"
                    : displayDscr >= 1.25
                      ? "Adequate"
                      : "Below threshold"}
                </div>
              )}
            </div>
            <div className="card">
              <div className="metric-label">
                <MetricTooltip
                  label="NOI"
                  explanation="Net Operating Income. Revenue minus all operating expenses including rent but before debt service."
                />
              </div>
              <div className="metric-value">{fmtDollar(ttm.ttmNoi || 0)}</div>
              <div className="text-[12px] mt-1 text-gray-700 dark:text-slate-500">Net operating income after rent and operating expenses</div>
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
                                ? "bg-[var(--bg-page)] dark:bg-[#243347] border-[var(--border2)] dark:border-white/10 text-[var(--text-primary)] dark:text-gray-800 dark:text-slate-300 hover:border-blue-500/30"
                                : "bg-transparent border-[var(--border)] dark:border-white/[0.06] text-[var(--text-secondary)] dark:text-slate-600 hover:text-[var(--text-primary)] dark:hover:text-gray-800 dark:text-slate-400"
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
            </div>
          </div>

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
                <button type="button" className="btn-primary" onClick={saveMonthlyRecord} disabled={saving || saveStatus === "success"}>
                  {saveStatus === "success" ? "Saved" : saving ? "Saving…" : "Save to monthly_financials"}
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="section-title">P&L — {selectedYear}</div>
            <div className="table-scroll">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-gray-700 dark:text-gray-800 dark:text-gray-300 border-b border-white/[0.06]">
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
                    <td className="py-2.5 pr-3 text-gray-900 dark:text-white">{MONTH_NAMES[i]}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">
                      {r ? fmtDollar(r.revenue) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">
                      {r ? fmtDollar(r.totalExpenses) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-green-600 dark:text-green-400">
                      {r ? fmtDollar(r.ebitda) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">
                      {r ? fmtPct(r.ebitdaMargin) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900 dark:text-white">
                      {r ? fmtDollar(r.debt_service) : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-blue-600 dark:text-blue-400">
                      {r ? fmtDollar(r.noi) : "—"}
                    </td>
                  </tr>
                ))}
                {yearTotals && (
                  <tr className="font-semibold bg-[var(--bg-page)] dark:bg-[#243347]/50">
                    <td className="py-3 pr-3 text-gray-900 dark:text-white">Total</td>
                    <td className="py-3 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{fmtDollar(yearTotals.revenue)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums text-gray-900 dark:text-white">
                      {fmtDollar(yearTotals.totalExpenses)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-green-600 dark:text-green-400">
                      {fmtDollar(yearTotals.ebitda)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-gray-900 dark:text-white">
                      {yearTotals.revenue > 0
                        ? fmtPct((yearTotals.ebitda / yearTotals.revenue) * 100)
                        : "—"}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{fmtDollar(yearTotals.debt_service)}</td>
                    <td className="py-3 text-right tabular-nums text-blue-600 dark:text-blue-400">{fmtDollar(yearTotals.noi)}</td>
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
            <div className="card text-center py-10 text-[14px] text-gray-700 dark:text-slate-500">
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
                  <span className="text-[11px] text-gray-700 dark:text-slate-600 font-normal ml-auto">22% industry median reference</span>
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
                <div className="text-[11px] text-gray-700 dark:text-slate-500 mt-1">Target: below 15%</div>
              </div>
              <div className="card2">
                <div className="metric-label">Occupancy Cost Ratio</div>
                <div className={clsx("text-[20px] font-bold", ratioStatusColor(occupancyPct, { good: 15, warn: 20 }))}>
                  {fmtPct(occupancyPct)}
                </div>
                <div className="text-[11px] text-gray-700 dark:text-slate-500 mt-1">Rent as % of TTM revenue</div>
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
            <div className="flex justify-between text-[11px] text-gray-700 dark:text-slate-600 mt-2">
              <span>0%</span>
              <span>15% alert</span>
              <span>20% critical</span>
            </div>
            <div className="mt-4 text-[12px] text-gray-700 dark:text-gray-800 dark:text-slate-400 leading-relaxed">
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
              <div className="text-[12px] text-gray-700 dark:text-slate-500 mt-1">
                Upload a CSV with Date, Description, and Amount columns. Transactions are parsed client-side.
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
            <div className="section-title">
              Transaction Review
              <span className="text-[11px] text-gray-700 dark:text-slate-600 font-normal ml-auto">
                {reviewCount} pending
              </span>
            </div>
            {reviewCount === 0 ? (
              <p className="text-[13px] text-gray-700 dark:text-slate-500 py-6 text-center">
                No transactions to review. Upload a CSV to get started.
              </p>
            ) : (
              <div className="table-scroll">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-gray-700 dark:text-gray-800 dark:text-gray-300 border-b border-white/[0.06]">
                    <th className="pb-3 pr-3 font-medium">Date</th>
                    <th className="pb-3 pr-3 font-medium">Description</th>
                    <th className="pb-3 pr-3 font-medium text-right">Amount</th>
                    <th className="pb-3 pr-3 font-medium">Category</th>
                    <th className="pb-3 pr-3 font-medium">Suggestion</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stagedTransactions.map((txn) => (
                    <tr key={txn.tempId} className="border-b border-white/[0.04]">
                      <td className="py-3 pr-3 text-gray-900 dark:text-white whitespace-nowrap">
                        {new Date(txn.transaction_date + "T12:00:00").toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-3 text-gray-900 dark:text-white max-w-[200px] truncate">{txn.description ?? "—"}</td>
                      <td className={clsx("py-3 pr-3 text-right font-semibold tabular-nums", txn.amount < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
                        {fmtDollar(txn.amount)}
                      </td>
                      <td className="py-3 pr-3">
                        <select
                          value={txn.category}
                          onChange={(e) =>
                            setStagedTransactions((prev) =>
                              prev.map((t) =>
                                t.tempId === txn.tempId
                                  ? { ...t, category: e.target.value as PlCategoryField }
                                  : t
                              )
                            )
                          }
                          className={clsx(INPUT_CLASS, "w-40 py-1.5 text-[12px]")}
                        >
                          {PL_CATEGORY_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {CATEGORY_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="badge badge-blue text-[10px]">{CATEGORY_LABELS[txn.suggested]}</span>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button type="button" className="btn-primary text-[11px] mr-1.5" onClick={() => postTransactionToPL(txn, true)}>
                          Post to P&L
                        </button>
                        <button type="button" className="btn-outline text-[11px]" onClick={() => ignoreTransaction(txn, true)}>
                          Ignore
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bankTransactions.map((txn) => {
                    const suggested = suggestTransactionCategory(txn.description);
                    return (
                      <tr key={txn.id} className="border-b border-white/[0.04]">
                        <td className="py-3 pr-3 text-gray-900 dark:text-white whitespace-nowrap">
                          {new Date(txn.transaction_date.split("T")[0] + "T12:00:00").toLocaleDateString()}
                        </td>
                        <td className="py-3 pr-3 text-gray-900 dark:text-white max-w-[200px] truncate">{txn.description ?? "—"}</td>
                        <td className={clsx("py-3 pr-3 text-right font-semibold tabular-nums", txn.amount < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
                          {fmtDollar(txn.amount)}
                        </td>
                        <td className="py-3 pr-3">
                          <select
                            value={txn.category ?? suggested}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBankTransactions((prev) =>
                                prev.map((t) => (t.id === txn.id ? { ...t, category: val } : t))
                              );
                              supabase.from("bank_transactions").update({ category: val }).eq("id", txn.id);
                            }}
                            className={clsx(INPUT_CLASS, "w-40 py-1.5 text-[12px]")}
                          >
                            {PL_CATEGORY_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {CATEGORY_LABELS[f]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-3">
                          <span className="badge badge-blue text-[10px]">{BANK_IMPORT_CATEGORY_LABELS[suggested]}</span>
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="btn-primary text-[11px] mr-1.5"
                            onClick={() =>
                              postTransactionToPL(
                                {
                                  ...txn,
                                  category:
                                    (txn.category as PlCategoryField | null) ??
                                    mapBankCategoryToPlField(suggested) ??
                                    "other_expenses",
                                },
                                false
                              )
                            }
                          >
                            Post to P&L
                          </button>
                          <button type="button" className="btn-outline text-[11px]" onClick={() => ignoreTransaction(txn, false)}>
                            Ignore
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
              <div className="text-[12px] text-gray-700 dark:text-gray-800 dark:text-slate-400">
                Connect QuickBooks to automatically sync monthly revenue, expenses, and debt service.
              </div>
            </div>
            <button type="button" className="btn-primary flex-shrink-0" disabled>
              Connect QuickBooks
            </button>
          </div>

          <div className="card">
            <div className="section-title">Account Mapping</div>
            <p className="text-[12px] text-gray-700 dark:text-slate-500 mb-4">
              Map QuickBooks accounts to LaundroCFO fields. Saved to{" "}
              <code className="text-blue-300 text-[11px] bg-blue-500/10 px-1 rounded">quickbooks_mapping</code>.
            </p>
            <div className="table-scroll">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-gray-700 dark:text-gray-800 dark:text-gray-300 border-b border-white/[0.06]">
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
                  <span className="text-[13px] text-slate-900 dark:text-gray-800 dark:text-slate-300">{item.feature}</span>
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
