"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { calcMultiPhaseLoan, type LoanPhaseType } from "@/lib/amortization";
import { fmtDollar, fmtMultiple } from "@/lib/calculations";
import {
  computeStoreDscr,
  getDscrSubtext,
  getDscrValueColor,
} from "@/lib/dscr";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Disclaimer, DisclaimerLabel } from "@/components/ui/Disclaimer";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { TouchNumericInput } from "@/components/ui/TouchNumericInput";

type LoanCalculatorProps = {
  annualEbitda: number;
  businessValue: number;
  realEstateValue?: number;
  isOwnerOccupied?: boolean;
  existingAnnualDebtService: number;
  hasFinancialData: boolean;
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
}: LoanCalculatorProps) {
  const [loanAmount, setLoanAmount] = useState(500_000);
  const [interestRate, setInterestRate] = useState(7.5);
  const [termMonths, setTermMonths] = useState(120);
  const [interestOnlyEnabled, setInterestOnlyEnabled] = useState(false);
  const [interestOnlyMonths, setInterestOnlyMonths] = useState(12);
  const [deferredEnabled, setDeferredEnabled] = useState(false);
  const [deferredMonths, setDeferredMonths] = useState(6);
  const [isRefinance, setIsRefinance] = useState(false);

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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-title mb-1">Loan Calculator</h2>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Model a new loan against your store&apos;s real financials
        </p>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--hero-bg)",
          border: "1px solid rgba(59,130,246,0.2)",
        }}
      >
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div
            className="text-[11px] uppercase tracking-widest mb-2"
            style={{ color: "#93c5fd" }}
          >
            Monthly Payment
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <AnimatedNumber
              value={primaryPayment}
              prefix="$"
              className="text-[32px] sm:text-[36px] font-bold tabular-nums"
              style={{ color: "#fff", letterSpacing: "-0.02em" }}
              duration={600}
            />
            {showMonth1Note && (
              <span
                className="text-[13px] font-medium px-2.5 py-1 rounded-full"
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
            <div className="flex flex-wrap gap-2 mt-4">
              {loanResult.phases.map((phase, i) => (
                <span
                  key={`${phase.type}-${i}`}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full"
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
          className="grid grid-cols-1 sm:grid-cols-2 gap-px"
          style={{ background: "rgba(59,130,246,0.15)" }}
        >
          <ResultCell
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
                ? `${dscrSubtext}${!isRefinance && existingAnnualDebtService > 0 ? " · includes existing debt" : isRefinance ? " · refinance (excludes existing)" : ""}`
                : "Add monthly financials"
            }
            valueColor={dscrColor}
          />
          <ResultCell
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
                ? `${fmtDollar(loanAmount)} ÷ ${fmtDollar(businessValue)} business value`
                : "Add financials for valuation"
            }
          />
        </div>
      </div>

      {isOwnerOccupied && realEstateValue > 0 && (
        <div
          className="rounded-xl px-5 py-4"
          style={{
            background: "var(--bg-card2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Real Estate Value
            </span>
            <span
              className="text-[16px] font-bold tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {fmtDollar(realEstateValue)}
            </span>
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
            Shown separately — business LTV above uses business value only
          </p>
        </div>
      )}

      <div className="card space-y-5">
        <div className="grid grid-cols-1 gap-5">
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
          />
        </div>

        <div
          className="space-y-4 pt-4 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <ToggleRow
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
            />
          )}

          <ToggleRow
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
            />
          )}

          <ToggleRow
            label="This replaces my current loan (refinance)"
            description="Exclude existing debt service from DSCR"
            checked={isRefinance}
            onChange={setIsRefinance}
          />
        </div>
      </div>

      <div
        className="card space-y-3"
        style={{ padding: "16px 18px" }}
      >
        <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>
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
          <BreakdownRow
            label="TTM EBITDA"
            value={fmtDollar(annualEbitda)}
          />
        )}
      </div>

      <Disclaimer variant="loan-calculator" />
    </div>
  );
}

function ResultCell({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div
      className="px-5 py-4 sm:px-6"
      style={{ background: "rgba(15,30,61,0.6)" }}
    >
      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "#93c5fd" }}>
        <DisclaimerLabel>{label}</DisclaimerLabel>
      </div>
      <div
        className="text-[22px] sm:text-[24px] font-bold tabular-nums"
        style={{ color: valueColor ?? "#fff" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
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
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <div className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </div>
        {description && (
          <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {description}
          </div>
        )}
      </div>
      <ToggleSwitch
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
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
        className={clsx("text-[13px]", bold && "font-semibold")}
        style={{ color: bold ? "var(--text-primary)" : "var(--text-secondary)" }}
      >
        {label}
      </span>
      <span
        className={clsx("text-[13px] tabular-nums", bold && "font-bold text-[15px]")}
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}
