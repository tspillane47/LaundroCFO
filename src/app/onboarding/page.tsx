"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import { FormBanner } from "@/components/ui/FormBanner";
import { NavIcon } from "@/components/ui/NavIcons";
import { INPUT_CLASS, preventEnterSubmit } from "@/components/occupancy/shared";

const STORAGE_KEY = "laundrocfo_onboarding";
const VALUATION_MULTIPLE = 3.47;
const TOTAL_STEPS = 4;

type OnboardingData = {
  step: number;
  name: string;
  address: string;
  square_footage: string;
  store_type: string;
  year_opened: string;
  market_type: string;
  monthly_revenue: string;
  monthly_expenses: string;
  monthly_rent: string;
  annual_debt_service: string;
  loan_balance: string;
  washers: string;
  dryers: string;
  avg_machine_age: string;
  lease_expiration: string;
  renewal_options: string;
  assignment_rights: string;
  personal_guaranty: boolean;
};

const DEFAULT_DATA: OnboardingData = {
  step: 1,
  name: "",
  address: "",
  square_footage: "",
  store_type: "Hybrid",
  year_opened: "",
  market_type: "Suburban",
  monthly_revenue: "",
  monthly_expenses: "",
  monthly_rent: "",
  annual_debt_service: "",
  loan_balance: "",
  washers: "",
  dryers: "",
  avg_machine_age: "",
  lease_expiration: "",
  renewal_options: "None",
  assignment_rights: "With Consent",
  personal_guaranty: false,
};

const MARKET_MAP: Record<string, string> = {
  "Dense Urban": "urban",
  Suburban: "suburban",
  "Small City": "average",
  Rural: "rural",
};

const RENEWAL_COUNT: Record<string, number> = {
  None: 0,
  "1 option": 1,
  "2 options": 2,
  "3+ options": 3,
};

const FEATURES = [
  { icon: "valuation", label: "Live Valuation" },
  { icon: "occupancy", label: "Lease Tracking" },
  { icon: "equipment", label: "Equipment Scoring" },
  { icon: "insurance", label: "Insurance" },
];

const inputClass = INPUT_CLASS;

