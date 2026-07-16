"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { useAlertEvaluation } from "@/components/alerts/AlertNotificationProvider";
import { getStoreValuation } from "@/lib/getStoreValuation";
import type { ValuationResult } from "@/lib/valuation";
import {
  calcEstimatedBalance,
  calcRemainingMonths,
  calcPayoffDate,
  generatePayoffSchedule,
} from "@/lib/amortization";
import { calcDSCR, DSCR_NO_DEBT_LABEL, fmtDollar, fmtMultiple } from "@/lib/calculations";
import { computeStoreDscr } from "@/lib/dscr";
import {
  calcStoreTtmFromFinancials,
  type MonthlyFinancialRecord,
} from "@/lib/financials";
import { DisclaimerLabel } from "@/components/ui/Disclaimer";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { KpiCard } from "@/components/ui/KpiCard";
import { LoanCalculatorMobileShell } from "@/components/debt/LoanCalculatorMobileShell";
import { LoanCalculatorPanel } from "@/components/debt/LoanCalculatorPanel";
import { useToast } from "@/components/ui/ToastProvider";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageError } from "@/components/ui/PageError";
import { ReadOnlyGuard } from "@/components/ui/ReadOnlyGuard";
import { useWriteGuard } from "@/lib/useWriteGuard";
import {
  INPUT_CLASS,
  formatDate,
  preventEnterSubmit,
} from "@/components/occupancy/shared";

// ─── Types ───────────────────────────────────────────────────────────────────

type StoreLoan = {
  id: string;
  user_id: string;
  store_id: string;
  is_active: boolean;
  lender_name: string | null;
  loan_type: string | null;
  original_balance: number | null;
  current_balance: number | null;
  interest_rate: number | null;
  monthly_payment: number | null;
  loan_start_date: string | null;
  loan_end_date: string | null;
  amortization_term_months: number | null;
  balloon_payment: boolean | null;
  balloon_date: string | null;
  balloon_amount: number | null;
  notes: string | null;
  updated_at: string | null;
};

type LoanForm = {
  lender_name: string;
  loan_type: string;
  original_balance: string;
  current_balance: string;
  interest_rate: string;
  monthly_payment: string;
  loan_start_date: string;
  loan_end_date: string;
  amortization_term_months: string;
  balloon_payment: boolean;
  balloon_date: string;
  balloon_amount: string;
  notes: string;
};

