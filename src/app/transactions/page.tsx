"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { fmtDollar } from "@/lib/calculations";
import { invalidateValuationCache } from "@/lib/getStoreValuation";
import { INPUT_CLASS } from "@/components/occupancy/shared";
import { FormBanner } from "@/components/ui/FormBanner";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageError } from "@/components/ui/PageError";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { RuleApplyPrompt } from "@/components/financials/RuleApplyPrompt";
import {
  BANK_IMPORT_CATEGORY_LABELS,
  applyCategorizationRuleToTransactions,
  buildUtilitiesLookup,
  categorizeWithRules,
  enrichMonthlyRecords,
  excludeTransaction,
  fetchUnpostedBankTransactions,
  findMatchingAmountRule,
  getImportCategoriesForType,
  inferTransactionType,
  isCategoryReadyToPost,
  isGenericTransactionDescription,
  markDuplicateTransactions,
  normalizeVendorPattern,
  parseBankCsv,
  planRuleApplyToExisting,
  postTransactionsBatch,
  reclassifyPostedTransaction,
  sortRecordsDesc,
  suggestTransactionCategory,
  MONTH_SHORT,
  type BankImportCategory,
  type BankTransaction,
  type BatchPostTransaction,
  type CategorizationRule,
  type MonthlyFinancialRecord,
  type MonthlyUtilityRecord,
  type RuleMatchKind,
  type RuleType,
  type StoreFinancialProfile,
  type TransactionAuditLogEntry,
  type TransactionPlLink,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/financials";

type StatusTab = "needs_review" | "posted" | "excluded" | "all";

type StagedCsvRow = {
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

type ReviewRow = {
  id: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  type: TransactionType;
  category: BankImportCategory;
  suggested: BankImportCategory;
  ruleApplied: RuleMatchKind;
  possibleDuplicate: boolean;
  status: TransactionStatus;
  excluded: boolean;
  exclusion_reason: string | null;
  notes: string | null;
  original_category: string | null;
};

type TransactionGroup = {
  groupKey: string;
  vendorPattern: string;
  description: string;
  sampleDescription: string;
  count: number;
  totalAmount: number;
  type: TransactionType;
  category: BankImportCategory;
  suggested: BankImportCategory;
  ruleApplied: RuleMatchKind;
  items: ReviewRow[];
};

function mostCommonDescription(items: ReviewRow[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const desc = item.description?.trim() || "(no description)";
    counts.set(desc, (counts.get(desc) ?? 0) + 1);
  }
  let best = items[0]?.description?.trim() || "(no description)";
  let bestCount = 0;
  for (const [desc, count] of Array.from(counts.entries())) {
    if (count > bestCount) {
      best = desc;
      bestCount = count;
    }
  }
  return best;
}

function isPostedRow(row: ReviewRow): boolean {
  return row.status === "posted" && !row.excluded;
}

function isExcludedRow(row: ReviewRow): boolean {
  return row.excluded || row.status === "excluded";
}

function amountRuleVendorPattern(type: TransactionType, amount: number): string {
  return `__AMOUNT__:${type}:${amount.toFixed(2)}`;
}

function isNeedsReview(txn: Pick<BankTransaction, "status" | "excluded">): boolean {
  const status = txn.status ?? "needs_review";
  return !txn.excluded && !["posted", "excluded", "reviewed"].includes(status);
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getManualEntryCategories(type: TransactionType): BankImportCategory[] {
  return getImportCategoriesForType(type).filter((c) => c !== "needs_review");
}

function defaultManualCategory(type: TransactionType): BankImportCategory {
  return getManualEntryCategories(type)[0] ?? (type === "income" ? "self_service_revenue" : "water");
}

function formatPlLinkCategory(column: string): string {
  if (column in BANK_IMPORT_CATEGORY_LABELS) {
    return BANK_IMPORT_CATEGORY_LABELS[column as BankImportCategory];
  }
  return column.replace(/_/g, " ");
}

function StatusBadge({ status, excluded }: { status: TransactionStatus; excluded: boolean }) {
  if (excluded || status === "excluded") {
    return <span className="badge badge-red text-[10px]">Excluded</span>;
  }
  if (status === "posted") return <span className="badge badge-green text-[10px]">Posted</span>;
  if (status === "needs_review") return <span className="badge badge-amber text-[10px]">Needs Review</span>;
  if (status === "user_classified") return <span className="badge badge-blue text-[10px]">User Classified</span>;
  if (status === "system_classified") return <span className="badge badge-blue text-[10px]">Auto-Classified</span>;
  if (status === "reviewed") return <span className="badge text-[10px]">Reviewed</span>;
  return <span className="badge text-[10px]">{status}</span>;
}

function CategoryBadge({ category }: { category: BankImportCategory }) {
  if (category === "needs_review") {
    return <span className="badge badge-amber text-[10px]">{BANK_IMPORT_CATEGORY_LABELS[category]}</span>;
  }
  return <span className="badge badge-blue text-[10px]">{BANK_IMPORT_CATEGORY_LABELS[category]}</span>;
}

function TypeBadge({ type }: { type: TransactionType }) {
  return (
    <span className={clsx("badge text-[10px]", type === "income" ? "badge-green" : "badge-red")}>
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
        <label className="flex items-center gap-1.5 text-adaptive-secondary cursor-pointer">
          <input
            type="radio"
            name="rule-type"
            checked={ruleType === "vendor"}
            onChange={() => onRuleTypeChange("vendor")}
            className="border-white/20"
          />
          By vendor name
        </label>
        <label className="flex items-center gap-1.5 text-adaptive-secondary cursor-pointer">
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
          <span className="text-adaptive-secondary">
            Always categorize transactions containing{" "}
            <span className="font-mono text-adaptive-primary">{vendorPattern}</span> as:
          </span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as BankImportCategory)}
            className={clsx("select-tan", "w-44 text-[12px]")}
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
          <span className="text-adaptive-secondary">
            Always categorize {type === "income" ? "income" : "expense"} transactions of
          </span>
          <span className="text-adaptive-muted">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={ruleAmount}
            onChange={(e) => onAmountChange(e.target.value)}
            className={clsx(INPUT_CLASS, "w-28 py-1.5 text-[12px] tabular-nums")}
          />
          <span className="text-adaptive-muted">within $</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={ruleTolerance}
            onChange={(e) => onToleranceChange(e.target.value)}
            className={clsx(INPUT_CLASS, "w-20 py-1.5 text-[12px] tabular-nums")}
          />
          <span className="text-adaptive-secondary">as:</span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as BankImportCategory)}
            className={clsx("select-tan", "w-44 text-[12px]")}
          >
            {getImportCategoriesForType(type).map((f) => (
              <option key={f} value={f}>
                {BANK_IMPORT_CATEGORY_LABELS[f]}
              </option>
            ))}
          </select>
          <span className="text-adaptive-muted">(from ${amount.toFixed(2)})</span>
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

function AuditHistoryPanel({
  entries,
  loading,
}: {
  entries: TransactionAuditLogEntry[];
  loading: boolean;
}) {
  if (loading) {
    return <div className="text-[11px] text-adaptive-muted py-2">Loading history…</div>;
  }
  if (entries.length === 0) {
    return <div className="text-[11px] text-adaptive-muted py-2">No history recorded yet.</div>;
  }
  return (
    <ul className="space-y-1.5 py-2 text-[11px] text-adaptive-muted">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap gap-x-2 gap-y-0.5">
          <span className="text-adaptive-muted whitespace-nowrap">
            {new Date(entry.changed_at).toLocaleString()}
          </span>
          <span className="text-adaptive-secondary">{entry.field_changed}</span>
          <span>
            {entry.old_value ?? "—"} → {entry.new_value ?? "—"}
          </span>
          <span className="text-adaptive-muted">({entry.change_source})</span>
        </li>
      ))}
    </ul>
  );
}

