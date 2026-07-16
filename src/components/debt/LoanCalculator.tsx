"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Calculator } from "lucide-react";
import { calcMultiPhaseLoan, type LoanPhaseType } from "@/lib/amortization";
import { fmtDollar } from "@/lib/calculations";
import {
  computeStoreDscr,
  getDscrSubtext,
  getDscrValueColor,
} from "@/lib/dscr";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Disclaimer, DisclaimerLabel } from "@/components/ui/Disclaimer";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { TouchNumericInput } from "@/components/ui/TouchNumericInput";

export type LoanCalculatorProps = {
  annualEbitda: number;
  businessValue: number;
  realEstateValue?: number;
  isOwnerOccupied?: boolean;
  existingAnnualDebtService: number;
  hasFinancialData: boolean;
  displayMode?: "inline" | "panel" | "mobile";
};

const PHASE_LABELS: Record<LoanPhaseType, string> = {
  deferred: "Deferred",
  "interest-only": "Interest-Only",
  amortizing: "Amortizing",
};

const PHASE_COLORS: Record<LoanPhaseType, string> = {
  deferred: "rgba(245,158,11,0.15)",
  "interest-only": "rgba(56,189,248,0.15)",
  amortizing: "rgba(34,197,94,0.15)",
};

const PHASE_TEXT: Record<LoanPhaseType, string> = {
  deferred: "#fbbf24",
  "interest-only": "#38bdf8",
  amortizing: "#4ade80",
};

