"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const integrations = [
  {
    id: "qbo",
    name: "QuickBooks Online",
    description: "Sync revenue, expenses, payroll, and debt service automatically each month.",
    syncs: ["Revenue", "EBITDA", "Payroll", "Utilities", "Debt Service"],
    status: "disconnected",
    color: "#2ca01c",
    label: "QB",
    cta: "Connect QuickBooks",
    ctaStyle: "btn-primary",
    href: "/financials",
  },
  {
    id: "plaid",
    name: "Plaid — Bank Feed",
    description: "Connect your business bank account for real-time cash flow and transaction categorization.",
    syncs: ["Bank Transactions", "Cash Balance", "Payments"],
    status: "coming_soon",
    color: "#1a3a5c",
    label: "PL",
    cta: "Join Waitlist",
    ctaStyle: "btn-outline",
    disabled: true,
  },
  {
    id: "utility",
    name: "Utility Bill Upload",
    description: "Upload PG&E, Edison, or any utility PDFs — LaundroCFO extracts monthly utility costs automatically.",
    syncs: ["Gas", "Electric", "Water"],
    status: "disconnected",
    color: "#1e3a8a",
    label: "UT",
    cta: "Upload Bill",
    ctaStyle: "btn-outline",
    href: "/utilities",
  },
  {
    id: "lease",
    name: "Lease PDF Upload",
    description: "Upload your lease document — LaundroCFO extracts key terms, dates, rent schedule, and renewal options.",
    syncs: ["Rent", "CAM", "Terms", "Options"],
    status: "disconnected",
    color: "#374151",
    label: "LS",
    cta: "Upload Lease",
    ctaStyle: "btn-outline",
    href: "/lease",
  },
];

export default function IntegrationsPage() {
  const router = useRouter();

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-[15px] font-semibold text-slate-100">Integrations</h1>
        <p className="text-[12px] text-gray-700 dark:text-slate-500 mt-1">
          Connect your data sources to automatically populate financial metrics and reduce manual entry.
        </p>
      </div>

      <div className="space-y-4">
        {integrations.map((i) => (
          <div key={i.id} className="card flex items-center gap-5">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-[16px] font-bold flex-shrink-0"
              style={{ background: i.color }}
            >
              {i.label}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="text-[14px] font-semibold text-slate-100">{i.name}</div>
                {i.status === "coming_soon" && (
                  <span className="badge badge-blue text-[10px]">Coming Soon</span>
                )}
                {i.status === "connected" && (
                  <span className="badge badge-green text-[10px]">Connected</span>
                )}
              </div>
              <div className="text-[12px] text-gray-700 dark:text-slate-400 mb-2">{i.description}</div>
              <div className="flex gap-1.5 flex-wrap">
                {i.syncs.map((s) => (
                  <span key={s} className="text-[10px] bg-[var(--bg-page)] dark:bg-[#243347] text-[var(--text-secondary)] dark:text-slate-400 px-2 py-0.5 rounded-md border border-[var(--border)] dark:border-transparent">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            {i.href ? (
              <Link href={i.href} className={`${i.ctaStyle} flex-shrink-0 whitespace-nowrap`}>
                {i.cta}
              </Link>
            ) : (
              <button
                type="button"
                className={`${i.ctaStyle} flex-shrink-0 whitespace-nowrap disabled:opacity-50`}
                disabled={i.disabled}
                onClick={() => {
                  if (!i.disabled) router.push("/transactions");
                }}
              >
                {i.cta}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Manual entry note */}
      <div className="card">
        <div className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          <span className="text-[var(--text-primary)] dark:text-slate-200 font-semibold">Manual entry available today.</span>{" "}
          Enter monthly financials, utilities, and lease data directly in the app, or connect QuickBooks from the Financials page when ready.
        </div>
      </div>
    </div>
  );
}