type EnrichedLoan = StoreLoan & {
  estimatedCurrentBalance: number;
  remainingMonths: number;
  payoffDate: string;
  pctPaidOff: number;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const LOAN_TYPES = [
  "Equipment",
  "SBA",
  "Real Estate",
  "Line of Credit",
  "Seller Financing",
  "Other",
];

const LOAN_TYPE_BADGE: Record<string, string> = {
  Equipment: "badge-amber",
  SBA: "badge-blue",
  "Real Estate": "badge-green",
  "Line of Credit": "badge-blue",
  "Seller Financing": "badge-amber",
  Other: "badge-blue",
};

function emptyLoanForm(): LoanForm {
  return {
    lender_name: "",
    loan_type: "Equipment",
    original_balance: "",
    current_balance: "",
    interest_rate: "",
    monthly_payment: "",
    loan_start_date: "",
    loan_end_date: "",
    amortization_term_months: "",
    balloon_payment: false,
    balloon_date: "",
    balloon_amount: "",
    notes: "",
  };
}

function loanToForm(loan: StoreLoan): LoanForm {
  return {
    lender_name: loan.lender_name ?? "",
    loan_type: loan.loan_type ?? "Equipment",
    original_balance: loan.original_balance != null ? String(loan.original_balance) : "",
    current_balance: loan.current_balance != null ? String(loan.current_balance) : "",
    interest_rate: loan.interest_rate != null ? String(loan.interest_rate) : "",
    monthly_payment: loan.monthly_payment != null ? String(loan.monthly_payment) : "",
    loan_start_date: loan.loan_start_date?.split("T")[0] ?? "",
    loan_end_date: loan.loan_end_date?.split("T")[0] ?? "",
    amortization_term_months:
      loan.amortization_term_months != null ? String(loan.amortization_term_months) : "",
    balloon_payment: loan.balloon_payment ?? false,
    balloon_date: loan.balloon_date?.split("T")[0] ?? "",
    balloon_amount: loan.balloon_amount != null ? String(loan.balloon_amount) : "",
    notes: loan.notes ?? "",
  };
}

function parseNum(value: string): number | null {
  if (!value.trim()) return null;
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function enrichLoan(loan: StoreLoan): EnrichedLoan {
  const estimatedCurrentBalance = calcEstimatedBalance({
    currentBalance: loan.current_balance ?? 0,
    interestRate: loan.interest_rate ?? 0,
    monthlyPayment: loan.monthly_payment ?? 0,
    loanStartDate: loan.loan_start_date ?? undefined,
    lastUpdated: loan.updated_at ?? undefined,
  });
  const remainingMonths = calcRemainingMonths({
    currentBalance: estimatedCurrentBalance,
    interestRate: loan.interest_rate ?? 0,
    monthlyPayment: loan.monthly_payment ?? 0,
    loanStartDate: loan.loan_start_date ?? undefined,
    amortizationTermMonths: loan.amortization_term_months ?? undefined,
  });
  const payoffDate = calcPayoffDate(remainingMonths);
  const original = loan.original_balance ?? 0;
  const pctPaidOff =
    original > 0 ? ((original - estimatedCurrentBalance) / original) * 100 : 0;

  return {
    ...loan,
    estimatedCurrentBalance,
    remainingMonths,
    payoffDate,
    pctPaidOff: Math.max(0, Math.min(100, pctPaidOff)),
  };
}

function variancePct(variance: number, scheduled: number): number {
  if (scheduled === 0) return variance === 0 ? 0 : 100;
  return Math.abs(variance / scheduled) * 100;
}

function varianceColorClass(variance: number, scheduled: number): string {
  return variancePct(variance, scheduled) > 5 ? "text-red-400" : "text-green-400";
}

function dscrColorClass(dscr: number): string {
  if (dscr >= 1.25) return "text-green-400";
  if (dscr >= 1.0) return "text-amber-400";
  return "text-red-400";
}

function fmtVariance(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${fmtDollar(Math.abs(value))}`;
}

function earliestLoanEndDate(loans: EnrichedLoan[]): string {
  const dates = loans
    .map((l) => l.loan_end_date)
    .filter(Boolean)
    .map((d) => new Date(d!.split("T")[0]))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (dates.length === 0) return "—";
  const earliest = dates.reduce((min, d) => (d < min ? d : min));
  return earliest.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatAxisValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value}`;
}

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg p-3 text-xs shadow-lg"
      style={{ background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
    >
      <div style={{ color: "var(--text-muted)" }} className="mb-1">{label}</div>
      <div className="font-semibold">{fmtDollar(payload[0].value)}</div>
    </div>
  );
};

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="metric-label mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={clsx(
          "relative w-10 h-5 rounded-full transition-colors",
          value ? "bg-blue-500" : "bg-slate-600"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
            value ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DebtPage() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedStore, isAllStores, stores } = useStores();
  const toast = useToast();
  const { evaluateAlerts } = useAlertEvaluation();
  const { canWrite, blockedReason } = useWriteGuard();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [userId, setUserId] = useState<string | null>(null);
  const [loans, setLoans] = useState<StoreLoan[]>([]);
  const [valuation, setValuation] = useState<(ValuationResult & { store: Record<string, unknown> }) | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LoanForm>(emptyLoanForm());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [financialRecords, setFinancialRecords] = useState<MonthlyFinancialRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      if (!selectedStore?.id) {
        setLoans([]);
        setValuation(null);
        setFinancialRecords([]);
        setLoading(false);
        return;
      }

      const [
        { data: loansData, error: loansError },
        storeValuation,
        { data: financialsData, error: financialsError },
      ] = await Promise.all([
        supabase
          .from("store_loans")
          .select("*")
          .eq("store_id", selectedStore.id)
          .eq("is_active", true)
          .order("current_balance", { ascending: false }),
        getStoreValuation(selectedStore.id),
        supabase
          .from("monthly_financials")
          .select("*")
          .eq("store_id", selectedStore.id)
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
      ]);

      if (loansError) throw loansError;
      if (financialsError) throw financialsError;

      setLoans((loansData ?? []) as StoreLoan[]);
      setValuation(storeValuation);
      setFinancialRecords((financialsData ?? []) as MonthlyFinancialRecord[]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedStore, supabase, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const enrichedLoans = useMemo(() => loans.map(enrichLoan), [loans]);

  const ttm = useMemo(() => calcStoreTtmFromFinancials(financialRecords), [financialRecords]);

  const debtServiceAnalysis = useMemo(() => {
    const scheduledMonthly = enrichedLoans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
    const scheduledAnnual = scheduledMonthly * 12;
    const hasActualData = ttm.monthsUsed > 0;
    const actualMonthlyAvg = hasActualData ? ttm.ttmActualDebtService / ttm.monthsUsed : null;
    const actualAnnualTotal = hasActualData ? ttm.ttmActualDebtService : null;
    const monthlyVariance =
      actualMonthlyAvg != null ? actualMonthlyAvg - scheduledMonthly : null;
    const annualVariance =
      actualAnnualTotal != null ? actualAnnualTotal - scheduledAnnual : null;
    const monthlyVariancePct =
      monthlyVariance != null ? variancePct(monthlyVariance, scheduledMonthly) : null;

    const scheduledDscr = computeStoreDscr(ttm.ttmEbitda, scheduledAnnual);
    const actualDscr = calcDSCR(ttm.ttmEbitda, actualAnnualTotal ?? 0);

    return {
      scheduledMonthly,
      scheduledAnnual,
      actualMonthlyAvg,
      actualAnnualTotal,
      monthlyVariance,
      annualVariance,
      monthlyVariancePct,
      scheduledDscr,
      actualDscr,
      hasActualData,
    };
  }, [enrichedLoans, ttm]);

  const totals = useMemo(() => {
    const totalDebt = enrichedLoans.reduce((s, l) => s + l.estimatedCurrentBalance, 0);
    const totalOriginalDebt = enrichedLoans.reduce((s, l) => s + (l.original_balance ?? 0), 0);
    const totalMonthlyPayment = enrichedLoans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
    const totalAnnualDebtService = totalMonthlyPayment * 12;

    const weightedAvgRate =
      totalDebt > 0
        ? enrichedLoans.reduce(
            (s, l) => s + l.estimatedCurrentBalance * (l.interest_rate ?? 0),
            0
          ) / totalDebt
        : 0;

    const earliestPayoff =
      enrichedLoans.length > 0
        ? enrichedLoans.reduce((min, l) =>
            l.remainingMonths < min.remainingMonths ? l : min
          )
        : null;

    const storeValue = valuation?.businessValue ?? 0;
    const storeEquity = storeValue - totalDebt;

    return {
      totalDebt,
      totalOriginalDebt,
      totalMonthlyPayment,
      totalAnnualDebtService,
      weightedAvgRate,
      earliestPayoff,
      storeValue,
      storeEquity,
    };
  }, [enrichedLoans, valuation]);

  const largestLoan = useMemo(() => {
    if (enrichedLoans.length === 0) return null;
    return enrichedLoans.reduce((max, l) =>
      l.estimatedCurrentBalance > max.estimatedCurrentBalance ? l : max
    );
  }, [enrichedLoans]);

  const payoffSchedule = useMemo(() => {
    if (!largestLoan) return [];
    return generatePayoffSchedule(
      {
        currentBalance: largestLoan.current_balance ?? 0,
        interestRate: largestLoan.interest_rate ?? 0,
        monthlyPayment: largestLoan.monthly_payment ?? 0,
        lastUpdated: largestLoan.updated_at ?? undefined,
      },
      24
    );
  }, [largestLoan]);

  function openAddLoan() {
    if (!canWrite) {
      toast.error(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    setEditingId(null);
    setForm(emptyLoanForm());
    setSaveStatus("idle");
    setShowForm(true);
  }

  function openEditLoan(loan: StoreLoan) {
    if (!canWrite) {
      toast.error(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    setEditingId(loan.id);
    setForm(loanToForm(loan));
    setSaveStatus("idle");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyLoanForm());
    setSaveStatus("idle");
  }

  async function handleSave() {
    if (!canWrite) {
      toast.error(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    if (!selectedStore || !userId || saving || saveStatus === "success") return;

    if (!form.lender_name.trim()) {
      toast.error("Enter a lender name before saving.");
      return;
    }
    if (parseNum(form.current_balance) == null && parseNum(form.monthly_payment) == null) {
      toast.error("Enter a current balance or monthly payment.");
      return;
    }

    setSaving(true);
    setSaveStatus("idle");

    try {
      const payload = {
        user_id: userId,
        store_id: selectedStore.id,
        is_active: true,
        lender_name: form.lender_name || null,
        loan_type: form.loan_type || null,
        original_balance: parseNum(form.original_balance),
        current_balance: parseNum(form.current_balance),
        interest_rate: parseNum(form.interest_rate),
        monthly_payment: parseNum(form.monthly_payment),
        loan_start_date: form.loan_start_date || null,
        loan_end_date: form.loan_end_date || null,
        amortization_term_months: parseNum(form.amortization_term_months),
        balloon_payment: form.balloon_payment,
        balloon_date: form.balloon_payment ? form.balloon_date || null : null,
        balloon_amount: form.balloon_payment ? parseNum(form.balloon_amount) : null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from("store_loans")
          .update(payload)
          .eq("id", editingId);
        if (updateError) {
          console.error("Loan save error:", updateError);
          setSaveStatus("error");
          toast.error("Failed to save — please try again");
          setSaving(false);
          return;
        }
      } else {
        const { error: insertError } = await supabase.from("store_loans").insert(payload);
        if (insertError) {
          console.error("Loan save error:", insertError);
          setSaveStatus("error");
          toast.error("Failed to save — please try again");
          setSaving(false);
          return;
        }
      }

      setSaveStatus("success");
      toast.success(editingId ? "Loan updated" : "Loan added");
      closeForm();
      setSaving(false);
      await loadData();
      if (selectedStore?.id) {
        void evaluateAlerts({ storeIds: [selectedStore.id] });
      }
    } catch (err) {
      console.error("Unexpected loan save error:", err);
      setSaveStatus("error");
      toast.error("Failed to save — please try again");
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!canWrite) {
      toast.error(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    if (deletingId) return;
    setDeletingId(id);

    const { error } = await supabase
      .from("store_loans")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      toast.error("Failed to save — please try again");
    } else {
      toast.success("Loan deleted");
      await loadData();
      if (selectedStore?.id) {
        void evaluateAlerts({ storeIds: [selectedStore.id] });
      }
    }
    setDeletingId(null);
  }

  function updateForm<K extends keyof LoanForm>(key: K, value: LoanForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
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
        description="Add your first store to manage debt and track loans."
        ctaLabel="Add Your First Store"
        ctaHref="/portfolio"
      />
    );
  }

  if (isAllStores || !selectedStore) {
    return (
      <div className="card text-center py-10">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Select a store from the dropdown above to manage debt.
        </p>
      </div>
    );
  }

  if (loans.length === 0 && !showForm) {
    const isOwnerOccupied = valuation?.store?.occupancy_type === "owner_occupied";
    const hasFinancialData = ttm.monthsUsed > 0;
    const calculatorProps = {
      annualEbitda: ttm.ttmEbitda,
      businessValue: valuation?.businessValue ?? 0,
      realEstateValue: valuation?.realEstateValue ?? 0,
      isOwnerOccupied,
      existingAnnualDebtService: 0,
      hasFinancialData,
    };

    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Debt Management
            </h1>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Track loans, monitor payoff progress, and calculate store equity
            </p>
          </div>
          <ReadOnlyGuard>
            <button type="button" onClick={openAddLoan} className="btn-primary text-[13px]">
              + Add Loan
            </button>
          </ReadOnlyGuard>
        </div>

        <LoanCalculatorMobileShell {...calculatorProps} />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 xl:gap-6 items-start">
          <EmptyState
            icon="Landmark"
            title="No loans added yet"
            description="Add your loans to track debt service and DSCR"
            ctaLabel="Add Loan"
            ctaHref="/debt"
          />
          <LoanCalculatorPanel {...calculatorProps} />
        </div>
      </div>
    );
  }

  const calculatorProps = {
    annualEbitda: ttm.ttmEbitda,
    businessValue: valuation?.businessValue ?? 0,
    realEstateValue: valuation?.realEstateValue ?? 0,
    isOwnerOccupied: valuation?.store?.occupancy_type === "owner_occupied",
    existingAnnualDebtService: debtServiceAnalysis.scheduledAnnual,
    hasFinancialData: debtServiceAnalysis.hasActualData,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Debt Management
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          Track loans, monitor payoff progress, and calculate store equity
        </p>
      </div>

      <LoanCalculatorMobileShell {...calculatorProps} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 xl:gap-6 items-start">
        <div className="space-y-5 min-w-0">
      {/* Section 1 — Hero */}
      <div className="hero-value-card" style={{ padding: "28px 32px" }}>
        <div
          style={{
            fontSize: "12px",
            color: "#93c5fd",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "8px",
          }}
        >
          Store Equity
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
          <AnimatedNumber
            value={totals.storeEquity}
            prefix="$"
            className="hero-value-text"
            style={{ fontSize: "36px" }}
            duration={1200}
          />
        </div>
        <div
          className="text-[13px] mt-2"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Store Value {fmtDollar(totals.storeValue)} − Total Debt {fmtDollar(totals.totalDebt)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px" }}>
          <span
            style={{
              background: "rgba(239,68,68,0.15)",
              color: "#f87171",
              padding: "4px 12px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Total Debt {fmtDollar(totals.totalDebt)}
          </span>
          <span
            style={{
              background: "rgba(59,130,246,0.15)",
              color: "#93c5fd",
              padding: "4px 12px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Total Monthly Payment {fmtDollar(totals.totalMonthlyPayment)}
          </span>
          <span
            style={{
              background: "rgba(245,158,11,0.15)",
              color: "#fbbf24",
              padding: "4px 12px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Annual Debt Service {fmtDollar(totals.totalAnnualDebtService)}
          </span>
        </div>
      </div>

      {/* Section 2 — KPI cards */}
      <div className="metric-grid">
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0s" }}
          label="Total Debt"
          value={<AnimatedNumber value={totals.totalDebt} prefix="$" duration={1000} />}
          sub={`across ${enrichedLoans.length} loan${enrichedLoans.length !== 1 ? "s" : ""}`}
        />
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.05s" }}
          label="Total Monthly Payment"
          value={<AnimatedNumber value={totals.totalMonthlyPayment} prefix="$" duration={1000} />}
        />
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.1s" }}
          label="Weighted Avg Interest Rate"
          value={
            enrichedLoans.length > 0 ? (
              <AnimatedNumber value={totals.weightedAvgRate} decimals={2} suffix="%" duration={1000} />
            ) : (
              "—"
            )
          }
        />
        <KpiCard
          className="kpi-fade-in kpi-glow-card"
          style={{ animationDelay: "0.15s" }}
          label="Earliest Payoff Date"
          value={totals.earliestPayoff?.payoffDate ?? "—"}
          sub={
            totals.earliestPayoff
              ? `${totals.earliestPayoff.lender_name ?? "Loan"} · ${totals.earliestPayoff.remainingMonths} mo`
              : undefined
          }
        />
      </div>

      {/* Section 3 — Loans list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title mb-0">Active Loans</h2>
          <ReadOnlyGuard>
            <button type="button" onClick={openAddLoan} className="btn-primary text-[12px] px-3 py-1.5">
              + Add Loan
            </button>
          </ReadOnlyGuard>
        </div>

        {enrichedLoans.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[14px] mb-4" style={{ color: "var(--text-muted)" }}>
              No loans added yet
            </p>
            <ReadOnlyGuard align="stretch">
              <button type="button" onClick={openAddLoan} className="btn-primary text-[13px]">
                + Add Loan
              </button>
            </ReadOnlyGuard>
          </div>
        ) : (
          <div className="space-y-4">
            {enrichedLoans.map((loan) => (
              <div key={loan.id} className="card">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
                        {loan.lender_name ?? "Unnamed Lender"}
                      </span>
                      {loan.loan_type && (
                        <span className={clsx("badge text-[10px]", LOAN_TYPE_BADGE[loan.loan_type] ?? "badge-blue")}>
                          {loan.loan_type}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <ReadOnlyGuard>
                      <button
                        type="button"
                        onClick={() => openEditLoan(loan)}
                        className="btn-outline text-[11px] px-2.5 py-1"
                      >
                        Edit
                      </button>
                    </ReadOnlyGuard>
                    <ReadOnlyGuard>
                      <button
                        type="button"
                        onClick={() => handleDelete(loan.id)}
                        disabled={deletingId === loan.id}
                        className="btn-outline text-[11px] px-2.5 py-1 text-red-400 border-red-500/20 disabled:opacity-40"
                      >
                        {deletingId === loan.id ? "Deleting..." : "Delete"}
                      </button>
                    </ReadOnlyGuard>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-[24px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {fmtDollar(loan.estimatedCurrentBalance)}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Originally {fmtDollar(loan.original_balance ?? 0)}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-[12px] mb-1.5">
                    <span style={{ color: "var(--text-secondary)" }}>
                      {loan.pctPaidOff.toFixed(0)}% Paid Off
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--bg-card2)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${loan.pctPaidOff}%`,
                        background: "linear-gradient(90deg, #22c55e 0%, #4ade80 100%)",
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  {[
                    { label: "Interest Rate", value: `${(loan.interest_rate ?? 0).toFixed(2)}%` },
                    { label: "Monthly Payment", value: fmtDollar(loan.monthly_payment ?? 0) },
                    { label: "Remaining Term", value: `${loan.remainingMonths} mo` },
                    { label: "Est. Payoff Date", value: loan.payoffDate },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div className="metric-label mb-1">{stat.label}</div>
                      <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>

                {loan.balloon_payment && (
                  <div
                    className="mt-4 px-3 py-2 rounded-lg text-[12px]"
                    style={{
                      background: "rgba(245,158,11,0.1)",
                      border: "1px solid rgba(245,158,11,0.25)",
                      color: "#fbbf24",
                    }}
                  >
                    Balloon payment of {fmtDollar(loan.balloon_amount ?? 0)} due{" "}
                    {loan.balloon_date ? formatDate(loan.balloon_date) : "—"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 4 — Debt Service Analysis */}
      <div className="card">
        <div className="section-title mb-4">Debt Service Analysis</div>
        <div className="table-scroll">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["", "Scheduled", "Actual (TTM)", "Variance"].map((col) => (
                  <th
                    key={col}
                    className={clsx(
                      "py-2.5 pr-4 font-medium text-[var(--text-secondary)]",
                      col === "" ? "text-left" : "text-right"
                    )}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-3 pr-4 font-medium text-[var(--text-secondary)]">
                  Monthly Debt Service
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-[var(--text-primary)]">
                  {fmtDollar(debtServiceAnalysis.scheduledMonthly)}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-[var(--text-primary)]">
                  {debtServiceAnalysis.hasActualData
                    ? fmtDollar(debtServiceAnalysis.actualMonthlyAvg ?? 0)
                    : "N/A"}
                </td>
                <td
                  className={clsx(
                    "py-3 pr-4 text-right tabular-nums font-semibold",
                    debtServiceAnalysis.monthlyVariance != null
                      ? varianceColorClass(
                          debtServiceAnalysis.monthlyVariance,
                          debtServiceAnalysis.scheduledMonthly
                        )
                      : "text-[var(--text-primary)]"
                  )}
                >
                  {debtServiceAnalysis.monthlyVariance != null
                    ? fmtVariance(debtServiceAnalysis.monthlyVariance)
                    : "N/A"}
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-[var(--text-secondary)]">
                  Annual Debt Service
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-[var(--text-primary)]">
                  {fmtDollar(debtServiceAnalysis.scheduledAnnual)}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-[var(--text-primary)]">
                  {debtServiceAnalysis.hasActualData
                    ? fmtDollar(debtServiceAnalysis.actualAnnualTotal ?? 0)
                    : "N/A"}
                </td>
                <td
                  className={clsx(
                    "py-3 pr-4 text-right tabular-nums font-semibold",
                    debtServiceAnalysis.annualVariance != null
                      ? varianceColorClass(
                          debtServiceAnalysis.annualVariance,
                          debtServiceAnalysis.scheduledAnnual
                        )
                      : "text-[var(--text-primary)]"
                  )}
                >
                  {debtServiceAnalysis.annualVariance != null
                    ? fmtVariance(debtServiceAnalysis.annualVariance)
                    : "N/A"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {debtServiceAnalysis.monthlyVariancePct != null &&
          debtServiceAnalysis.monthlyVariancePct > 5 && (
            <div
              className="mt-4 px-3 py-2.5 rounded-lg text-[12px]"
              style={{
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.25)",
                color: "#fbbf24",
              }}
            >
              Actual debt service differs from scheduled by{" "}
              {debtServiceAnalysis.monthlyVariancePct.toFixed(1)}% — review loan statements
            </div>
          )}
      </div>

      {/* Section 5 — DSCR */}
      <div>
        <div className="section-title mb-4">DSCR</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card">
            <div className="metric-label">
              <DisclaimerLabel>DSCR (Scheduled)</DisclaimerLabel>
            </div>
            <div
              className={clsx(
                "text-[28px] font-bold tabular-nums mt-1",
                debtServiceAnalysis.scheduledDscr != null
                  ? dscrColorClass(debtServiceAnalysis.scheduledDscr)
                  : "text-green-400"
              )}
            >
              {debtServiceAnalysis.scheduledDscr != null
                ? fmtMultiple(debtServiceAnalysis.scheduledDscr)
                : DSCR_NO_DEBT_LABEL}
            </div>
            <div className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>
              TTM EBITDA {fmtDollar(ttm.ttmEbitda)} ÷ scheduled annual debt service
            </div>
          </div>
          <div className="card">
            <div className="metric-label">
              <DisclaimerLabel>DSCR (Actual)</DisclaimerLabel>
            </div>
            <div
              className={clsx(
                "text-[28px] font-bold tabular-nums mt-1",
                debtServiceAnalysis.actualDscr != null
                  ? dscrColorClass(debtServiceAnalysis.actualDscr)
                  : "text-[var(--text-secondary)]"
              )}
            >
              {debtServiceAnalysis.actualDscr != null
                ? fmtMultiple(debtServiceAnalysis.actualDscr)
                : "N/A"}
            </div>
            <div className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>
              TTM EBITDA {fmtDollar(ttm.ttmEbitda)} ÷ actual TTM debt service
            </div>
          </div>
        </div>
        <p className="text-[12px] mt-3" style={{ color: "var(--text-muted)" }}>
          Lenders typically use scheduled debt service for underwriting
        </p>
      </div>

      {/* Section 6 — Loan Summary Footer */}
      <div className="card">
        <div className="section-title mb-4">Loan Summary</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="metric-label mb-1">Total Outstanding Balance</div>
            <div className="text-[18px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {enrichedLoans.length > 0 ? fmtDollar(totals.totalDebt) : "—"}
            </div>
          </div>
          <div>
            <div className="metric-label mb-1">Weighted Avg Interest Rate</div>
            <div className="text-[18px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {enrichedLoans.length > 0 ? `${totals.weightedAvgRate.toFixed(2)}%` : "—"}
            </div>
          </div>
          <div>
            <div className="metric-label mb-1">Earliest Loan End Date</div>
            <div className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>
              {enrichedLoans.length > 0 ? earliestLoanEndDate(enrichedLoans) : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Section 7 — Add/Edit form */}
      {showForm && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title mb-0">{editingId ? "Edit Loan" : "Add Loan"}</h3>
            <button type="button" onClick={closeForm} className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Lender Name">
              <input
                type="text"
                value={form.lender_name}
                onChange={(e) => updateForm("lender_name", e.target.value)}
                onKeyDown={preventEnterSubmit}
                className={INPUT_CLASS}
                placeholder="First National Bank"
              />
            </FormField>
            <FormField label="Loan Type">
              <select
                value={form.loan_type}
                onChange={(e) => updateForm("loan_type", e.target.value)}
                className={INPUT_CLASS}
              >
                {LOAN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Original Balance">
              <input
                type="text"
                inputMode="decimal"
                value={form.original_balance}
                onChange={(e) => updateForm("original_balance", e.target.value)}
                onKeyDown={preventEnterSubmit}
                className={INPUT_CLASS}
                placeholder="500000"
              />
            </FormField>
            <FormField label="Current Balance">
              <input
                type="text"
                inputMode="decimal"
                value={form.current_balance}
                onChange={(e) => updateForm("current_balance", e.target.value)}
                onKeyDown={preventEnterSubmit}
                className={INPUT_CLASS}
                placeholder="425000"
              />
            </FormField>
            <FormField label="Interest Rate (%)">
              <input
                type="text"
                inputMode="decimal"
                value={form.interest_rate}
                onChange={(e) => updateForm("interest_rate", e.target.value)}
                onKeyDown={preventEnterSubmit}
                className={INPUT_CLASS}
                placeholder="7.5"
              />
            </FormField>
            <FormField label="Monthly Payment">
              <input
                type="text"
                inputMode="decimal"
                value={form.monthly_payment}
                onChange={(e) => updateForm("monthly_payment", e.target.value)}
                onKeyDown={preventEnterSubmit}
                className={INPUT_CLASS}
                placeholder="4500"
              />
            </FormField>
            <FormField label="Loan Start Date">
              <input
                type="date"
                value={form.loan_start_date}
                onChange={(e) => updateForm("loan_start_date", e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Loan End Date">
              <input
                type="date"
                value={form.loan_end_date}
                onChange={(e) => updateForm("loan_end_date", e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Amortization Term (months)">
              <input
                type="text"
                inputMode="numeric"
                value={form.amortization_term_months}
                onChange={(e) => updateForm("amortization_term_months", e.target.value)}
                onKeyDown={preventEnterSubmit}
                className={INPUT_CLASS}
                placeholder="120"
              />
            </FormField>
          </div>

          <div className="mt-4 space-y-2">
            <ToggleField
              label="Balloon Payment"
              value={form.balloon_payment}
              onChange={(v) => updateForm("balloon_payment", v)}
            />
            {form.balloon_payment && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Balloon Date">
                  <input
                    type="date"
                    value={form.balloon_date}
                    onChange={(e) => updateForm("balloon_date", e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Balloon Amount">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.balloon_amount}
                    onChange={(e) => updateForm("balloon_amount", e.target.value)}
                    onKeyDown={preventEnterSubmit}
                    className={INPUT_CLASS}
                    placeholder="100000"
                  />
                </FormField>
              </div>
            )}
          </div>

          <FormField label="Notes" className="mt-4">
            <textarea
              value={form.notes}
              onChange={(e) => updateForm("notes", e.target.value)}
              rows={3}
              className={clsx(INPUT_CLASS, "resize-y")}
              placeholder="Optional notes about this loan..."
            />
          </FormField>

          <div className="flex gap-3 mt-6">
            <ReadOnlyGuard>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || saveStatus === "success"}
                className="btn-primary disabled:opacity-40"
              >
                {saving ? "Saving..." : saveStatus === "success" ? "Saved!" : "Save Loan"}
              </button>
            </ReadOnlyGuard>
            <button type="button" onClick={closeForm} className="btn-outline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Section 8 — Payoff Projection chart */}
      {largestLoan && payoffSchedule.length > 0 && (
        <div className="card">
          <div className="section-title mb-1">Debt Payoff Projection (24 Months)</div>
          <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
            Based on {largestLoan.lender_name ?? "largest loan"} — {fmtDollar(largestLoan.estimatedCurrentBalance)} balance
          </p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={payoffSchedule}>
                <defs>
                  <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatAxisValue}
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="balance"
                  name="Balance"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#debtGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Section 9 — Loan breakdown table */}
      {enrichedLoans.length > 1 && (
        <div className="card table-scroll">
          <div className="section-title mb-4">Loan Breakdown</div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Lender", "Type", "Balance", "Rate", "Payment", "% Paid Off"].map((col) => (
                  <th
                    key={col}
                    className="text-left py-2.5 pr-4 font-medium text-[var(--text-secondary)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enrichedLoans.map((loan) => (
                <tr key={loan.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 pr-4 font-medium text-[var(--text-primary)]">
                    {loan.lender_name ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                    {loan.loan_type ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-[var(--text-primary)]">
                    {fmtDollar(loan.estimatedCurrentBalance)}
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-[var(--text-primary)]">
                    {(loan.interest_rate ?? 0).toFixed(2)}%
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-[var(--text-primary)]">
                    {fmtDollar(loan.monthly_payment ?? 0)}
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-[var(--text-success)]">
                    {loan.pctPaidOff.toFixed(0)}%
                  </td>
                </tr>
              ))}
              <tr className="font-semibold border-t-2" style={{ borderColor: "var(--border)" }}>
                <td className="py-3 pr-4 text-[var(--text-primary)]">
                  Totals
                </td>
                <td className="py-3 pr-4" />
                <td className="py-3 pr-4 tabular-nums text-[var(--text-primary)]">
                  {fmtDollar(totals.totalDebt)}
                </td>
                <td className="py-3 pr-4 tabular-nums text-[var(--text-primary)]">
                  {totals.weightedAvgRate.toFixed(2)}%
                </td>
                <td className="py-3 pr-4 tabular-nums text-[var(--text-primary)]">
                  {fmtDollar(totals.totalMonthlyPayment)}
                </td>
                <td className="py-3 pr-4" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
        </div>

        <LoanCalculatorPanel {...calculatorProps} />
      </div>
    </div>
  );
}
