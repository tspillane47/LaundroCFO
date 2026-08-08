"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { fmtDollar } from "@/lib/calculations";
import { toNullableNum, findNegativeFieldError } from "@/lib/formHelpers";
import { FormBanner } from "@/components/ui/FormBanner";
import { Logo } from "@/components/ui/Logo";
import { NavIcon } from "@/components/ui/NavIcons";
import { INPUT_CLASS, preventEnterSubmit } from "@/components/occupancy/shared";
import {
  categorizeWithRules,
  parseBankCsv,
  type TransactionType,
} from "@/lib/financials";
import { getStoreValuation, invalidateValuationCache } from "@/lib/getStoreValuation";
import { canAddStore, storeLimitUpgradeMessage } from "@/lib/access";
import { useAccessStatus, invalidateAccessStatusCache } from "@/lib/useAccessStatus";
import {
  completeOnboarding,
  isOnboardingComplete,
  JOIN_STORE_SETTINGS_HINT,
} from "@/lib/onboarding";
import { CopyableEmail } from "@/components/onboarding/CopyableEmail";

const TOTAL_STEPS = 4;

const STEP_LABELS = ["Welcome", "Your Store", "Occupancy", "Financials"];

type OnboardingPhase = "choice" | "wizard" | "join";

const STORE_TYPES = [
  { label: "Coin Laundry", value: "Coin" },
  { label: "Card Laundry", value: "Card" },
  { label: "Hybrid", value: "Hybrid" },
  { label: "WDF Only", value: "WDF Only" },
];

const FEATURES = [
  { icon: "valuation", label: "Store Valuation" },
  { icon: "benchmarking", label: "Industry Benchmarks" },
  { icon: "dashboard", label: "Financial Dashboard" },
];

type OccupancyChoice = "lease" | "own" | null;
type FinancialMode = "csv" | "manual" | null;
type SlideDirection = "left" | "right";

type OnboardingForm = {
  storeName: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  squareFootage: string;
  storeType: string;
  yearOpened: string;
  occupancy: OccupancyChoice;
  monthlyRent: string;
  leaseEndDate: string;
  annualEscalation: string;
  monthlyMortgage: string;
  buildingValue: string;
  financialMode: FinancialMode;
  monthlyRevenue: string;
  monthlyExpenses: string;
};

const DEFAULT_FORM: OnboardingForm = {
  storeName: "",
  streetAddress: "",
  city: "",
  state: "",
  zip: "",
  squareFootage: "",
  storeType: "Hybrid",
  yearOpened: "",
  occupancy: null,
  monthlyRent: "",
  leaseEndDate: "",
  annualEscalation: "",
  monthlyMortgage: "",
  buildingValue: "",
  financialMode: null,
  monthlyRevenue: "",
  monthlyExpenses: "",
};