const largeInputClass = INPUT_CLASS;

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcYearsRemaining(endDate: string): number {
  const end = parseDate(endDate);
  if (!end) return 0;
  const now = new Date();
  return Math.max(0, (end.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function leaseRisk(years: number): { label: string; color: string } {
  if (years >= 5) return { label: "Low", color: "text-green-400" };
  if (years >= 3) return { label: "Moderate", color: "text-amber-400" };
  return { label: "High", color: "text-red-400" };
}

function Field({
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

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { refreshStores } = useStores();
  const [data, setData] = useState<OnboardingData>(DEFAULT_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setData({ ...DEFAULT_DATA, ...JSON.parse(saved) });
      } catch {
        /* ignore */
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, hydrated]);

  function set<K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) {
    setData((d) => ({ ...d, [field]: value }));
  }

  function goToStep(step: number) {
    set("step", step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const financialPreview = useMemo(() => {
    const revenue = Number(data.monthly_revenue) || 0;
    const expenses = Number(data.monthly_expenses) || 0;
    const monthlyEbitda = revenue - expenses;
    const annualEbitda = monthlyEbitda * 12;
    const debtService = Number(data.annual_debt_service) || 0;
    const dscr = debtService > 0 ? annualEbitda / debtService : 0;
    const storeValue = annualEbitda * VALUATION_MULTIPLE;
    return { monthlyEbitda, annualEbitda, dscr, storeValue };
  }, [data.monthly_revenue, data.monthly_expenses, data.annual_debt_service]);

  const leasePreview = useMemo(() => {
    const years = calcYearsRemaining(data.lease_expiration);
    return { years, risk: leaseRisk(years) };
  }, [data.lease_expiration]);

  const step2Valid = data.name.trim() !== "" && data.address.trim() !== "";

  async function handleSubmit(includeLease: boolean) {
    if (submitting || submitStatus === "success") return;

    setSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        setSubmitting(false);
        return;
      }

      const name = data.name.trim();
      const address = data.address.trim();

      const { data: existingStores } = await supabase
        .from("stores")
        .select("id, name, address, created_at")
        .eq("user_id", user.id)
        .eq("name", name)
        .eq("address", address);

      if (existingStores && existingStores.length > 0) {
        const recentDuplicate = existingStores.find((s) => {
          const createdAt = new Date(s.created_at).getTime();
          return Date.now() - createdAt < 60000;
        });

        if (recentDuplicate) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.setItem("laundrocfo_show_welcome", "true");
          await refreshStores();
          setSubmitStatus("success");
          setTimeout(() => router.push("/portfolio"), 600);
          return;
        }
      }

      const storePayload: Record<string, unknown> = {
        user_id: user.id,
        name,
        address,
        square_footage: data.square_footage ? Number(data.square_footage) : null,
        store_type: data.store_type,
        year_opened: data.year_opened ? Number(data.year_opened) : null,
        market_density: MARKET_MAP[data.market_type] ?? "suburban",
        monthly_revenue: data.monthly_revenue ? Number(data.monthly_revenue) : null,
        monthly_expenses: data.monthly_expenses ? Number(data.monthly_expenses) : null,
        monthly_rent: data.monthly_rent ? Number(data.monthly_rent) : null,
        annual_debt_service: data.annual_debt_service ? Number(data.annual_debt_service) : null,
        loan_balance: data.loan_balance ? Number(data.loan_balance) : null,
        washers: data.washers ? Number(data.washers) : null,
        dryers: data.dryers ? Number(data.dryers) : null,
        avg_machine_age: data.avg_machine_age ? Number(data.avg_machine_age) : null,
      };

      if (includeLease) {
        storePayload.occupancy_type = "leased";
        storePayload.lease_expiration = data.lease_expiration || null;
      }

      const { data: newStore, error: storeError } = await supabase
        .from("stores")
        .insert(storePayload)
        .select("id")
        .single();

      if (storeError) {
        console.error("Store creation error:", storeError);
        setSubmitStatus("error");
        setErrorMessage("Store was not created. Please try again.");
        setSubmitting(false);
        return;
      }

      if (!newStore) {
        setSubmitStatus("error");
        setErrorMessage("Store was not created. Please try again.");
        setSubmitting(false);
        return;
      }

      if (includeLease && data.lease_expiration) {
        const { data: leaseRow, error: leaseError } = await supabase
          .from("leases")
          .upsert(
            {
              store_id: newStore.id,
              user_id: user.id,
              lease_end_date: data.lease_expiration,
              monthly_rent: data.monthly_rent ? Number(data.monthly_rent) : null,
              personal_guaranty: data.personal_guaranty,
              assignment_rights: data.assignment_rights,
            },
            { onConflict: "store_id" }
          )
          .select("id")
          .single();

        if (leaseError) {
          console.error("Lease creation error (non-blocking):", leaseError);
        } else {
          const optionCount = RENEWAL_COUNT[data.renewal_options] ?? 0;
          if (optionCount > 0 && leaseRow?.id) {
            const options = Array.from({ length: optionCount }, (_, i) => ({
              lease_id: leaseRow.id,
              store_id: newStore.id,
              user_id: user.id,
              option_number: i + 1,
              option_years: 5,
              status: "Available",
              notice_days: 180,
            }));
            const { error: optionsError } = await supabase.from("lease_options").insert(options);
            if (optionsError) {
              console.error("Lease options error (non-blocking):", optionsError);
            }
          }
        }
      }

      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem("laundrocfo_show_welcome", "true");
      await refreshStores();
      setSubmitStatus("success");
      setTimeout(() => router.push("/portfolio"), 600);
    } catch (err) {
      console.error("Unexpected error during store creation:", err);
      setSubmitStatus("error");
      setErrorMessage("Store was not created. Please try again.");
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] dark:bg-[#0f1e3d] flex items-center justify-center">
        <div className="text-gray-700 dark:text-slate-400 text-[13px]">Loading...</div>
      </div>
    );
  }

  const progressPct = (data.step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-[var(--bg-page)] dark:bg-[#0f1e3d] flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-white/10 flex-shrink-0">
        <div
          className="h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-2xl">
          {/* Logo */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="text-[22px] font-bold text-blue-300 tracking-tight">LaundroCFO</div>
            {data.step > 1 && (
              <div className="text-[12px] text-gray-700 dark:text-slate-500 mt-2">
                Step {data.step} of {TOTAL_STEPS}
              </div>
            )}
          </div>

          <FormBanner
            message={
              submitStatus === "error"
                ? { type: "error", text: errorMessage }
                : null
            }
          />

          {/* Step 1 — Welcome */}
          {data.step === 1 && (
            <div className="text-center">
              <h1 className="text-[32px] sm:text-[40px] font-bold text-white tracking-tight mb-3">
                Welcome to LaundroCFO
              </h1>
              <p className="text-[16px] text-gray-700 dark:text-slate-400 mb-2">
                Let&apos;s set up your first store. It takes about 2 minutes.
              </p>
              <p className="text-[12px] text-gray-700 dark:text-slate-500 mb-10">Step 1 of 4</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-10">
                {FEATURES.map((f) => (
                  <div
                    key={f.label}
                    className="rounded-xl p-4 bg-[var(--bg-page)] dark:bg-white/5 border border-[var(--border)] dark:border-white/10"
                  >
                    <div className="mb-2 text-blue-400">
                      <NavIcon name={f.icon} />
                    </div>
                    <div className="text-[12px] sm:text-[13px] text-[var(--text-secondary)] dark:text-slate-300 font-medium">
                      {f.label}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => goToStep(2)}
                className="btn-primary px-10 py-3.5 text-[15px] font-semibold mb-4"
              >
                Get Started →
              </button>
              <div>
                <Link href="/portfolio" className="text-[13px] text-gray-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-300">
                  I&apos;ll do this later
                </Link>
              </div>
            </div>
          )}

          {/* Step 2 — Store Basics */}
          {data.step === 2 && (
            <div>
              <h2 className="text-[24px] font-bold text-white mb-1">Tell us about your store</h2>
              <p className="text-[13px] text-gray-700 dark:text-slate-500 mb-6">Step 2 of 4</p>

              <div className="card space-y-4">
                <Field label="Store Name *">
                  <input
                    type="text"
                    value={data.name}
                    onChange={(e) => set("name", e.target.value)}
                    onKeyDown={preventEnterSubmit}
                    className={largeInputClass}
                    placeholder="My Laundromat"
                  />
                </Field>
                <Field label="Store Address *">
                  <input
                    type="text"
                    value={data.address}
                    onChange={(e) => set("address", e.target.value)}
                    onKeyDown={preventEnterSubmit}
                    className={inputClass}
                    placeholder="123 Main St, City, ST"
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Square Footage">
                    <input
                      type="number"
                      value={data.square_footage}
                      onChange={(e) => set("square_footage", e.target.value)}
                      onKeyDown={preventEnterSubmit}
                      className={inputClass}
                      placeholder="4450"
                    />
                  </Field>
                  <Field label="Store Type">
                    <select
                      value={data.store_type}
                      onChange={(e) => set("store_type", e.target.value)}
                      className={inputClass}
                    >
                      {["Coin", "Card", "Hybrid"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Year Opened">
                    <input
                      type="number"
                      value={data.year_opened}
                      onChange={(e) => set("year_opened", e.target.value)}
                      onKeyDown={preventEnterSubmit}
                      className={inputClass}
                      placeholder="2015"
                    />
                  </Field>
                  <Field label="Market Type">
                    <select
                      value={data.market_type}
                      onChange={(e) => set("market_type", e.target.value)}
                      className={inputClass}
                    >
                      {["Dense Urban", "Suburban", "Small City", "Rural"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
                <button onClick={() => goToStep(1)} className="text-[13px] text-gray-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-300">
                  ← Back
                </button>
                <button
                  onClick={() => goToStep(3)}
                  disabled={!step2Valid}
                  className="btn-primary px-8 py-2.5 text-[13px] disabled:opacity-40"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Financial Basics */}
          {data.step === 3 && (
            <div>
              <h2 className="text-[24px] font-bold text-white mb-1">Enter your store&apos;s financials</h2>
              <p className="text-[13px] text-gray-700 dark:text-slate-400 mb-6">
                Estimates are fine — you can update these anytime.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <div className="lg:col-span-3 card space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { key: "monthly_revenue" as const, label: "Monthly Revenue", ph: "69271" },
                      { key: "monthly_expenses" as const, label: "Monthly Expenses (excl. rent)", ph: "43230" },
                      { key: "monthly_rent" as const, label: "Monthly Rent", ph: "6200" },
                      { key: "annual_debt_service" as const, label: "Annual Debt Service", ph: "98400" },
                      { key: "loan_balance" as const, label: "Current Loan Balance", ph: "850000" },
                      { key: "washers" as const, label: "Number of Washers", ph: "28" },
                      { key: "dryers" as const, label: "Number of Dryers", ph: "32" },
                      { key: "avg_machine_age" as const, label: "Average Machine Age (years)", ph: "6" },
                    ].map((f) => (
                      <Field key={f.key} label={f.label}>
                        <input
                          type="number"
                          value={data[f.key]}
                          onChange={(e) => set(f.key, e.target.value)}
                          onKeyDown={preventEnterSubmit}
                          className={inputClass}
                          placeholder={f.ph}
                        />
                      </Field>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="card card-info sticky top-4">
                    <div className="text-[13px] font-semibold text-[var(--text-info)] dark:text-blue-300 mb-4">Based on your numbers:</div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] text-gray-700 dark:text-slate-500 uppercase tracking-wider">Estimated EBITDA</div>
                        <div className="text-[22px] font-bold text-[var(--text-primary)] dark:text-white">
                          {fmtDollar(financialPreview.monthlyEbitda)}/mo
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-700 dark:text-slate-500 uppercase tracking-wider">Estimated Annual EBITDA</div>
                        <div className="text-[18px] font-bold text-[var(--text-primary)] dark:text-slate-200">
                          {fmtDollar(financialPreview.annualEbitda)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-700 dark:text-slate-500 uppercase tracking-wider">Estimated Store Value</div>
                        <div className="text-[18px] font-bold positive">
                          {fmtDollar(financialPreview.storeValue)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-700 dark:text-slate-500 uppercase tracking-wider">DSCR</div>
                        <div className={clsx(
                          "text-[18px] font-bold",
                          financialPreview.dscr >= 1.25 ? "text-green-400" : financialPreview.dscr > 0 ? "text-amber-400" : "text-gray-700 dark:text-slate-500"
                        )}>
                          {financialPreview.dscr > 0 ? fmtMultiple(financialPreview.dscr) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
                <button onClick={() => goToStep(2)} className="text-[13px] text-gray-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-300">
                  ← Back
                </button>
                <button onClick={() => goToStep(4)} className="btn-primary px-8 py-2.5 text-[13px]">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Lease Basics */}
          {data.step === 4 && (
            <div>
              <h2 className="text-[24px] font-bold text-white mb-1">Tell us about your lease</h2>
              <p className="text-[13px] text-gray-700 dark:text-slate-400 mb-6">
                This affects your store&apos;s valuation and lending risk.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <div className="lg:col-span-3 card space-y-4">
                  <Field label="Lease Expiration Date">
                    <input
                      type="date"
                      value={data.lease_expiration}
                      onChange={(e) => set("lease_expiration", e.target.value)}
                      onKeyDown={preventEnterSubmit}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Monthly Rent">
                    <input
                      type="number"
                      value={data.monthly_rent}
                      onChange={(e) => set("monthly_rent", e.target.value)}
                      onKeyDown={preventEnterSubmit}
                      className={inputClass}
                      placeholder="6200"
                    />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Renewal Options">
                      <select
                        value={data.renewal_options}
                        onChange={(e) => set("renewal_options", e.target.value)}
                        className={inputClass}
                      >
                        {["None", "1 option", "2 options", "3+ options"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Assignment Rights">
                      <select
                        value={data.assignment_rights}
                        onChange={(e) => set("assignment_rights", e.target.value)}
                        className={inputClass}
                      >
                        {["Allowed", "With Consent", "Not Allowed"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[13px] text-slate-900 dark:text-slate-300">Personal Guaranty</span>
                    <button
                      type="button"
                      onClick={() => set("personal_guaranty", !data.personal_guaranty)}
                      className={clsx(
                        "relative w-11 h-6 rounded-full transition-colors",
                        data.personal_guaranty ? "bg-blue-500" : "bg-slate-600"
                      )}
                    >
                      <span
                        className={clsx(
                          "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                          data.personal_guaranty ? "translate-x-5" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="card sticky top-4">
                    <div className="text-[13px] font-semibold text-[var(--text-primary)] dark:text-slate-200 mb-4">Your Lease Position:</div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] text-gray-700 dark:text-slate-500 uppercase tracking-wider">Years Remaining</div>
                        <div className="text-[22px] font-bold text-[var(--text-primary)] dark:text-white">
                          {data.lease_expiration ? `${leasePreview.years.toFixed(1)} years` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-700 dark:text-slate-500 uppercase tracking-wider">Risk Level</div>
                        <div className={clsx("text-[18px] font-bold", leasePreview.risk.color)}>
                          {data.lease_expiration ? leasePreview.risk.label : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
                <button onClick={() => goToStep(3)} className="text-[13px] text-gray-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-300">
                  ← Back
                </button>
                <div className="flex flex-col w-full sm:w-auto items-stretch sm:items-center gap-3">
                  <button
                    onClick={() => handleSubmit(false)}
                    disabled={submitting || submitStatus === "success"}
                    className="text-[13px] text-gray-700 dark:text-slate-500 hover:text-slate-900 dark:text-slate-300 disabled:opacity-40"
                  >
                    Skip for now
                  </button>
                  <button
                    onClick={() => handleSubmit(true)}
                    disabled={submitting || submitStatus === "success"}
                    className="btn-primary px-8 py-2.5 text-[13px] disabled:opacity-40"
                    style={{ width: "100%" }}
                  >
                    {submitStatus === "success"
                      ? "Store Created"
                      : submitting
                        ? "Creating store..."
                        : "Finish Setup →"}
                  </button>
                  {submitStatus === "success" && (
                    <div
                      style={{
                        background: "var(--bg-success-tint)",
                        color: "var(--text-success)",
                        padding: "12px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        textAlign: "center",
                      }}
                    >
                      Store created successfully. Redirecting...
                    </div>
                  )}
                  {submitStatus === "error" && (
                    <div
                      style={{
                        background: "var(--bg-danger-tint)",
                        color: "var(--text-danger)",
                        padding: "12px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        textAlign: "center",
                      }}
                    >
                      {errorMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