export function LoanCalculator({
  annualEbitda,
  businessValue,
  realEstateValue = 0,
  isOwnerOccupied = false,
  existingAnnualDebtService,
  hasFinancialData,
  displayMode = "inline",
}: LoanCalculatorProps) {
  const [loanAmount, setLoanAmount] = useState(500_000);
  const [interestRate, setInterestRate] = useState(7.5);
  const [termMonths, setTermMonths] = useState(120);
  const [interestOnlyEnabled, setInterestOnlyEnabled] = useState(false);
  const [interestOnlyMonths, setInterestOnlyMonths] = useState(12);
  const [deferredEnabled, setDeferredEnabled] = useState(false);
  const [deferredMonths, setDeferredMonths] = useState(6);
  const [isRefinance, setIsRefinance] = useState(false);

  const isWidget = displayMode === "panel" || displayMode === "mobile";

  const loanResult = useMemo(
    () =>
      calcMultiPhaseLoan({
        principal: loanAmount,
        annualInterestRate: interestRate,
        termMonths,
        deferredMonths: deferredEnabled ? deferredMonths : 0,
        interestOnlyMonths: interestOnlyEnabled ? interestOnlyMonths : 0,
      }),
    [
      loanAmount,
      interestRate,
      termMonths,
      deferredEnabled,
      deferredMonths,
      interestOnlyEnabled,
      interestOnlyMonths,
    ]
  );

  const totalAnnualDebtService = useMemo(() => {
    const base = isRefinance ? 0 : existingAnnualDebtService;
    return base + loanResult.annualDebtService;
  }, [existingAnnualDebtService, isRefinance, loanResult.annualDebtService]);

  const dscr = useMemo(
    () => computeStoreDscr(annualEbitda, totalAnnualDebtService),
    [annualEbitda, totalAnnualDebtService]
  );

  const businessLtv = businessValue > 0 ? (loanAmount / businessValue) * 100 : null;

  const dscrDisplayOpts = {
    hasFinancialData,
    scheduledAnnualDebtService: totalAnnualDebtService,
  };
  const dscrColor = getDscrValueColor(dscr, dscrDisplayOpts);
  const dscrSubtext = getDscrSubtext(dscr, dscrDisplayOpts);

  const showMonth1Note =
    loanResult.month1Payment !== loanResult.maxMonthlyPayment;
  const primaryPayment = loanResult.maxMonthlyPayment;

  const dscrDebtNote =
    !isRefinance && existingAnnualDebtService > 0
      ? " · includes existing debt"
      : isRefinance
        ? " · refinance (excludes existing)"
        : "";

  return (
    <div
      className={clsx(
        isWidget && "loan-calculator-widget rounded-[var(--card-radius)] overflow-hidden",
        !isWidget && "space-y-5"
      )}
      style={
        isWidget
          ? {
              background: "var(--bg-card)",
              border: "1px solid rgba(56, 189, 248, 0.18)",
              boxShadow:
                "0 0 0 1px rgba(56, 189, 248, 0.06), 0 12px 40px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
            }
          : undefined
      }
    >
      {isWidget && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 border-b"
          style={{
            borderColor: "var(--border)",
            background: "linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, transparent 100%)",
          }}
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
            style={{
              background: "var(--bg-info-tint)",
              border: "1px solid rgba(56, 189, 248, 0.22)",
              color: "var(--accent-blue)",
            }}
          >
            <Calculator size={16} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Loan Calculator
            </div>
            <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
              Model against your store&apos;s financials
            </div>
          </div>
        </div>
      )}

      <div className={clsx(isWidget ? "p-4 space-y-4" : "space-y-5")}>
        {!isWidget && (
          <div>
            <h2 className="section-title mb-1">Loan Calculator</h2>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Model a new loan against your store&apos;s real financials
            </p>
          </div>
        )}

        {/* Live results hero */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--hero-bg)",
            border: "1px solid rgba(59,130,246,0.25)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
          }}
        >
          <div className={clsx(isWidget ? "px-4 py-4" : "px-5 py-6 sm:px-7 sm:py-7")}>
            <div
              className="text-[10px] uppercase tracking-[0.14em] mb-1.5 font-semibold"
              style={{ color: "#93c5fd" }}
            >
              Monthly Payment
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <AnimatedNumber
                value={primaryPayment}
                prefix="$"
                className={clsx(
                  "font-bold tabular-nums tracking-tight",
                  isWidget ? "text-[28px]" : "text-[32px] sm:text-[36px]"
                )}
                style={{ color: "#fff", letterSpacing: "-0.02em" }}
                duration={600}
              />
              {showMonth1Note && (
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(245,158,11,0.2)",
                    color: "#fbbf24",
                  }}
                >
                  Month 1: {fmtDollar(loanResult.month1Payment)}
                </span>
              )}
            </div>

            {loanResult.phases.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {loanResult.phases.map((phase, i) => (
                  <span
                    key={`${phase.type}-${i}`}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: PHASE_COLORS[phase.type],
                      color: PHASE_TEXT[phase.type],
                    }}
                  >
                    {PHASE_LABELS[phase.type]} · {phase.months} mo ·{" "}
                    {fmtDollar(phase.monthlyPayment)}/mo
                  </span>
                ))}
              </div>
            )}
          </div>

          <div
            className="grid grid-cols-2 gap-px"
            style={{ background: "rgba(59,130,246,0.15)" }}
          >
            <ResultCell
              compact={isWidget}
              label="DSCR"
              value={
                hasFinancialData && totalAnnualDebtService > 0 && dscr != null ? (
                  <AnimatedNumber
                    value={dscr}
                    decimals={2}
                    suffix="x"
                    duration={600}
                    style={{ color: dscrColor }}
                  />
                ) : hasFinancialData && totalAnnualDebtService <= 0 ? (
                  <span style={{ color: "var(--text-success)" }}>N/A — No Debt</span>
                ) : (
                  "—"
                )
              }
              sub={
                hasFinancialData
                  ? `${dscrSubtext}${dscrDebtNote}`
                  : "Add monthly financials"
              }
              valueColor={dscrColor}
            />
            <ResultCell
              compact={isWidget}
              label="LTV (Business)"
              value={
                businessLtv != null ? (
                  <AnimatedNumber
                    value={businessLtv}
                    decimals={1}
                    suffix="%"
                    duration={600}
                    style={{
                      color:
                        businessLtv > 80
                          ? "var(--text-danger)"
                          : businessLtv > 65
                            ? "var(--text-warning)"
                            : "var(--text-success)",
                    }}
                  />
                ) : (
                  "—"
                )
              }
              sub={
                businessValue > 0
                  ? `${fmtDollar(loanAmount)} ÷ ${fmtDollar(businessValue)}`
                  : "Add financials for valuation"
              }
            />
          </div>
        </div>

        {isOwnerOccupied && realEstateValue > 0 && (
          <div
            className="rounded-lg px-3.5 py-3"
            style={{
              background: "var(--bg-card2)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Real Estate Value
              </span>
              <span
                className="text-[14px] font-bold tabular-nums"
                style={{ color: "var(--text-primary)" }}
              >
                {fmtDollar(realEstateValue)}
              </span>
            </div>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Shown separately — business LTV uses business value only
            </p>
          </div>
        )}

        {/* Inputs */}
        <div
          className={clsx(
            "space-y-4",
            !isWidget && "card space-y-5",
            isWidget && "rounded-xl p-3.5",
          )}
          style={
            isWidget
              ? {
                  background: "var(--bg-card2)",
                  border: "1px solid var(--border)",
                }
              : undefined
          }
        >
          <div className="space-y-4">
            <TouchNumericInput
              label="Loan Amount"
              value={loanAmount}
              onChange={setLoanAmount}
              min={10_000}
              max={5_000_000}
              step={10_000}
              format={(v) => fmtDollar(v)}
              parse={(raw) => {
                const n = parseFloat(raw.replace(/[$,]/g, ""));
                return Number.isNaN(n) ? null : n;
              }}
              size={isWidget ? "compact" : "default"}
            />
            <TouchNumericInput
              label="Interest Rate"
              value={interestRate}
              onChange={setInterestRate}
              min={0}
              max={20}
              step={0.25}
              decimals={2}
              suffix="%"
              size={isWidget ? "compact" : "default"}
            />
            <TouchNumericInput
              label="Term"
              value={termMonths}
              onChange={setTermMonths}
              min={12}
              max={360}
              step={6}
              format={(v) => `${v} mo (${Math.round(v / 12)} yr)`}
              parse={(raw) => {
                const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
                return Number.isNaN(n) ? null : n;
              }}
              size={isWidget ? "compact" : "default"}
            />
          </div>

          <div
            className="space-y-3 pt-3 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <ToggleRow
              compact={isWidget}
              label="Interest-only period"
              description="Pay interest only, no principal reduction"
              checked={interestOnlyEnabled}
              onChange={setInterestOnlyEnabled}
            />
            {interestOnlyEnabled && (
              <TouchNumericInput
                label="Interest-Only Duration"
                value={interestOnlyMonths}
                onChange={setInterestOnlyMonths}
                min={1}
                max={termMonths}
                step={1}
                format={(v) => `${v} months`}
                parse={(raw) => {
                  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
                  return Number.isNaN(n) ? null : n;
                }}
                size={isWidget ? "compact" : "default"}
              />
            )}

            <ToggleRow
              compact={isWidget}
              label="Deferred payment period"
              description="No payment; interest accrues and capitalizes"
              checked={deferredEnabled}
              onChange={setDeferredEnabled}
            />
            {deferredEnabled && (
              <TouchNumericInput
                label="Deferred Duration"
                value={deferredMonths}
                onChange={setDeferredMonths}
                min={1}
                max={termMonths}
                step={1}
                format={(v) => `${v} months`}
                parse={(raw) => {
                  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
                  return Number.isNaN(n) ? null : n;
                }}
                size={isWidget ? "compact" : "default"}
              />
            )}

            <ToggleRow
              compact={isWidget}
              label="This replaces my current loan (refinance)"
              description="Exclude existing debt service from DSCR"
              checked={isRefinance}
              onChange={setIsRefinance}
            />
          </div>
        </div>

        {/* Breakdown */}
        <div
          className={clsx(
            "space-y-2.5 rounded-xl",
            !isWidget && "card space-y-3",
            isWidget && "px-3.5 py-3"
          )}
          style={
            isWidget
              ? {
                  background: "var(--bg-card2)",
                  border: "1px solid var(--border)",
                }
              : !isWidget
                ? { padding: "16px 18px" }
                : undefined
          }
        >
          <div
            className="text-[10px] uppercase tracking-[0.12em] font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Debt Service Breakdown
          </div>
          <BreakdownRow
            label="New loan (annual)"
            value={fmtDollar(loanResult.annualDebtService)}
          />
          {!isRefinance && existingAnnualDebtService > 0 && (
            <BreakdownRow
              label="Existing loans (annual)"
              value={fmtDollar(existingAnnualDebtService)}
            />
          )}
          <BreakdownRow
            label="Total for DSCR"
            value={fmtDollar(totalAnnualDebtService)}
            bold
          />
          {hasFinancialData && (
            <BreakdownRow label="TTM EBITDA" value={fmtDollar(annualEbitda)} />
          )}
        </div>

        <Disclaimer variant="loan-calculator" />
      </div>
    </div>
  );
}