function buildAddress(form: OnboardingForm): string {
  return [form.streetAddress, form.city, form.state, form.zip]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function Field({
  label,
  children,
  className,
  error,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  error?: string;
}) {
  return (
    <div className={className}>
      <div className="metric-label mb-1.5">{label}</div>
      {children}
      {error && <p className="text-[12px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: `${(i * 17) % 100}%`,
        delay: `${(i % 10) * 0.15}s`,
        duration: `${2.2 + (i % 5) * 0.4}s`,
        color: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"][i % 6],
        size: 6 + (i % 4),
      })),
    []
  );

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden>
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="onboarding-confetti-piece absolute rounded-full opacity-90"
          style={{
            left: piece.left,
            top: "-12px",
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
          }}
        />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
          <div className="text-[13px] text-[var(--text-muted)]">Loading...</div>
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAddingStore = searchParams.get("add") === "true";
  const supabase = createClient();
  const {
    plan: accessPlan,
    maxStores,
    storeCount,
    loading: accessLoading,
  } = useAccessStatus();
  const accessStatus = {
    plan: accessPlan,
    isReadOnly: false,
    reason: "active" as const,
    trialEndsAt: null,
    currentPeriodEnd: null,
    maxStores,
  };

  const [phase, setPhase] = useState<OnboardingPhase>(isAddingStore ? "wizard" : "choice");
  const [step, setStep] = useState(isAddingStore ? 2 : 1);
  const [showCompletion, setShowCompletion] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [slideDirection, setSlideDirection] = useState<SlideDirection>("left");
  const [slideKey, setSlideKey] = useState(0);
  const [form, setForm] = useState<OnboardingForm>(DEFAULT_FORM);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeNameError, setStoreNameError] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRowCount, setCsvRowCount] = useState(0);
  const [csvRows, setCsvRows] = useState<
    Array<{
      transaction_date: string;
      description: string | null;
      amount: number;
      type: TransactionType;
      category: string;
    }>
  >([]);
  const [hasValuationEstimate, setHasValuationEstimate] = useState(false);
  const [estimatedValue, setEstimatedValue] = useState(0);
  const [ready, setReady] = useState(false);
  const [completing, setCompleting] = useState(false);

  const setField = useCallback(<K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const goToStep = useCallback((nextStep: number, direction: SlideDirection) => {
    setSlideDirection(direction);
    setSlideKey((k) => k + 1);
    setStep(nextStep);
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserEmail(user.email ?? "");

      const completed = await isOnboardingComplete(supabase, user.id);

      if (cancelled) return;

      if (completed && !isAddingStore) {
        router.replace("/portfolio");
        return;
      }

      if (accessLoading) {
        return;
      }

      if (!canAddStore(accessStatus, storeCount)) {
        setErrorMessage(storeLimitUpgradeMessage(accessPlan));
        setReady(true);
        return;
      }

      setReady(true);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [router, supabase, isAddingStore, accessLoading, accessPlan, maxStores, storeCount]);

  async function createStore(): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return null;
    }

    if (!canAddStore(accessStatus, storeCount)) {
      setErrorMessage(storeLimitUpgradeMessage(accessStatus.plan));
      return null;
    }

    const name = form.storeName.trim();
    const address = buildAddress(form);

    const { data: existingStores } = await supabase
      .from("stores")
      .select("id, created_at")
      .eq("user_id", user.id)
      .eq("name", name)
      .eq("address", address);

    if (existingStores?.length) {
      const recent = existingStores.find((s) => Date.now() - new Date(s.created_at).getTime() < 60000);
      if (recent) return recent.id;
    }

    const response = await fetch("/api/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        address,
        square_footage: toNullableNum(form.squareFootage),
        store_type: form.storeType,
        year_opened: toNullableNum(form.yearOpened),
      }),
    });

    const payload = await response.json().catch(() => null);

    if (response.status === 403 && payload?.error === "store_limit_reached") {
      setErrorMessage(payload.message ?? storeLimitUpgradeMessage(accessStatus.plan));
      return null;
    }

    if (!response.ok || !payload?.id) {
      console.error("Store creation error:", payload);
      setErrorMessage(
        typeof payload?.error === "string"
          ? payload.error
          : "We couldn't create your store. Please try again."
      );
      return null;
    }

    invalidateAccessStatusCache();
    return payload.id as string;
  }

  async function saveOccupancy(id: string): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    if (form.occupancy === "lease") {
      const negativeFieldError = findNegativeFieldError([
        { value: toNullableNum(form.monthlyRent) ?? 0, label: "Monthly rent" },
        { value: toNullableNum(form.annualEscalation) ?? 0, label: "Annual escalation" },
      ]);
      if (negativeFieldError) {
        setErrorMessage(negativeFieldError);
        return false;
      }

      await supabase.from("stores").update({ occupancy_type: "leased" }).eq("id", id);

      const { error } = await supabase.from("leases").upsert(
        {
          store_id: id,
          user_id: user.id,
          monthly_rent: toNullableNum(form.monthlyRent) ?? 0,
          lease_end_date: form.leaseEndDate || null,
          annual_escalation_pct: toNullableNum(form.annualEscalation) ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "store_id" }
      );

      if (error) {
        console.error("Lease save error:", error);
        setErrorMessage("We couldn't save occupancy details. Please try again.");
        return false;
      }
    } else if (form.occupancy === "own") {
      const negativeFieldError = findNegativeFieldError([
        { value: toNullableNum(form.monthlyMortgage) ?? 0, label: "Monthly mortgage" },
        { value: toNullableNum(form.buildingValue) ?? 0, label: "Building value" },
      ]);
      if (negativeFieldError) {
        setErrorMessage(negativeFieldError);
        return false;
      }

      await supabase.from("stores").update({ occupancy_type: "owner_occupied" }).eq("id", id);

      const { error } = await supabase.from("real_estate").upsert(
        {
          store_id: id,
          user_id: user.id,
          monthly_mortgage_payment: toNullableNum(form.monthlyMortgage),
          estimated_value: toNullableNum(form.buildingValue),
        },
        { onConflict: "store_id" }
      );

      if (error) {
        console.error("Real estate save error:", error);
        setErrorMessage("We couldn't save occupancy details. Please try again.");
        return false;
      }
    }

    invalidateValuationCache(id);
    return true;
  }

  async function saveFinancials(id: string): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    if (form.financialMode === "csv" && csvRows.length > 0) {
      const rows = csvRows.map((row) => ({
        store_id: id,
        user_id: user.id,
        transaction_date: row.transaction_date,
        description: row.description,
        amount: row.amount,
        category: row.category,
        transaction_type: row.type,
        original_category: row.category,
        status: "needs_review",
        is_reviewed: false,
        excluded: false,
      }));

      const { error } = await supabase.from("bank_transactions").insert(rows);
      if (error) {
        console.error("CSV import error:", error);
        setErrorMessage("We couldn't import your CSV. Please try again.");
        return false;
      }
    } else if (form.financialMode === "manual") {
      const revenue = toNullableNum(form.monthlyRevenue);
      const expenses = toNullableNum(form.monthlyExpenses);
      const negativeFieldError = findNegativeFieldError([
        ...(revenue != null ? [{ value: revenue, label: "Monthly revenue" }] : []),
        ...(expenses != null ? [{ value: expenses, label: "Monthly expenses" }] : []),
      ]);
      if (negativeFieldError) {
        setErrorMessage(negativeFieldError);
        return false;
      }

      if (revenue == null && expenses == null) {
        invalidateValuationCache(id);
        return true;
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      await supabase
        .from("stores")
        .update({
          monthly_revenue: revenue,
          monthly_expenses: expenses,
        })
        .eq("id", id);

      const { error } = await supabase.from("monthly_financials").insert({
        store_id: id,
        user_id: user.id,
        year,
        month,
        revenue: revenue ?? 0,
        other_expenses: expenses ?? 0,
        utilities: 0,
        rent: 0,
        payroll: 0,
        repairs_maintenance: 0,
        insurance_expense: 0,
        supplies: 0,
        marketing: 0,
        professional_fees: 0,
        debt_service: 0,
      });

      if (error) {
        console.error("Monthly financials save error:", error);
        setErrorMessage("We couldn't save your financials. Please try again.");
        return false;
      }
    }

    invalidateValuationCache(id);
    return true;
  }

  function handleCsvUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseBankCsv(text);
      if (parsed.length === 0) {
        setErrorMessage("Could not parse CSV. Include Date and Amount columns.");
        return;
      }

      const staged = parsed.map((row) => {
        const { category } = categorizeWithRules(row.description, row.type, row.amount, []);
        return {
          transaction_date: row.date,
          description: row.description,
          amount: row.amount,
          type: row.type,
          category,
        };
      });

      setCsvRows(staged);
      setCsvFileName(file.name);
      setCsvRowCount(staged.length);
      setErrorMessage("");
    };
    reader.readAsText(file);
  }

  async function handleStep2Next() {
    if (!form.storeName.trim()) {
      setStoreNameError("Store name is required.");
      return;
    }
    setStoreNameError("");
    setBusy(true);
    setErrorMessage("");

    const id = storeId ?? (await createStore());
    setBusy(false);

    if (!id) return;
    setStoreId(id);
    goToStep(3, "left");
  }

  async function handleStep3Next(skip = false) {
    if (!storeId) return;
    setBusy(true);
    setErrorMessage("");

    if (!skip && form.occupancy) {
      const ok = await saveOccupancy(storeId);
      setBusy(false);
      if (!ok) return;
    } else {
      setBusy(false);
    }

    goToStep(4, "left");
  }

  async function handleStep4Next(skip = false) {
    if (!storeId) return;
    setBusy(true);
    setErrorMessage("");

    let nextHasEstimate = hasValuationEstimate;
    let nextEstimate = estimatedValue;

    if (!skip && form.financialMode) {
      const ok = await saveFinancials(storeId);
      if (!ok) {
        setBusy(false);
        return;
      }

      if (form.financialMode === "manual") {
        const revenue = toNullableNum(form.monthlyRevenue) ?? 0;
        if (revenue > 0) {
          const valuation = await getStoreValuation(storeId);
          if (valuation.businessValue > 0) {
            nextEstimate = valuation.businessValue;
            nextHasEstimate = true;
          }
        }
      }
    }

    setBusy(false);
    setEstimatedValue(nextEstimate);
    setHasValuationEstimate(nextHasEstimate);
    setSlideDirection("left");
    setSlideKey((k) => k + 1);
    setShowCompletion(true);
  }

  async function handleGoToDashboard() {
    if (completing) return;
    setCompleting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    if (!isAddingStore) {
      await completeOnboarding(supabase, user.id, "own");
    }

    router.push(isAddingStore ? "/portfolio" : "/getting-started");
  }

  async function handleJoinGoToPortfolio() {
    if (completing) return;
    setCompleting(true);
    setErrorMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    try {
      await completeOnboarding(supabase, user.id, "join");
      router.push("/portfolio");
    } catch (error) {
      console.error("Failed to complete joining onboarding:", error);
      setErrorMessage("We couldn't save your choice. Please try again.");
      setCompleting(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
        <div className="text-[13px] text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  const progressPct = showCompletion ? 100 : (step / TOTAL_STEPS) * 100;
  const slideClass =
    slideDirection === "left" ? "onboarding-slide-in-left" : "onboarding-slide-in-right";
  const showWizardProgress = phase === "wizard" && !showCompletion;

  return (
    <>
      <style>{`
        @keyframes onboarding-slide-in-left {
          from { opacity: 0; transform: translateX(28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes onboarding-slide-in-right {
          from { opacity: 0; transform: translateX(-28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes onboarding-confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.2; }
        }
        .onboarding-slide-in-left { animation: onboarding-slide-in-left 0.35s ease-out; }
        .onboarding-slide-in-right { animation: onboarding-slide-in-right 0.35s ease-out; }
        .onboarding-confetti-piece { animation-name: onboarding-confetti-fall; animation-timing-function: linear; animation-iteration-count: infinite; }
      `}</style>

      <div className="min-h-screen bg-[var(--bg-page)] flex flex-col">
        <header className="sticky top-0 z-30 bg-[var(--bg-page)]/95 backdrop-blur border-b border-[var(--border)]">
          <div className="max-w-3xl mx-auto px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <Logo variant="sidebar" />
              {showWizardProgress && (
                <span className="text-[12px] text-[var(--text-muted)]">
                  Step {step} of {TOTAL_STEPS}
                </span>
              )}
            </div>

            {showWizardProgress && (
              <>
                <div className="h-1.5 rounded-full bg-[var(--border)]  overflow-hidden mb-2">
                  <div
                    className="h-full bg-blue-500 transition-all duration-500 ease-out"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="hidden sm:flex justify-between gap-1">
                  {STEP_LABELS.map((label, index) => (
                    <span
                      key={label}
                      className={clsx(
                        "text-[10px] uppercase tracking-wide truncate",
                        index + 1 === step
                          ? "text-blue-500 font-semibold"
                          : index + 1 < step
                            ? "text-[var(--text-secondary)]"
                            : "text-[var(--text-muted)]"
                      )}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-2xl relative">
            {showCompletion && <Confetti />}

            <FormBanner message={errorMessage ? { type: "error", text: errorMessage } : null} />
            {errorMessage && !canAddStore(accessStatus, storeCount) && (
              <p className="text-center text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
                <Link href="/pricing" className="font-semibold underline underline-offset-2">
                  View plans
                </Link>
              </p>
            )}

            <div
              key={
                phase === "choice"
                  ? "choice"
                  : phase === "join"
                    ? "join"
                    : showCompletion
                      ? "complete"
                      : `${step}-${slideKey}`
              }
              className={clsx(
                "card bg-[var(--bg-card)] border border-[var(--border)] shadow-sm relative z-10",
                phase === "wizard" && !showCompletion && slideClass
              )}
            >
              {phase === "choice" ? (
                <div className="text-center">
                  <h1 className="text-[28px] sm:text-[32px] font-bold text-[var(--text-primary)] mb-3">
                    How are you getting started?
                  </h1>
                  <p className="text-[15px] text-[var(--text-secondary)] mb-8 max-w-lg mx-auto leading-relaxed">
                    Are you setting up your own store, or joining a store someone else owns?
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setPhase("wizard");
                        setStep(1);
                        setErrorMessage("");
                      }}
                      className="rounded-xl border-2 px-4 py-6 text-left transition-colors min-h-[120px] border-[var(--border)] hover:border-blue-400/50"
                    >
                      <div className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">
                        Setting up my own store
                      </div>
                      <div className="text-[13px] text-[var(--text-muted)] leading-relaxed">
                        Create your first store and walk through setup.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhase("join");
                        setErrorMessage("");
                      }}
                      className="rounded-xl border-2 px-4 py-6 text-left transition-colors min-h-[120px] border-[var(--border)] hover:border-blue-400/50"
                    >
                      <div className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">
                        Joining a store someone else owns
                      </div>
                      <div className="text-[13px] text-[var(--text-muted)] leading-relaxed">
                        Skip store setup — get access when the owner adds you.
                      </div>
                    </button>
                  </div>
                </div>
              ) : phase === "join" ? (
                <div className="text-center py-2">
                  <h1 className="text-[28px] sm:text-[32px] font-bold text-[var(--text-primary)] mb-3">
                    You&apos;re all set!
                  </h1>
                  <p className="text-[15px] text-[var(--text-secondary)] mb-6 max-w-md mx-auto leading-relaxed">
                    {JOIN_STORE_SETTINGS_HINT}
                  </p>
                  {userEmail ? (
                    <div className="mb-8 max-w-md mx-auto">
                      <CopyableEmail email={userEmail} />
                    </div>
                  ) : (
                    <p className="text-[14px] text-[var(--text-muted)] mb-8">
                      Use the same email address you signed up with.
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPhase("choice");
                        setErrorMessage("");
                      }}
                      disabled={completing}
                      className="btn-outline px-6 py-2.5 text-[13px] order-2 sm:order-1"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleJoinGoToPortfolio()}
                      disabled={completing}
                      className="btn-primary px-10 py-3.5 text-[15px] font-semibold disabled:opacity-50 order-1 sm:order-2"
                    >
                      {completing ? "Continuing..." : "Go to Portfolio →"}
                    </button>
                  </div>
                </div>
              ) : showCompletion ? (
                <div className="text-center py-4">
                  <h1 className="text-[28px] sm:text-[32px] font-bold text-[var(--text-primary)] mb-3">
                    {isAddingStore ? "Store added!" : "You\u2019re all set! 🎉"}
                  </h1>
                  <p className="text-[15px] text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
                    {hasValuationEstimate
                      ? `Based on what you've shared so far, your preliminary business value estimate is ${fmtDollar(estimatedValue)}. Finish setup to refine this on the Valuation page.`
                      : isAddingStore
                        ? "Your new store is in your portfolio — add more data anytime to unlock its full valuation."
                        : "Great start — we'll walk you through a few optional steps to unlock your full dashboard."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleGoToDashboard()}
                    disabled={completing}
                    className="btn-primary px-10 py-3.5 text-[15px] font-semibold disabled:opacity-50"
                  >
                    {completing
                      ? isAddingStore
                        ? "Opening portfolio..."
                        : "Continuing..."
                      : isAddingStore
                        ? "Back to Portfolio →"
                        : "Continue Setup →"}
                  </button>
                </div>
              ) : (
                <>
                  {step === 1 && (
                    <div className="text-center">
                      <h1 className="text-[28px] sm:text-[32px] font-bold text-[var(--text-primary)] mb-3">
                        Welcome to LaundroCFO
                      </h1>
                      <p className="text-[15px] text-[var(--text-secondary)] mb-8 max-w-lg mx-auto leading-relaxed">
                        Let&apos;s get your store set up in a few minutes. We&apos;ll use this to
                        calculate your store&apos;s value, benchmarks, and financial health.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                        {FEATURES.map((feature) => (
                          <div
                            key={feature.label}
                            className="rounded-xl p-4 bg-[var(--bg-page)]  border border-[var(--border)]"
                          >
                            <div className="mb-2 text-blue-500">
                              <NavIcon name={feature.icon} />
                            </div>
                            <div className="text-[13px] font-medium text-[var(--text-secondary)]">
                              {feature.label}
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => goToStep(2, "left")}
                        className="btn-primary px-10 py-3.5 text-[15px] font-semibold"
                      >
                        Get Started →
                      </button>
                    </div>
                  )}

                  {step === 2 && (
                    <div>
                      <h2 className="text-[24px] font-bold text-[var(--text-primary)] mb-1">
                        Tell us about your store
                      </h2>
                      <p className="text-[13px] text-[var(--text-muted)] mb-6">
                        Basic details help us personalize your dashboard.
                      </p>

                      <div className="space-y-4">
                        <Field label="Store Name *" error={storeNameError}>
                          <input
                            type="text"
                            value={form.storeName}
                            onChange={(e) => {
                              setField("storeName", e.target.value);
                              if (e.target.value.trim()) setStoreNameError("");
                            }}
                            onKeyDown={preventEnterSubmit}
                            className={INPUT_CLASS}
                            placeholder="Main Street Laundry"
                          />
                        </Field>

                        <Field label="Street Address">
                          <input
                            type="text"
                            value={form.streetAddress}
                            onChange={(e) => setField("streetAddress", e.target.value)}
                            onKeyDown={preventEnterSubmit}
                            className={INPUT_CLASS}
                            placeholder="123 Main St"
                          />
                        </Field>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          <Field label="City">
                            <input
                              type="text"
                              value={form.city}
                              onChange={(e) => setField("city", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="Austin"
                            />
                          </Field>
                          <Field label="State">
                            <input
                              type="text"
                              value={form.state}
                              onChange={(e) => setField("state", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="TX"
                            />
                          </Field>
                          <Field label="ZIP" className="col-span-2 sm:col-span-1">
                            <input
                              type="text"
                              value={form.zip}
                              onChange={(e) => setField("zip", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="78701"
                            />
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Square Footage">
                            <input
                              type="number"
                              value={form.squareFootage}
                              onChange={(e) => setField("squareFootage", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="4450"
                            />
                          </Field>
                          <Field label="Store Type">
                            <select
                              value={form.storeType}
                              onChange={(e) => setField("storeType", e.target.value)}
                              className={INPUT_CLASS}
                            >
                              {STORE_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Year Opened">
                            <input
                              type="number"
                              value={form.yearOpened}
                              onChange={(e) => setField("yearOpened", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="2015"
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <div>
                      <h2 className="text-[24px] font-bold text-[var(--text-primary)] mb-1">
                        Do you own or lease your location?
                      </h2>
                      <p className="text-[13px] text-[var(--text-muted)] mb-6">
                        Occupancy details affect your valuation and lending profile.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                        {(
                          [
                            { value: "lease" as const, label: "I Lease" },
                            { value: "own" as const, label: "I Own My Building" },
                          ] as const
                        ).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setField("occupancy", option.value)}
                            className={clsx(
                              "rounded-xl border-2 px-4 py-5 text-[15px] font-semibold transition-colors min-h-[72px]",
                              form.occupancy === option.value
                                ? "border-blue-500 bg-blue-500/10 text-[var(--accent-blue)]"
                                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-400/50"
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      {form.occupancy === "lease" && (
                        <div className="space-y-4 border-t border-[var(--border)] pt-5">
                          <Field label="Monthly Rent">
                            <input
                              type="number"
                              value={form.monthlyRent}
                              onChange={(e) => setField("monthlyRent", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="6200"
                            />
                          </Field>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Lease End Date">
                              <input
                                type="date"
                                value={form.leaseEndDate}
                                onChange={(e) => setField("leaseEndDate", e.target.value)}
                                onKeyDown={preventEnterSubmit}
                                className={INPUT_CLASS}
                              />
                            </Field>
                            <Field label="Annual Escalation %">
                              <input
                                type="number"
                                value={form.annualEscalation}
                                onChange={(e) => setField("annualEscalation", e.target.value)}
                                onKeyDown={preventEnterSubmit}
                                className={INPUT_CLASS}
                                placeholder="3"
                              />
                            </Field>
                          </div>
                        </div>
                      )}

                      {form.occupancy === "own" && (
                        <div className="space-y-4 border-t border-[var(--border)] pt-5">
                          <Field label="Monthly Mortgage Payment">
                            <input
                              type="number"
                              value={form.monthlyMortgage}
                              onChange={(e) => setField("monthlyMortgage", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="4500"
                            />
                          </Field>
                          <Field label="Estimated Building Value">
                            <input
                              type="number"
                              value={form.buildingValue}
                              onChange={(e) => setField("buildingValue", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="850000"
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  )}

                  {step === 4 && (
                    <div>
                      <h2 className="text-[24px] font-bold text-[var(--text-primary)] mb-1">
                        Add your financial data
                      </h2>
                      <p className="text-[13px] text-[var(--text-muted)] mb-6">
                        Upload transactions or enter estimates for the current month.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                        {(
                          [
                            { value: "csv" as const, label: "Upload Bank CSV", hint: "Import from your bank export" },
                            { value: "manual" as const, label: "Enter Manually", hint: "Monthly revenue & expenses" },
                          ] as const
                        ).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setField("financialMode", option.value)}
                            className={clsx(
                              "rounded-xl border-2 p-4 text-left transition-colors min-h-[88px]",
                              form.financialMode === option.value
                                ? "border-blue-500 bg-blue-500/10"
                                : "border-[var(--border)] hover:border-blue-400/50"
                            )}
                          >
                            <div className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
                              {option.label}
                            </div>
                            <div className="text-[12px] text-[var(--text-muted)]">{option.hint}</div>
                          </button>
                        ))}
                      </div>

                      {form.financialMode === "csv" && (
                        <div className="rounded-lg border border-dashed border-[var(--border)] p-5">
                          <label className="block cursor-pointer">
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleCsvUpload(file);
                              }}
                            />
                            <span className="btn-outline inline-block px-4 py-2 text-[13px]">
                              Choose CSV file
                            </span>
                          </label>
                          {csvFileName && (
                            <p className="text-[13px] text-[var(--text-secondary)] mt-3">
                              {csvFileName} — {csvRowCount} transaction{csvRowCount === 1 ? "" : "s"} ready to import
                            </p>
                          )}
                        </div>
                      )}

                      {form.financialMode === "manual" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Monthly Revenue">
                            <input
                              type="number"
                              value={form.monthlyRevenue}
                              onChange={(e) => setField("monthlyRevenue", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="69271"
                            />
                          </Field>
                          <Field label="Monthly Expenses">
                            <input
                              type="number"
                              value={form.monthlyExpenses}
                              onChange={(e) => setField("monthlyExpenses", e.target.value)}
                              onKeyDown={preventEnterSubmit}
                              className={INPUT_CLASS}
                              placeholder="43230"
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  )}

                  {!showCompletion && phase === "wizard" && step > 1 && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-8 pt-6 border-t border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => {
                          if (step === 2 && isAddingStore) {
                            router.push("/portfolio");
                            return;
                          }
                          if (step === 2 && !isAddingStore) {
                            setPhase("choice");
                            setStep(1);
                            setErrorMessage("");
                            return;
                          }
                          goToStep(step - 1, "right");
                        }}
                        disabled={busy}
                        className="btn-outline px-5 py-2.5 text-[13px] order-2 sm:order-1"
                      >
                        ← Back
                      </button>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 order-1 sm:order-2">
                        {step >= 3 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (step === 3) void handleStep3Next(true);
                              else void handleStep4Next(true);
                            }}
                            className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40 px-2 py-2"
                          >
                            {step === 4
                              ? "I'll add this later — start with estimates"
                              : "I'll add this later"}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (step === 2) void handleStep2Next();
                            else if (step === 3) void handleStep3Next(false);
                            else if (step === 4) void handleStep4Next(false);
                          }}
                          className="btn-primary px-8 py-2.5 text-[13px] disabled:opacity-50"
                        >
                          {busy
                            ? "Saving..."
                            : step === 4
                              ? "Continue →"
                              : "Next →"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