export default function TransactionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedStore, loading: storesLoading } = useStores();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreFinancialProfile | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>("needs_review");
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [countRows, setCountRows] = useState<Pick<BankTransaction, "id" | "status" | "excluded">[]>([]);
  const [financialRecords, setFinancialRecords] = useState<MonthlyFinancialRecord[]>([]);
  const [utilityRecords, setUtilityRecords] = useState<MonthlyUtilityRecord[]>([]);
  const [plLinksByTxn, setPlLinksByTxn] = useState<Map<string, TransactionPlLink>>(new Map());
  const [categorizationRules, setCategorizationRules] = useState<CategorizationRule[]>([]);
  const [stagedCsv, setStagedCsv] = useState<StagedCsvRow[]>([]);
  const [categoryOverrides, setCategoryOverrides] = useState<Map<string, BankImportCategory>>(new Map());
  const [notesDraft, setNotesDraft] = useState<Map<string, string>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReclassifyModal, setBulkReclassifyModal] = useState<{
    ids: string[];
    category: BankImportCategory;
  } | null>(null);
  const [groupByVendor, setGroupByVendor] = useState(true);
  const [filterVendor, setFilterVendor] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showManageRules, setShowManageRules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postingCount, setPostingCount] = useState(0);
  const postingRef = useRef(false);
  const [duplicateImportCount, setDuplicateImportCount] = useState(0);

  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [auditLogsByTxn, setAuditLogsByTxn] = useState<Map<string, TransactionAuditLogEntry[]>>(new Map());
  const [auditLoading, setAuditLoading] = useState<Set<string>>(new Set());

  const [excludeModal, setExcludeModal] = useState<{ ids: string[]; reason: string } | null>(null);
  const [reclassifyModal, setReclassifyModal] = useState<{
    row: ReviewRow;
    newCategory: BankImportCategory;
  } | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState({
    date: formatLocalDate(new Date()),
    description: "",
    amount: "",
    type: "expense" as TransactionType,
    category: defaultManualCategory("expense"),
    note: "Manually entered",
  });

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
  const [ruleApplyPrompt, setRuleApplyPrompt] = useState<{
    rule: CategorizationRule;
    matchCount: number;
    category: BankImportCategory;
  } | null>(null);
  const [ruleApplyResult, setRuleApplyResult] = useState<{
    updatedCount: number;
    skippedManualCount: number;
    category: BankImportCategory;
  } | null>(null);
  const [rulePostPrompt, setRulePostPrompt] = useState<{
    transactions: BatchPostTransaction[];
    count: number;
    category: BankImportCategory;
  } | null>(null);
  const [ruleApplyBusy, setRuleApplyBusy] = useState(false);
  const [rulePostBusy, setRulePostBusy] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const statusCounts = useMemo(() => {
    let needsReview = 0;
    let posted = 0;
    let excluded = 0;
    for (const row of countRows) {
      if (row.excluded || row.status === "excluded") {
        excluded += 1;
      } else if (row.status === "posted") {
        posted += 1;
      } else if (isNeedsReview(row)) {
        needsReview += 1;
      }
    }
    return { needsReview, posted, excluded, total: countRows.length };
  }, [countRows]);

  const loadData = useCallback(async () => {
    if (!selectedStore?.id) {
      setStore(null);
      setTransactions([]);
      setCountRows([]);
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
        { data: countData, error: countError },
        { data: financialsData, error: financialsError },
        { data: utilitiesData, error: utilitiesError },
        { data: rulesData, error: rulesError },
      ] = await Promise.all([
        supabase.from("stores").select("*").eq("id", selectedStore.id).single(),
        supabase
          .from("bank_transactions")
          .select("id, status, excluded")
          .eq("store_id", selectedStore.id),
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
          .from("categorization_rules")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (storeError || countError || financialsError || utilitiesError || rulesError) {
        throw new Error(
          [storeError, countError, financialsError, utilitiesError, rulesError]
            .filter(Boolean)
            .map((e) => e!.message)
            .join(" · ")
        );
      }

      setStore(storeData as StoreFinancialProfile);
      setCountRows((countData ?? []) as Pick<BankTransaction, "id" | "status" | "excluded">[]);
      setFinancialRecords((financialsData ?? []) as MonthlyFinancialRecord[]);
      setUtilityRecords((utilitiesData ?? []) as MonthlyUtilityRecord[]);
      setCategorizationRules((rulesData ?? []) as CategorizationRule[]);

      let txnQuery = supabase
        .from("bank_transactions")
        .select("*")
        .eq("store_id", selectedStore.id)
        .order("transaction_date", { ascending: false });

      if (activeTab === "needs_review") {
        txnQuery = txnQuery.eq("excluded", false).not("status", "in", '("posted","excluded","reviewed")');
      } else if (activeTab === "posted") {
        txnQuery = txnQuery.eq("status", "posted").eq("excluded", false);
      } else if (activeTab === "excluded") {
        txnQuery = txnQuery.or("excluded.eq.true,status.eq.excluded");
      }

      const { data: txnData, error: txnError } = await txnQuery;
      if (txnError) throw new Error(txnError.message);

      const rows = (txnData ?? []) as BankTransaction[];
      setTransactions(rows);

      const notesMap = new Map<string, string>();
      for (const row of rows) {
        notesMap.set(row.id, row.notes ?? "");
      }
      setNotesDraft(notesMap);
      setCategoryOverrides(new Map());
      setSelectedIds(new Set());

      if (activeTab === "posted" || activeTab === "all") {
        const postedIds = rows.filter((r) => r.status === "posted").map((r) => r.id);
        if (postedIds.length > 0) {
          const { data: linkData } = await supabase
            .from("transaction_pl_links")
            .select("*")
            .in("transaction_id", postedIds);
          const linkMap = new Map<string, TransactionPlLink>();
          for (const link of (linkData ?? []) as TransactionPlLink[]) {
            linkMap.set(link.transaction_id, link);
          }
          setPlLinksByTxn(linkMap);
        } else {
          setPlLinksByTxn(new Map());
        }
      } else {
        setPlLinksByTxn(new Map());
      }
    } catch {
      setLoadError(true);
      setStore(null);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedStore?.id, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setFilterVendor("");
    setFilterName("");
    setFilterCategory("");
  }, [activeTab]);

  const reviewRows = useMemo((): ReviewRow[] => {
    return transactions.map((txn) => {
      const type = (txn.transaction_type as TransactionType | null) ?? inferTransactionType(txn.amount, txn.category);
      const amount = Math.abs(txn.amount);
      const storedCategory = txn.category as BankImportCategory | null;
      const override = categoryOverrides.get(txn.id);

      const { category: ruleCategory, suggested, ruleApplied } = categorizeWithRules(
        txn.description,
        type,
        amount,
        categorizationRules
      );

      let category: BankImportCategory;
      if (override) {
        category = override;
      } else if (ruleApplied) {
        category = ruleCategory;
      } else {
        category = storedCategory ?? suggestTransactionCategory(txn.description, type);
      }

      return {
        id: txn.id,
        transaction_date: txn.transaction_date,
        description: txn.description,
        amount,
        type,
        category,
        suggested: ruleApplied ? ruleCategory : suggested,
        ruleApplied: ruleApplied || false,
        possibleDuplicate: false,
        status: (txn.status ?? "needs_review") as TransactionStatus,
        excluded: txn.excluded ?? false,
        exclusion_reason: txn.exclusion_reason ?? null,
        notes: txn.notes ?? null,
        original_category: txn.original_category ?? null,
      };
    });
  }, [transactions, categorizationRules, categoryOverrides]);

  const filterOptions = useMemo(() => {
    const vendors = new Set<string>();
    const names = new Set<string>();
    const categories = new Set<BankImportCategory>();
    for (const row of reviewRows) {
      vendors.add(normalizeVendorPattern(row.description) || "(no description)");
      names.add(row.description?.trim() || "(no description)");
      categories.add(row.category);
    }
    return {
      vendors: Array.from(vendors).sort((a, b) => a.localeCompare(b)),
      names: Array.from(names).sort((a, b) => a.localeCompare(b)),
      categories: Array.from(categories).sort((a, b) =>
        (BANK_IMPORT_CATEGORY_LABELS[a] ?? a).localeCompare(BANK_IMPORT_CATEGORY_LABELS[b] ?? b)
      ),
    };
  }, [reviewRows]);

  const filteredReviewRows = useMemo((): ReviewRow[] => {
    return reviewRows.filter((row) => {
      if (filterVendor) {
        const vendor = normalizeVendorPattern(row.description) || "(no description)";
        if (vendor !== filterVendor) return false;
      }
      if (filterName) {
        const name = row.description?.trim() || "(no description)";
        if (name !== filterName) return false;
      }
      if (filterCategory && row.category !== filterCategory) return false;
      return true;
    });
  }, [reviewRows, filterVendor, filterName, filterCategory]);

  const hasActiveFilters = Boolean(filterVendor || filterName || filterCategory);

  const transactionGroups = useMemo((): TransactionGroup[] => {
    const map = new Map<string, TransactionGroup>();
    for (const txn of filteredReviewRows) {
      const vendorPattern = normalizeVendorPattern(txn.description);
      const groupKey = isGenericTransactionDescription(txn.description)
        ? `__individual__::${txn.id}`
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
          sampleDescription: txn.description?.trim() || "(no description)",
          count: 1,
          totalAmount: txn.amount,
          type: txn.type,
          category: txn.category,
          suggested: txn.suggested,
          ruleApplied: txn.ruleApplied,
          items: [txn],
        });
      }
    }
    return Array.from(map.values())
      .map((group) => ({
        ...group,
        sampleDescription: mostCommonDescription(group.items),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReviewRows]);

  const selectableIds = useMemo(
    () => filteredReviewRows.filter((t) => !t.possibleDuplicate).map((t) => t.id),
    [filteredReviewRows]
  );
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(selectableIds) : new Set());
  }

  function toggleSelectId(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectGroup(group: TransactionGroup, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of group.items) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  function isGroupFullySelected(group: TransactionGroup): boolean {
    return group.items.length > 0 && group.items.every((item) => selectedIds.has(item.id));
  }

  const selectedActionRows = useMemo(
    () => filteredReviewRows.filter((row) => selectedIds.has(row.id) && !isExcludedRow(row)),
    [filteredReviewRows, selectedIds]
  );

  const bulkReclassifyCategories = useMemo((): BankImportCategory[] => {
    if (!bulkReclassifyModal) return [];
    const categories = new Set<BankImportCategory>();
    for (const id of bulkReclassifyModal.ids) {
      const row =
        filteredReviewRows.find((r) => r.id === id) ?? reviewRows.find((r) => r.id === id);
      if (!row) continue;
      for (const category of getImportCategoriesForType(row.type)) {
        if (category !== "needs_review") categories.add(category);
      }
    }
    return Array.from(categories).sort((a, b) =>
      (BANK_IMPORT_CATEGORY_LABELS[a] ?? a).localeCompare(BANK_IMPORT_CATEGORY_LABELS[b] ?? b)
    );
  }, [bulkReclassifyModal, filteredReviewRows, reviewRows]);

  async function updateCategory(
    id: string,
    category: BankImportCategory,
    previousCategory: string | null,
    persist = true
  ) {
    setCategoryOverrides((prev) => new Map(prev).set(id, category));

    if (!persist) return;

    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, category, status: "user_classified" as TransactionStatus } : t))
    );

    if (!userId || !store?.id) return;

    const now = new Date().toISOString();
    await supabase
      .from("bank_transactions")
      .update({ category, status: "user_classified", modified_at: now })
      .eq("id", id);

    if (previousCategory !== category) {
      await supabase.from("transaction_audit_log").insert({
        transaction_id: id,
        store_id: store.id,
        user_id: userId,
        field_changed: "category",
        old_value: previousCategory,
        new_value: category,
        change_source: "user",
      });
    }
  }

  async function saveNotes(id: string) {
    const notes = notesDraft.get(id) ?? "";
    const previous = transactions.find((t) => t.id === id)?.notes ?? "";
    if (notes === previous) return;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("bank_transactions")
      .update({ notes: notes.trim() || null, modified_at: now })
      .eq("id", id);

    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, notes: notes.trim() || null } : t))
    );
  }

  async function toggleHistory(id: string) {
    const next = new Set(expandedHistory);
    if (next.has(id)) {
      next.delete(id);
      setExpandedHistory(next);
      return;
    }
    next.add(id);
    setExpandedHistory(next);

    if (!auditLogsByTxn.has(id)) {
      setAuditLoading((prev) => new Set(prev).add(id));
      const { data, error } = await supabase
        .from("transaction_audit_log")
        .select("*")
        .eq("transaction_id", id)
        .order("changed_at", { ascending: false });

      setAuditLoading((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });

      if (!error && data) {
        setAuditLogsByTxn((prev) => new Map(prev).set(id, data as TransactionAuditLogEntry[]));
      }
    }
  }

  function toggleGroupExpanded(groupKey: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  async function handlePostRows(rows: ReviewRow[]) {
    if (!store?.id || !userId || rows.length === 0 || postingRef.current) return;

    const postableRows = rows.filter((row) => row.status !== "posted" && !row.excluded);
    if (postableRows.length === 0) {
      setMessage({ type: "error", text: "These transactions are already posted." });
      return;
    }

    for (const row of postableRows) {
      if (!isCategoryReadyToPost(row.category)) {
        setMessage({
          type: "error",
          text: "Assign a category before posting. Transactions marked Needs Review cannot be posted.",
        });
        return;
      }
    }

    postingRef.current = true;
    setPosting(true);
    setPostingCount(postableRows.length);
    setMessage(null);

    try {
      const batch: BatchPostTransaction[] = postableRows.map((row) => {
        const txn = transactions.find((t) => t.id === row.id);
        return {
          id: row.id,
          transaction_date: row.transaction_date,
          amount: row.amount,
          category: row.category,
          status: txn?.status ?? "needs_review",
          original_category: txn?.original_category ?? null,
        };
      });

      const utilitiesLookup = buildUtilitiesLookup(utilityRecords);
      const enrichedRecords = enrichMonthlyRecords(sortRecordsDesc(financialRecords), utilitiesLookup);

      const result = await postTransactionsBatch(supabase, {
        storeId: store.id,
        userId,
        transactions: batch,
        existingRecords: enrichedRecords,
        existingUtilityRecords: utilityRecords,
        store,
        changeSource: "user",
      });

      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      invalidateValuationCache(store.id);
      setMessage({
        type: "success",
        text:
          result.postedCount === 1
            ? "Posted 1 transaction to P&L."
            : result.postedCount === 0
              ? "No new transactions were posted (already posted)."
              : `Posted ${result.postedCount} transactions to P&L.`,
      });
      await loadData();
    } finally {
      postingRef.current = false;
      setPosting(false);
      setPostingCount(0);
    }
  }

  async function confirmExclude() {
    if (!excludeModal || !userId) return;
    const reason = excludeModal.reason.trim();
    if (!reason) {
      setMessage({ type: "error", text: "Enter a reason before excluding." });
      return;
    }

    setSaving(true);
    setMessage(null);

    for (const id of excludeModal.ids) {
      const { error } = await excludeTransaction(supabase, id, reason, userId, store);
      if (error) {
        setSaving(false);
        setMessage({ type: "error", text: error });
        return;
      }
    }

    if (store?.id) invalidateValuationCache(store.id);
    setExcludeModal(null);
    setSaving(false);
    setSelectedIds(new Set());
    setMessage({
      type: "success",
      text:
        excludeModal.ids.length === 1
          ? "Transaction excluded."
          : `Excluded ${excludeModal.ids.length} transactions.`,
    });
    await loadData();
  }

  function openManualModal() {
    const type: TransactionType = "expense";
    setManualDraft({
      date: formatLocalDate(new Date()),
      description: "",
      amount: "",
      type,
      category: defaultManualCategory(type),
      note: "Manually entered",
    });
    setManualError(null);
    setManualModalOpen(true);
  }

  const manualFormValid = useMemo(() => {
    const amount = parseFloat(manualDraft.amount);
    return (
      manualDraft.description.trim().length > 0 &&
      Number.isFinite(amount) &&
      amount > 0 &&
      manualDraft.category !== "needs_review" &&
      getManualEntryCategories(manualDraft.type).includes(manualDraft.category)
    );
  }, [manualDraft]);

  async function confirmManualTransaction() {
    if (!manualFormValid || !store?.id || !userId) return;

    setManualSaving(true);
    setManualError(null);

    const amount = parseFloat(manualDraft.amount);
    const category = manualDraft.category;

    const { data, error } = await supabase
      .from("bank_transactions")
      .insert({
        store_id: store.id,
        user_id: userId,
        transaction_date: manualDraft.date,
        description: manualDraft.description.trim(),
        amount,
        category,
        transaction_type: manualDraft.type,
        original_category: category,
        status: "user_classified" as TransactionStatus,
        is_reviewed: false,
        excluded: false,
        notes: manualDraft.note.trim() || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      setManualSaving(false);
      setManualError(error?.message ?? "Could not add transaction. Please try again.");
      return;
    }

    const { error: auditError } = await supabase.from("transaction_audit_log").insert({
      transaction_id: data.id,
      store_id: store.id,
      user_id: userId,
      field_changed: "category",
      old_value: null,
      new_value: category,
      change_source: "user",
    });

    setManualSaving(false);

    if (auditError) {
      setManualError(auditError.message);
      return;
    }

    setManualModalOpen(false);
    setMessage({ type: "success", text: "Manual transaction added — review and post when ready" });
    await loadData();
  }

  async function confirmReclassify() {
    if (!reclassifyModal || !userId) return;

    setSaving(true);
    setMessage(null);

    const { error } = await reclassifyPostedTransaction(
      supabase,
      reclassifyModal.row.id,
      reclassifyModal.newCategory,
      userId,
      store
    );

    setSaving(false);

    if (error) {
      setMessage({ type: "error", text: error });
      return;
    }

    if (store?.id) invalidateValuationCache(store.id);
    setReclassifyModal(null);
    setMessage({ type: "success", text: "Transaction reclassified and P&L updated." });
    await loadData();
  }

  function openBulkReclassifyModal() {
    const ids = selectedActionRows.map((row) => row.id);
    if (ids.length === 0) {
      setMessage({ type: "error", text: "Select at least one non-excluded transaction to reclassify." });
      return;
    }
    const firstRow = selectedActionRows[0];
    const preferred =
      firstRow.category !== "needs_review"
        ? firstRow.category
        : firstRow.suggested !== "needs_review"
          ? firstRow.suggested
          : getImportCategoriesForType(firstRow.type).find((c) => c !== "needs_review") ??
            (firstRow.type === "income" ? "self_service_revenue" : "rent");
    setBulkReclassifyModal({ ids, category: preferred });
  }

  async function confirmBulkReclassify() {
    if (!bulkReclassifyModal || !userId) return;

    const category = bulkReclassifyModal.category;
    const hasPostedSelection = bulkReclassifyModal.ids.some((id) => {
      const row =
        filteredReviewRows.find((r) => r.id === id) ?? reviewRows.find((r) => r.id === id);
      return row && isPostedRow(row);
    });
    if (hasPostedSelection && !isCategoryReadyToPost(category)) {
      setMessage({ type: "error", text: "Choose a postable category for posted transactions." });
      return;
    }

    setSaving(true);
    setMessage(null);

    let updatedCount = 0;
    for (const id of bulkReclassifyModal.ids) {
      const row =
        filteredReviewRows.find((r) => r.id === id) ?? reviewRows.find((r) => r.id === id);
      if (!row || isExcludedRow(row)) continue;

      const storedCategory = transactions.find((t) => t.id === id)?.category ?? null;
      if (storedCategory === category) continue;

      if (isPostedRow(row)) {
        if (!isCategoryReadyToPost(category)) continue;
        const { error } = await reclassifyPostedTransaction(
          supabase,
          id,
          category,
          userId,
          store
        );
        if (error) {
          setSaving(false);
          setMessage({ type: "error", text: error });
          return;
        }
      } else {
        const validCategories = getImportCategoriesForType(row.type);
        if (!validCategories.includes(category)) continue;
        await updateCategory(id, category, storedCategory, true);
      }
      updatedCount += 1;
    }

    if (store?.id) invalidateValuationCache(store.id);
    setSaving(false);
    setBulkReclassifyModal(null);
    setSelectedIds(new Set());
    setMessage({
      type: "success",
      text:
        updatedCount === 1
          ? "Reclassified 1 transaction."
          : updatedCount === 0
            ? "No transactions were reclassified."
            : `Reclassified ${updatedCount} transactions.`,
    });
    await loadData();
  }

  function handleBulkExclude() {
    const ids = selectedActionRows.map((row) => row.id);
    if (ids.length === 0) {
      setMessage({ type: "error", text: "Select at least one non-excluded transaction to exclude." });
      return;
    }
    setExcludeModal({ ids, reason: "" });
  }

  function handleCSVUpload(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const parsed = parseBankCsv(text);
      if (parsed.length === 0) {
        setMessage({
          type: "error",
          text: "Could not parse CSV. Expected columns: Processed Date, Description, Credit or Debit, and Amount.",
        });
        return;
      }

      if (!store?.id) {
        setMessage({ type: "error", text: "Select a store before importing transactions." });
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
        .select("transaction_date, amount, category, transaction_type")
        .eq("store_id", store.id);

      const existingForDedup = [
        ...(existingBankRows ?? []).map((row) => ({
          transaction_date: row.transaction_date,
          amount: Math.abs(row.amount),
          type:
            (row.transaction_type as TransactionType | null) ??
            inferTransactionType(row.amount, row.category),
        })),
        ...reviewRows.map((txn) => ({
          transaction_date: txn.transaction_date,
          amount: txn.amount,
          type: txn.type,
        })),
        ...stagedCsv.map((txn) => ({
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
      const staged: StagedCsvRow[] = withDuplicateFlags.map((row, i) => {
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
      setStagedCsv((prev) => [...staged, ...prev]);
      const dupMsg =
        duplicateCount > 0
          ? ` ${duplicateCount} possible duplicate${duplicateCount === 1 ? "" : "s"} flagged.`
          : "";
      setMessage({
        type: "success",
        text: `Parsed ${staged.length} transaction${staged.length === 1 ? "" : "s"} from CSV.${dupMsg}`,
      });
    };
    reader.readAsText(file);
  }

  async function saveStagedToQueue() {
    if (!store?.id || !userId || stagedCsv.length === 0) return;
    setSaving(true);

    const rows = stagedCsv.map((t) => ({
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

    const { error } = await supabase.from("bank_transactions").insert(rows);
    setSaving(false);

    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    setStagedCsv([]);
    setMessage({
      type: "success",
      text: `Saved ${rows.length} transaction${rows.length === 1 ? "" : "s"} to review queue.`,
    });
    await loadData();
  }

  function openRuleForm(
    key: string,
    category: BankImportCategory,
    type: TransactionType,
    vendorPattern: string,
    amount: number
  ) {
    setRuleFormKey(key);
    setRuleFormCategory(category);
    setRuleFormTxnType(type);
    setRuleFormVendorPattern(vendorPattern);
    setRuleFormSourceAmount(amount);
    setRuleFormMessage(null);
  }

  function clearRuleApplyFlow() {
    setRuleApplyPrompt(null);
    setRuleApplyResult(null);
    setRulePostPrompt(null);
  }

  async function promptApplyRuleToExisting(rule: CategorizationRule, category: BankImportCategory) {
    if (!store?.id) {
      setMessage({ type: "success", text: "Rule saved" });
      return;
    }

    const { transactions: unposted, error } = await fetchUnpostedBankTransactions(supabase, store.id);
    if (error) {
      setMessage({ type: "success", text: "Rule saved" });
      return;
    }

    const plan = planRuleApplyToExisting(unposted, rule);
    if (plan.matchCount === 0) {
      setMessage({ type: "success", text: "Rule saved" });
      return;
    }

    clearRuleApplyFlow();
    setRuleApplyPrompt({ rule, matchCount: plan.matchCount, category });
  }

  async function confirmApplyRuleToExisting() {
    if (!ruleApplyPrompt || !store?.id || !userId) return;

    setRuleApplyBusy(true);
    setMessage(null);

    try {
      const { transactions: unposted, error: fetchError } = await fetchUnpostedBankTransactions(
        supabase,
        store.id
      );
      if (fetchError) {
        setMessage({ type: "error", text: fetchError });
        return;
      }

      const result = await applyCategorizationRuleToTransactions(supabase, {
        storeId: store.id,
        userId,
        rule: ruleApplyPrompt.rule,
        transactions: unposted,
      });

      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      const category = ruleApplyPrompt.category;
      setRuleApplyPrompt(null);
      setRuleApplyResult({
        updatedCount: result.updatedCount,
        skippedManualCount: result.skippedManualCount,
        category,
      });

      if (result.updatedCount > 0) {
        setRulePostPrompt({
          transactions: result.updatedTransactions.map((txn) => ({
            id: txn.id,
            transaction_date: txn.transaction_date,
            amount: txn.amount,
            category,
            status: "user_classified",
            original_category: txn.original_category ?? null,
          })),
          count: result.updatedCount,
          category,
        });
      }

      if (store.id) invalidateValuationCache(store.id);
      await loadData();
    } finally {
      setRuleApplyBusy(false);
    }
  }

  function skipApplyRuleToExisting() {
    clearRuleApplyFlow();
    setMessage({ type: "success", text: "Rule saved" });
  }

  async function confirmPostAppliedRuleTransactions() {
    if (!rulePostPrompt || !store?.id || !userId || rulePostBusy) return;

    setRulePostBusy(true);
    setMessage(null);

    try {
      const utilitiesLookup = buildUtilitiesLookup(utilityRecords);
      const enrichedRecords = enrichMonthlyRecords(sortRecordsDesc(financialRecords), utilitiesLookup);

      const result = await postTransactionsBatch(supabase, {
        storeId: store.id,
        userId,
        transactions: rulePostPrompt.transactions,
        existingRecords: enrichedRecords,
        existingUtilityRecords: utilityRecords,
        store,
        changeSource: "user",
      });

      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      invalidateValuationCache(store.id);
      setMessage({
        type: "success",
        text:
          result.postedCount === 1
            ? "Posted 1 transaction to P&L."
            : result.postedCount === 0
              ? "No new transactions were posted (already posted)."
              : `Posted ${result.postedCount} transactions to P&L.`,
      });
      clearRuleApplyFlow();
      await loadData();
    } finally {
      setRulePostBusy(false);
    }
  }

  function dismissRulePostPrompt() {
    setRulePostPrompt(null);
    setRuleApplyResult(null);
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
          setRuleFormMessage({ type: "error", text: "Couldn't save rule. Please try again." });
          return;
        }

        setCategorizationRules((prev) => [data as CategorizationRule, ...prev]);
        setRuleFormKey(null);
        await promptApplyRuleToExisting(data as CategorizationRule, ruleFormCategory);
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
        setRuleFormMessage({ type: "error", text: "Couldn't save rule. Please try again." });
        return;
      }

      setCategorizationRules((prev) => [data as CategorizationRule, ...prev]);
      setRuleFormKey(null);
      await promptApplyRuleToExisting(data as CategorizationRule, ruleFormCategory);
    } finally {
      setRuleFormSaving(false);
    }
  }

  async function deleteCategorizationRule(ruleId: string) {
    const { error } = await supabase.from("categorization_rules").delete().eq("id", ruleId);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setCategorizationRules((prev) => prev.filter((r) => r.id !== ruleId));
    setMessage({ type: "success", text: "Rule deleted." });
  }

  function updateGroupCategory(groupKey: string, category: BankImportCategory) {
    const group = transactionGroups.find((g) => g.groupKey === groupKey);
    if (!group) return;
    for (const row of group.items) {
      const txn = transactions.find((t) => t.id === row.id);
      void updateCategory(row.id, category, txn?.category ?? null, true);
    }
  }

  function reviewRowClass(index: number) {
    return clsx("review-row", index % 2 === 0 ? "review-row--odd" : "review-row--even");
  }

  function renderVendorDescription(vendorPattern: string, rawDescription: string, prefixSample = false) {
    const sample = rawDescription || "(no description)";
    return (
      <div className="min-w-0">
        <div className="review-vendor-name truncate" title={vendorPattern}>
          {vendorPattern}
        </div>
        <div className="review-vendor-desc text-[10px] truncate mt-0.5" title={sample}>
          {prefixSample && sample !== "(no description)" ? `e.g. ${sample}` : sample}
        </div>
      </div>
    );
  }

  function renderGroupSubRow(item: ReviewRow) {
    const storedCategory = transactions.find((t) => t.id === item.id)?.category ?? null;
    return (
      <tr key={`sub-${item.id}`} className="border-b border-white/[0.02] bg-white/[0.015]">
        <td className="py-2 pr-2 pl-2">
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={(e) => toggleSelectId(item.id, e.target.checked)}
            disabled={item.possibleDuplicate}
            className="rounded border-white/20 disabled:opacity-40"
            aria-label={`Select ${item.description ?? "transaction"}`}
          />
        </td>
        <td className="py-2 pr-3 pl-6">
          <div className="min-w-0">
            <div className="text-adaptive-muted whitespace-nowrap text-[11px]">
              {new Date(item.transaction_date.split("T")[0] + "T12:00:00").toLocaleDateString()}
            </div>
            <div className="text-[11px] text-adaptive-secondary truncate mt-0.5" title={item.description ?? undefined}>
              {item.description ?? "—"}
            </div>
          </div>
        </td>
        <td className="py-2 pr-3">
          <TypeBadge type={item.type} />
        </td>
        <td className="py-2 pr-3" />
        <td className="py-2 pr-3 text-right font-semibold tabular-nums text-[11px]">{fmtDollar(item.amount)}</td>
        <td className="py-2 pr-3">
          <select
            value={item.category}
            onChange={(e) => void updateCategory(item.id, e.target.value as BankImportCategory, storedCategory, true)}
            className={clsx(
              "select-tan",
              "w-40 text-[11px]",
              item.category === "needs_review" && "border-amber-500/40"
            )}
          >
            {getImportCategoriesForType(item.type).map((f) => (
              <option key={f} value={f}>
                {BANK_IMPORT_CATEGORY_LABELS[f]}
              </option>
            ))}
          </select>
        </td>
        <td className="py-2 pr-3">{renderNotesInput(item)}</td>
        <td className="py-2 text-right whitespace-nowrap">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <StatusBadge status={item.status} excluded={item.excluded} />
            <button
              type="button"
              className="btn-primary text-[11px]"
              onClick={() => void handlePostRows([item])}
              disabled={!isCategoryReadyToPost(item.category) || posting || item.status === "posted"}
            >
              {posting ? "Posting…" : "Post"}
            </button>
            <button
              type="button"
              className="btn-outline text-[11px] text-red-400 border-red-500/30"
              onClick={() => setExcludeModal({ ids: [item.id], reason: "" })}
              disabled={posting}
            >
              Exclude
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function renderNotesInput(row: ReviewRow, readOnly = false) {
    return (
      <input
        type="text"
        value={notesDraft.get(row.id) ?? ""}
        onChange={(e) => setNotesDraft((prev) => new Map(prev).set(row.id, e.target.value))}
        onBlur={() => void saveNotes(row.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        disabled={readOnly}
        placeholder="Add note…"
        className={clsx(INPUT_CLASS, "w-full min-w-[120px] py-1 text-[11px]")}
      />
    );
  }

  function renderHistoryToggle(row: ReviewRow, colSpan: number) {
    const expanded = expandedHistory.has(row.id);
    return (
      <>
        <tr className="border-b border-white/[0.02]">
          <td colSpan={colSpan} className="py-1 px-0">
            <button
              type="button"
              onClick={() => void toggleHistory(row.id)}
              className="review-history-link text-[11px]"
            >
              {expanded ? "▾ History" : "▸ History"}
            </button>
          </td>
        </tr>
        {expanded && (
          <tr className="border-b border-white/[0.04] bg-white/[0.02]">
            <td colSpan={colSpan} className="py-1 px-3">
              <AuditHistoryPanel
                entries={auditLogsByTxn.get(row.id) ?? []}
                loading={auditLoading.has(row.id)}
              />
            </td>
          </tr>
        )}
      </>
    );
  }

  function renderPostedLink(row: ReviewRow) {
    const link = plLinksByTxn.get(row.id);
    if (!link) return null;
    return (
      <div className="text-[10px] text-adaptive-muted mt-0.5">
        Posted to {MONTH_SHORT[link.month - 1]} {link.year} · {formatPlLinkCategory(link.category)}
      </div>
    );
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (!storesLoading && !selectedStore?.id) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-adaptive-muted">Select a store from the dropdown above to review transactions.</p>
      </div>
    );
  }

  if (loading || storesLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div>
        <h1 className="text-[20px] font-bold" style={{ color: "var(--text-primary)" }}>Transaction Review</h1>
        <p className="page-subtitle mt-1">
          Categorize bank transactions, post to P&L, exclude transfers, and reclassify posted items.
        </p>
      </div>

      <FormBanner message={message} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Needs Review" value={statusCounts.needsReview} />
        <KpiCard label="Posted" value={statusCounts.posted} valueColor="var(--text-success)" />
        <KpiCard label="Excluded" value={statusCounts.excluded} />
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[14px] font-semibold text-adaptive-primary">Import Bank Transactions</div>
          <div className="text-[12px] text-adaptive-muted mt-1">
            Upload a CSV, then save to the review queue before posting.
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
          <button type="button" className="btn-outline" onClick={openManualModal}>
            Add Manual Transaction
          </button>
          {stagedCsv.length > 0 && (
            <button type="button" className="btn-primary" onClick={() => void saveStagedToQueue()} disabled={saving}>
              Save {stagedCsv.length} to Queue
            </button>
          )}
        </div>
      </div>

      {stagedCsv.length > 0 && (
        <div className="rounded-lg p-3 text-[12px] bg-amber-500/10 border border-amber-500/30 text-amber-200">
          {stagedCsv.length} parsed transaction{stagedCsv.length === 1 ? "" : "s"} waiting to be saved to the queue.
          {duplicateImportCount > 0 &&
            ` ${duplicateImportCount} possible duplicate${duplicateImportCount === 1 ? "" : "s"} flagged.`}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["needs_review", `Needs Review (${statusCounts.needsReview})`],
            ["posted", `Posted (${statusCounts.posted})`],
            ["excluded", `Excluded (${statusCounts.excluded})`],
            ["all", `All (${statusCounts.total})`],
          ] as [StatusTab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
              activeTab === tab
                ? "bg-blue-500/20 text-adaptive-info border border-blue-500/30"
                : "text-adaptive-muted border border-white/[0.06] hover:text-adaptive-secondary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="section-title flex flex-wrap items-center gap-3">
          <span>
            {activeTab === "needs_review" && "Review Queue"}
            {activeTab === "posted" && "Posted Transactions"}
            {activeTab === "excluded" && "Excluded Transactions"}
            {activeTab === "all" && "All Transactions"}
          </span>
          <span className="text-[11px] text-adaptive-muted font-normal">
            {hasActiveFilters
              ? `${filteredReviewRows.length} of ${reviewRows.length} shown`
              : `${reviewRows.length} shown`}
          </span>
          <button
            type="button"
            className="ml-auto text-[12px] text-adaptive-info hover:text-adaptive-info"
            onClick={() => setShowManageRules((v) => !v)}
          >
            {showManageRules ? "Hide Rules" : "Manage Rules"}
            {categorizationRules.length > 0 && (
              <span className="ml-1.5 badge badge-blue text-[10px]">{categorizationRules.length}</span>
            )}
          </button>
          {activeTab === "needs_review" && (
            <>
              <label className="flex items-center gap-2 text-[12px] text-adaptive-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupByVendor}
                  onChange={(e) => {
                    setGroupByVendor(e.target.checked);
                    if (!e.target.checked) setExpandedGroups(new Set());
                  }}
                  className="rounded border-white/20"
                />
                Group similar vendors
              </label>
              {groupByVendor && transactionGroups.some((g) => g.count > 1) && (
                <button
                  type="button"
                  className="text-[12px] text-adaptive-info hover:text-adaptive-info"
                  onClick={() => {
                    const multiGroups = transactionGroups.filter((g) => g.count > 1);
                    const allExpanded = multiGroups.every((g) => expandedGroups.has(g.groupKey));
                    if (allExpanded) {
                      setExpandedGroups(new Set());
                    } else {
                      setExpandedGroups(new Set(multiGroups.map((g) => g.groupKey)));
                    }
                  }}
                >
                  {transactionGroups.filter((g) => g.count > 1).every((g) => expandedGroups.has(g.groupKey))
                    ? "Collapse All"
                    : "Expand All"}
                </button>
              )}
            </>
          )}
        </div>

        {showManageRules && (
          <div className="mb-4 p-4 rounded-lg bg-[var(--bg-page)] dark:bg-[#243347]/50 border border-[var(--border)] dark:border-white/[0.06]">
            <div className="text-[13px] font-medium text-adaptive-secondary mb-3">Categorization Rules</div>
            {categorizationRules.length === 0 ? (
              <p className="text-[12px] text-adaptive-muted">
                No rules yet. Use &quot;Set as Rule&quot; on a transaction to auto-categorize future imports.
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
                      <div className="text-[12px] text-adaptive-secondary">
                        {isAmountRule ? (
                          <>
                            When{" "}
                            <span className="text-adaptive-primary">
                              {rule.transaction_type === "income" ? "income" : "expense"}
                            </span>{" "}
                            amount ={" "}
                            <span className="font-mono text-adaptive-primary">
                              ${Number(rule.amount ?? 0).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <>When description contains &apos;{rule.vendor_pattern}&apos;</>
                        )}
                        <span className="text-adaptive-muted mx-2">→</span>
                        <CategoryBadge category={rule.category as BankImportCategory} />
                      </div>
                      <button
                        type="button"
                        className="text-[11px] text-red-400 hover:text-red-300"
                        onClick={() => void deleteCategorizationRule(rule.id)}
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <RuleApplyPrompt
          applyPrompt={ruleApplyPrompt}
          applyResult={ruleApplyResult}
          postPrompt={rulePostPrompt}
          applying={ruleApplyBusy}
          posting={rulePostBusy || posting}
          onApplyAll={() => void confirmApplyRuleToExisting()}
          onSkipApply={skipApplyRuleToExisting}
          onPostAll={() => void confirmPostAppliedRuleTransactions()}
          onReviewFirst={dismissRulePostPrompt}
        />

        {someSelected && (
          <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span className="text-[12px] text-adaptive-info font-medium">{selectedIds.size} selected</span>
            <button
              type="button"
              className="btn-outline text-[11px]"
              onClick={openBulkReclassifyModal}
              disabled={selectedActionRows.length === 0 || saving}
            >
              Reclassify
            </button>
            <button
              type="button"
              className="btn-outline text-[11px] text-red-400 border-red-500/30"
              onClick={handleBulkExclude}
              disabled={selectedActionRows.length === 0 || saving}
            >
              Exclude
            </button>
          </div>
        )}

        {reviewRows.length > 0 && (
          <div className="flex flex-wrap items-end gap-4 mb-4 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
            <div>
              <div className="metric-label mb-1.5">Vendor</div>
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className={clsx("select-tan", "w-44 text-[12px]")}
                aria-label="Filter by vendor"
              >
                <option value="">All vendors</option>
                {filterOptions.vendors.map((vendor) => (
                  <option key={vendor} value={vendor}>
                    {vendor}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="metric-label mb-1.5">Name</div>
              <select
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                className={clsx("select-tan", "w-52 text-[12px]")}
                aria-label="Filter by name"
              >
                <option value="">All names</option>
                {filterOptions.names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="metric-label mb-1.5">Category</div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className={clsx("select-tan", "w-44 text-[12px]")}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {filterOptions.categories.map((category) => (
                  <option key={category} value={category}>
                    {BANK_IMPORT_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-outline text-[11px]"
              onClick={() => {
                setFilterVendor("");
                setFilterName("");
                setFilterCategory("");
              }}
              disabled={!hasActiveFilters}
            >
              Clear Filters
            </button>
          </div>
        )}

        {reviewRows.length === 0 ? (
          <p className="text-[13px] text-adaptive-muted py-6 text-center">
            {activeTab === "needs_review"
              ? "No transactions to review. Upload a CSV to get started."
              : "No transactions in this view."}
          </p>
        ) : filteredReviewRows.length === 0 ? (
          <p className="text-[13px] text-adaptive-muted py-6 text-center">
            No transactions match the selected filters.
          </p>
        ) : activeTab === "needs_review" && groupByVendor ? (
          <div className="table-scroll">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left review-table-header">
                  <th className="pb-3 pr-2 font-medium w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="rounded border-white/20"
                      aria-label="Select all transactions"
                    />
                  </th>
                  <th className="pb-3 pr-3 font-medium">Vendor</th>
                  <th className="pb-3 pr-3 font-medium">Type</th>
                  <th className="pb-3 pr-3 font-medium">Count</th>
                  <th className="pb-3 pr-3 font-medium text-right">Total</th>
                  <th className="pb-3 pr-3 font-medium">Category</th>
                  <th className="pb-3 pr-3 font-medium">Notes</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactionGroups.map((group, groupIndex) => {
                  const isExpanded = expandedGroups.has(group.groupKey);
                  const canExpand = group.count > 1;
                  return (
                  <Fragment key={group.groupKey}>
                    <tr className={reviewRowClass(groupIndex)}>
                      <td className="py-3 pr-2">
                        <input
                          type="checkbox"
                          checked={isGroupFullySelected(group)}
                          onChange={(e) => toggleSelectGroup(group, e.target.checked)}
                          className="rounded border-white/20"
                          aria-label={`Select ${group.vendorPattern}`}
                        />
                      </td>
                      <td className="py-3 pr-3 max-w-[240px]">
                        <div className="flex items-start gap-1.5">
                          {canExpand ? (
                            <button
                              type="button"
                              onClick={() => toggleGroupExpanded(group.groupKey)}
                              className="text-adaptive-muted hover:text-adaptive-secondary w-5 shrink-0 mt-0.5 text-[13px] leading-none"
                              aria-label={isExpanded ? "Collapse group" : "Expand group"}
                            >
                              {isExpanded ? "▾" : "▸"}
                            </button>
                          ) : (
                            <span className="w-5 shrink-0" />
                          )}
                          {renderVendorDescription(
                            group.vendorPattern,
                            group.sampleDescription,
                            canExpand
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <TypeBadge type={group.type} />
                      </td>
                      <td className="py-3 pr-3 text-adaptive-muted">{group.count}</td>
                      <td className="py-3 pr-3 text-right font-semibold tabular-nums">{fmtDollar(group.totalAmount)}</td>
                      <td className="py-3 pr-3">
                        <select
                          value={group.category}
                          onChange={(e) =>
                            updateGroupCategory(group.groupKey, e.target.value as BankImportCategory)
                          }
                          className={clsx("select-tan", "w-40 text-[12px]")}
                        >
                          {getImportCategoriesForType(group.type).map((f) => (
                            <option key={f} value={f}>
                              {BANK_IMPORT_CATEGORY_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-3 text-adaptive-muted text-[11px]">—</td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          className="btn-primary text-[11px] mr-1.5"
                          onClick={() => void handlePostRows(group.items)}
                          disabled={!isCategoryReadyToPost(group.category) || posting}
                        >
                          {posting ? "Posting…" : "Post All"}
                        </button>
                        <button
                          type="button"
                          className="btn-outline text-[11px] mr-1.5 text-red-400 border-red-500/30"
                          onClick={() =>
                            setExcludeModal({ ids: group.items.map((i) => i.id), reason: "" })
                          }
                          disabled={posting}
                        >
                          Exclude All
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-adaptive-info"
                          onClick={() =>
                            openRuleForm(
                              group.groupKey,
                              group.category,
                              group.type,
                              group.vendorPattern,
                              group.items[0]?.amount ?? group.totalAmount
                            )
                          }
                        >
                          Set as Rule
                        </button>
                      </td>
                    </tr>
                    {isExpanded &&
                      canExpand &&
                      group.items.map((item) => renderGroupSubRow(item))}
                    {group.count === 1 && renderHistoryToggle(group.items[0], 8)}
                    {ruleFormKey === group.groupKey && (
                      <tr className="border-b border-white/[0.04] bg-blue-500/5">
                        <td colSpan={8} className="py-3 px-3">
                          <RuleFormPanel
                            type={group.type}
                            vendorPattern={group.vendorPattern}
                            amount={group.items[0]?.amount ?? group.totalAmount}
                            category={ruleFormCategory}
                            ruleType={ruleFormType}
                            ruleAmount={ruleFormAmount}
                            ruleTolerance={ruleFormTolerance}
                            onRuleTypeChange={setRuleFormType}
                            onCategoryChange={setRuleFormCategory}
                            onAmountChange={setRuleFormAmount}
                            onToleranceChange={setRuleFormTolerance}
                            onSave={() => void saveCategorizationRule()}
                            onCancel={() => setRuleFormKey(null)}
                            saving={ruleFormSaving}
                            message={ruleFormMessage}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left review-table-header">
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
                  <th className="pb-3 pr-3 font-medium">Status</th>
                  <th className="pb-3 pr-3 font-medium">Category</th>
                  <th className="pb-3 pr-3 font-medium">Notes</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReviewRows.map((row, rowIndex) => {
                  const storedCategory = transactions.find((t) => t.id === row.id)?.category ?? null;
                  const excluded = isExcludedRow(row);
                  const posted = isPostedRow(row);
                  const needsReview = isNeedsReview(row);
                  const colSpan = 9;

                  return (
                    <Fragment key={row.id}>
                      <tr className={reviewRowClass(rowIndex)}>
                        <td className="py-3 pr-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={(e) => toggleSelectId(row.id, e.target.checked)}
                            disabled={row.possibleDuplicate}
                            className="rounded border-white/20 disabled:opacity-40"
                            aria-label={`Select ${row.description ?? "transaction"}`}
                          />
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                          {new Date(row.transaction_date.split("T")[0] + "T12:00:00").toLocaleDateString()}
                        </td>
                        <td className="py-3 pr-3 text-adaptive-secondary max-w-[180px]">
                          {renderVendorDescription(
                            normalizeVendorPattern(row.description) || "—",
                            row.description ?? "—"
                          )}
                          {posted && renderPostedLink(row)}
                          {excluded && row.exclusion_reason && (
                            <div className="text-[10px] text-red-400/80 mt-0.5 truncate" title={row.exclusion_reason}>
                              {row.exclusion_reason}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <TypeBadge type={row.type} />
                        </td>
                        <td className="py-3 pr-3 text-right font-semibold tabular-nums">{fmtDollar(row.amount)}</td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={row.status} excluded={row.excluded} />
                        </td>
                        <td className="py-3 pr-3">
                          {excluded ? (
                            <span className="text-adaptive-muted">
                              {row.original_category
                                ? BANK_IMPORT_CATEGORY_LABELS[row.original_category as BankImportCategory] ??
                                  row.original_category
                                : "—"}
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <select
                                value={row.category}
                                onChange={(e) => {
                                  const newCategory = e.target.value as BankImportCategory;
                                  if (posted) {
                                    void updateCategory(row.id, newCategory, storedCategory, false);
                                    return;
                                  }
                                  void updateCategory(row.id, newCategory, storedCategory, true);
                                }}
                                className={clsx(
                                  "select-tan",
                                  "w-40 text-[12px]",
                                  row.category === "needs_review" && "border-amber-500/40"
                                )}
                              >
                                {getImportCategoriesForType(row.type).map((f) => (
                                  <option key={f} value={f}>
                                    {BANK_IMPORT_CATEGORY_LABELS[f]}
                                  </option>
                                ))}
                              </select>
                              {needsReview && (
                                <div className="flex flex-wrap gap-1">
                                  <CategoryBadge category={row.suggested} />
                                  <RuleAppliedBadge kind={row.ruleApplied} />
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-3">{renderNotesInput(row, excluded)}</td>
                        <td className="py-3 text-right whitespace-nowrap">
                          {(activeTab === "needs_review" || (activeTab === "all" && needsReview)) && (
                            <>
                              <button
                                type="button"
                                className="btn-primary text-[11px] mr-1.5"
                                onClick={() => void handlePostRows([row])}
                                disabled={
                                  !isCategoryReadyToPost(row.category) || posting || row.status === "posted"
                                }
                              >
                                {posting ? "Posting…" : "Post"}
                              </button>
                              <button
                                type="button"
                                className="btn-outline text-[11px] mr-1.5 text-red-400 border-red-500/30"
                                onClick={() => setExcludeModal({ ids: [row.id], reason: "" })}
                              >
                                Exclude
                              </button>
                              <button
                                type="button"
                                className="text-[11px] text-adaptive-info"
                                onClick={() =>
                                  openRuleForm(
                                    row.id,
                                    row.category,
                                    row.type,
                                    normalizeVendorPattern(row.description),
                                    row.amount
                                  )
                                }
                              >
                                Rule
                              </button>
                            </>
                          )}
                          {(activeTab === "posted" || (activeTab === "all" && posted)) && (
                            <>
                              <button
                                type="button"
                                className="btn-primary text-[11px] mr-1.5"
                                onClick={() => {
                                  const stored = (storedCategory ?? "") as BankImportCategory;
                                  if (row.category === stored) {
                                    setMessage({ type: "error", text: "Choose a different category to reclassify." });
                                    return;
                                  }
                                  if (!isCategoryReadyToPost(row.category)) {
                                    setMessage({ type: "error", text: "Choose a postable category to reclassify." });
                                    return;
                                  }
                                  setReclassifyModal({ row, newCategory: row.category });
                                }}
                                disabled={saving}
                              >
                                Reclassify
                              </button>
                              <button
                                type="button"
                                className="btn-outline text-[11px] text-red-400 border-red-500/30"
                                onClick={() => setExcludeModal({ ids: [row.id], reason: "" })}
                              >
                                Exclude
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                      {renderHistoryToggle(row, colSpan)}
                      {ruleFormKey === row.id && activeTab === "needs_review" && (
                        <tr className="border-b border-white/[0.04] bg-blue-500/5">
                          <td colSpan={colSpan} className="py-3 px-3">
                            <RuleFormPanel
                              type={row.type}
                              vendorPattern={normalizeVendorPattern(row.description)}
                              amount={row.amount}
                              category={ruleFormCategory}
                              ruleType={ruleFormType}
                              ruleAmount={ruleFormAmount}
                              ruleTolerance={ruleFormTolerance}
                              onRuleTypeChange={setRuleFormType}
                              onCategoryChange={setRuleFormCategory}
                              onAmountChange={setRuleFormAmount}
                              onToleranceChange={setRuleFormTolerance}
                              onSave={() => void saveCategorizationRule()}
                              onCancel={() => setRuleFormKey(null)}
                              saving={ruleFormSaving}
                              message={ruleFormMessage}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {excludeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card max-w-md w-full space-y-4">
            <div className="text-[15px] font-semibold text-adaptive-primary">
              Exclude {excludeModal.ids.length === 1 ? "Transaction" : `${excludeModal.ids.length} Transactions`}
            </div>
            <p className="text-[12px] text-adaptive-muted">
              {excludeModal.ids.length === 1 && transactions.find((t) => t.id === excludeModal.ids[0])?.status === "posted"
                ? "This transaction was posted to P&L. Excluding will reverse the P&L impact."
                : "Excluded transactions will not appear in the review queue."}
            </p>
            <div>
              <label className="text-[12px] text-adaptive-muted block mb-1">Reason (required)</label>
              <input
                type="text"
                value={excludeModal.reason}
                onChange={(e) => setExcludeModal({ ...excludeModal, reason: e.target.value })}
                className={clsx(INPUT_CLASS, "w-full py-2 text-[12px]")}
                placeholder="e.g. Internal transfer, personal expense"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setExcludeModal(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void confirmExclude()} disabled={saving}>
                {saving ? "Excluding…" : "Exclude"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkReclassifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card max-w-md w-full space-y-4">
            <div className="text-[15px] font-semibold text-adaptive-primary">
              Reclassify {bulkReclassifyModal.ids.length === 1 ? "Transaction" : `${bulkReclassifyModal.ids.length} Transactions`}
            </div>
            <p className="text-[12px] text-adaptive-muted">
              Choose a category to apply to all selected transactions. Posted transactions will have their P&L updated.
            </p>
            <div>
              <label className="text-[12px] text-adaptive-muted block mb-1">New category</label>
              <select
                value={bulkReclassifyModal.category}
                onChange={(e) =>
                  setBulkReclassifyModal({
                    ...bulkReclassifyModal,
                    category: e.target.value as BankImportCategory,
                  })
                }
                className={clsx("select-tan", "w-full text-[12px]")}
              >
                {bulkReclassifyCategories.map((category) => (
                  <option key={category} value={category}>
                    {BANK_IMPORT_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setBulkReclassifyModal(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void confirmBulkReclassify()}
                disabled={saving || bulkReclassifyCategories.length === 0}
              >
                {saving ? "Reclassifying…" : "Reclassify"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reclassifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card max-w-md w-full space-y-4">
            <div className="text-[15px] font-semibold text-adaptive-primary">Reclassify Posted Transaction</div>
            <p className="text-[12px] text-adaptive-muted">
              Move {fmtDollar(reclassifyModal.row.amount)} from{" "}
              <span className="text-adaptive-secondary">
                {BANK_IMPORT_CATEGORY_LABELS[
                  (transactions.find((t) => t.id === reclassifyModal.row.id)?.category ??
                    reclassifyModal.row.category) as BankImportCategory
                ] ?? transactions.find((t) => t.id === reclassifyModal.row.id)?.category}
              </span>{" "}
              to{" "}
              <span className="text-adaptive-secondary">
                {BANK_IMPORT_CATEGORY_LABELS[reclassifyModal.newCategory]}
              </span>
              ? P&L will be adjusted for the original posting period.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setReclassifyModal(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void confirmReclassify()} disabled={saving}>
                {saving ? "Reclassifying…" : "Reclassify"}
              </button>
            </div>
          </div>
        </div>
      )}

      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card max-w-md w-full space-y-4">
            <div className="text-[15px] font-semibold text-adaptive-primary">Add Manual Transaction</div>
            <p className="text-[12px] text-adaptive-muted">
              Enter a transaction manually. It will appear in the review queue for posting to P&L.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] text-adaptive-muted block mb-1">Date</label>
                <input
                  type="date"
                  value={manualDraft.date}
                  onChange={(e) => setManualDraft((prev) => ({ ...prev, date: e.target.value }))}
                  className={clsx(INPUT_CLASS, "w-full py-2 text-[12px]")}
                />
              </div>
              <div>
                <label className="text-[12px] text-adaptive-muted block mb-1">Description</label>
                <input
                  type="text"
                  value={manualDraft.description}
                  onChange={(e) => setManualDraft((prev) => ({ ...prev, description: e.target.value }))}
                  className={clsx(INPUT_CLASS, "w-full py-2 text-[12px]")}
                  placeholder="e.g. Cash deposit, vendor payment"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[12px] text-adaptive-muted block mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={manualDraft.amount}
                  onChange={(e) => setManualDraft((prev) => ({ ...prev, amount: e.target.value }))}
                  className={clsx(INPUT_CLASS, "w-full py-2 text-[12px] tabular-nums")}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-[12px] text-adaptive-muted block mb-1">Type</label>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 text-adaptive-secondary cursor-pointer">
                    <input
                      type="radio"
                      name="manual-txn-type"
                      checked={manualDraft.type === "income"}
                      onChange={() =>
                        setManualDraft((prev) => ({
                          ...prev,
                          type: "income",
                          category: getManualEntryCategories("income").includes(prev.category)
                            ? prev.category
                            : defaultManualCategory("income"),
                        }))
                      }
                      className="border-white/20"
                    />
                    Income
                  </label>
                  <label className="flex items-center gap-1.5 text-adaptive-secondary cursor-pointer">
                    <input
                      type="radio"
                      name="manual-txn-type"
                      checked={manualDraft.type === "expense"}
                      onChange={() =>
                        setManualDraft((prev) => ({
                          ...prev,
                          type: "expense",
                          category: getManualEntryCategories("expense").includes(prev.category)
                            ? prev.category
                            : defaultManualCategory("expense"),
                        }))
                      }
                      className="border-white/20"
                    />
                    Expense
                  </label>
                </div>
              </div>
              <div>
                <label className="text-[12px] text-adaptive-muted block mb-1">Category</label>
                <select
                  value={manualDraft.category}
                  onChange={(e) =>
                    setManualDraft((prev) => ({ ...prev, category: e.target.value as BankImportCategory }))
                  }
                  className={clsx("select-tan", "w-full text-[12px]")}
                >
                  {getManualEntryCategories(manualDraft.type).map((f) => (
                    <option key={f} value={f}>
                      {BANK_IMPORT_CATEGORY_LABELS[f]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] text-adaptive-muted block mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={manualDraft.note}
                  onChange={(e) => setManualDraft((prev) => ({ ...prev, note: e.target.value }))}
                  className={clsx(INPUT_CLASS, "w-full py-2 text-[12px]")}
                />
              </div>
            </div>
            {manualError && (
              <div className="rounded-lg px-3 py-2 text-[12px] bg-red-500/10 border border-red-500/20 text-red-400">
                {manualError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setManualModalOpen(false)}
                disabled={manualSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void confirmManualTransaction()}
                disabled={!manualFormValid || manualSaving}
              >
                {manualSaving ? "Adding…" : "Add Transaction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