function ResultCell({
  label,
  value,
  sub,
  valueColor,
  compact,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  valueColor?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={clsx(compact ? "px-3.5 py-3" : "px-5 py-4 sm:px-6")}
      style={{ background: "rgba(15,30,61,0.6)" }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.12em] mb-1 font-semibold"
        style={{ color: "#93c5fd" }}
      >
        <DisclaimerLabel>{label}</DisclaimerLabel>
      </div>
      <div
        className={clsx(
          "font-bold tabular-nums",
          compact ? "text-[18px]" : "text-[22px] sm:text-[24px]"
        )}
        style={{ color: valueColor ?? "#fff" }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-[10px] mt-0.5 leading-snug"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  compact,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="min-w-0">
        <div
          className={clsx("font-medium", compact ? "text-[13px]" : "text-[14px]")}
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </div>
        {description && (
          <div
            className={clsx("mt-0.5", compact ? "text-[11px]" : "text-[12px]")}
            style={{ color: "var(--text-muted)" }}
          >
            {description}
          </div>
        )}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={clsx("text-[12px]", bold && "font-semibold")}
        style={{ color: bold ? "var(--text-primary)" : "var(--text-secondary)" }}
      >
        {label}
      </span>
      <span
        className={clsx("text-[12px] tabular-nums", bold && "font-bold text-[14px]")}
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}
