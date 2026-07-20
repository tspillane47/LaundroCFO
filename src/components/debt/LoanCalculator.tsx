"use client";

import { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import { Calculator } from "lucide-react";
import {
  calcMultiPhaseLoan,
  calcReverseSolveLoan,
  DEFAULT_MAX_LTV_PERCENT,
  type LoanPhaseType,
  type ReverseSolveLoanResult,
} from "@/lib/amortization";
import { fmtDollar } from "@/lib/calculations";
import {
  computeStoreDscr,
  DSCR_LENDER_MINIMUM,
  getDscrSubtext,
  getDscrValueColor,
} from "@/lib/dscr";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Disclaimer, DisclaimerLabel } from "@/components/ui/Disclaimer";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { TouchNumericInput } from "@/components/ui/TouchNumericInput";
import { SavedLoanCalculationsSection } from "@/components/debt/SavedLoanCalculationsSection";
import {
  buildSavedLoanForwardOutputs,
  buildSavedLoanInputs,
  buildSavedLoanReverseOutputs,
  type SavedLoanCalculationInputs,
} from "@/lib/savedLoanCalculations";

export type LoanCalculatorProps = {
  storeId?: string;
  annualEbitda: number;
  businessValue: number;
  realEstateValue?: number;
  isOwnerOccupied?: boolean;
  existingAnnualDebtService: number;
  hasFinancialData: boolean;
  displayMode?: "inline" | "panel" | "mobile";
};

type CalcMode = "forward" | "reverse";

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
  storeId,
  annualEbitda,
  businessValue,
  realEstateValue = 0,
  isOwnerOccupied = false,
  existingAnnualDebtService,
  hasFinancialData,
  displayMode = "inline",
}: LoanCalculatorProps) {
  const [calcMode, setCalcMode] = useState<CalcMode>("forward");
  const [loanAmount, setLoanAmount] = useState(500_000);
  const [targetDscr, setTargetDscr] = useState(DSCR_LENDER_MINIMUM);
  const [maxLtvPercent, setMaxLtvPercent] = useState(DEFAULT_MAX_LTV_PERCENT);
  const [interestRate, setInterestRate] = useState(7.5);
  const [termMonths, setTermMonths] = useState(120);
  const [interestOnlyEnabled, setInterestOnlyEnabled] = useState(false);
  const [interestOnlyMonths, setInterestOnlyMonths] = useState(12);
  const [deferredEnabled, setDeferredEnabled] = useState(false);
  const [deferredMonths, setDeferredMonths] = useState(6);
  const [isRefinance, setIsRefinance] = useState(false);

  const isWidget = displayMode === "panel" || displayMode === "mobile";
  const deferredMonthsValue = deferredEnabled ? deferredMonths : 0;
  const interestOnlyMonthsValue = interestOnlyEnabled ? interestOnlyMonths : 0;

  const loanResult = useMemo(
    () =>
      calcMultiPhaseLoan({
        principal: loanAmount,
        annualInterestRate: interestRate,
        termMonths,
        deferredMonths: deferredMonthsValue,
        interestOnlyMonths: interestOnlyMonthsValue,
      }),
    [
      loanAmount,
      interestRate,
      termMonths,
      deferredMonthsValue,
      interestOnlyMonthsValue,
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

  const reverseResult = useMemo(
    () =>
      calcReverseSolveLoan({
        targetDscr,
        annualEbitda,
        existingAnnualDebtService,
        isRefinance,
        annualInterestRate: interestRate,
        termMonths,
        deferredMonths: deferredMonthsValue,
        interestOnlyMonths: interestOnlyMonthsValue,
        businessValue,
        realEstateValue,
        isOwnerOccupied,
        maxLtvPercent,
      }),
    [
      targetDscr,
      annualEbitda,
      existingAnnualDebtService,
      isRefinance,
      interestRate,
      termMonths,
      deferredMonthsValue,
      interestOnlyMonthsValue,
      businessValue,
      realEstateValue,
      isOwnerOccupied,
      maxLtvPercent,
    ]
  );

  const reverseLoanAtMax = useMemo(() => {
    if (reverseResult.maxLoanAmount <= 0) return null;
    return calcMultiPhaseLoan({
      principal: reverseResult.maxLoanAmount,
      annualInterestRate: interestRate,
      termMonths,
      deferredMonths: deferredMonthsValue,
      interestOnlyMonths: interestOnlyMonthsValue,
    });
  }, [
    reverseResult.maxLoanAmount,
    interestRate,
    termMonths,
    deferredMonthsValue,
    interestOnlyMonthsValue,
  ]);

  const reverseTotalAnnualDebtService = useMemo(() => {
    if (!reverseLoanAtMax) return isRefinance ? 0 : existingAnnualDebtService;
    const base = isRefinance ? 0 : existingAnnualDebtService;
    return base + reverseLoanAtMax.annualDebtService;
  }, [reverseLoanAtMax, isRefinance, existingAnnualDebtService]);

  const reverseAchievedDscr = useMemo(
    () => computeStoreDscr(annualEbitda, reverseTotalAnnualDebtService),
    [annualEbitda, reverseTotalAnnualDebtService]
  );

  const showMonth1Note =
    loanResult.month1Payment !== loanResult.maxMonthlyPayment;
  const primaryPayment = loanResult.maxMonthlyPayment;

  const dscrDebtNote =
    !isRefinance && existingAnnualDebtService > 0
      ? " · includes existing debt"
      : isRefinance
        ? " · refinance (excludes existing)"
        : "";

  const reverseBindingMessage = getReverseBindingMessage(reverseResult);
  const zeroRateMessage = getZeroRateUnboundedMessage(reverseResult);
  const dscrExceededMessage = getDscrExceededMessage(reverseResult, isRefinance);

  const handleLoadSaved = useCallback((inputs: SavedLoanCalculationInputs) => {
    setCalcMode(inputs.calcMode);
    setLoanAmount(inputs.loanAmount);
    setTargetDscr(inputs.targetDscr);
    setMaxLtvPercent(inputs.maxLtvPercent);
    setInterestRate(inputs.interestRate);
    setTermMonths(inputs.termMonths);
    setInterestOnlyEnabled(inputs.interestOnlyEnabled);
    setInterestOnlyMonths(inputs.interestOnlyMonths);
    setDeferredEnabled(inputs.deferredEnabled);
    setDeferredMonths(inputs.deferredMonths);
    setIsRefinance(inputs.isRefinance);
  }, []);

  const buildSnapshot = useCallback(() => {
    const inputs = buildSavedLoanInputs({
      calcMode,
      loanAmount,
      targetDscr,
      maxLtvPercent,
      interestRate,
      termMonths,
      interestOnlyEnabled,
      interestOnlyMonths,
      deferredEnabled,
      deferredMonths,
      isRefinance,
    });

    if (calcMode === "forward") {
      return {
        inputs,
        outputs: buildSavedLoanForwardOutputs({
          monthlyPayment: primaryPayment,
          dscr,
          businessLtv,
          annualDebtService: loanResult.annualDebtService,
          totalAnnualDebtService,
        }),
      };
    }

    return {
      inputs,
      outputs: buildSavedLoanReverseOutputs({
        maxLoanAmount: reverseResult.maxLoanAmount,
        dscrBasedMaxLoan: reverseResult.dscrBasedMaxLoan,
        ltvBasedMaxLoan: reverseResult.ltvBasedMaxLoan,
        bindingConstraint: reverseResult.bindingConstraint,
        maxLtvPercent: reverseResult.maxLtvPercent,
        resultingDscr: reverseAchievedDscr,
      }),
    };
  }, [
    calcMode,
    loanAmount,
    targetDscr,
    maxLtvPercent,
    interestRate,
    termMonths,
    interestOnlyEnabled,
    interestOnlyMonths,
    deferredEnabled,
    deferredMonths,
    isRefinance,
    primaryPayment,
    dscr,
    businessLtv,
    loanResult.annualDebtService,
    totalAnnualDebtService,
    reverseResult.maxLoanAmount,
    reverseResult.dscrBasedMaxLoan,
    reverseResult.ltvBasedMaxLoan,
    reverseResult.bindingConstraint,
    reverseResult.maxLtvPercent,
    reverseAchievedDscr,
  ]);

  const clipWidgetChrome = isWidget && displayMode !== "panel";

  return (
    <div
      className={clsx(
        isWidget && "loan-calculator-widget rounded-[var(--card-radius)]",
        clipWidgetChrome && "overflow-hidden",
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

      <div
        className={clsx(
          isWidget ? "p-4 space-y-4" : "space-y-5",
          displayMode === "panel" && "pb-5"
        )}
      >
        {!isWidget && (
          <div>
            <h2 className="section-title mb-1">Loan Calculator</h2>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Model a new loan against your store&apos;s real financials
            </p>
          </div>
        )}

        <CalcModeToggle
          mode={calcMode}
          onChange={setCalcMode}
          compact={isWidget}
        />

        {calcMode === "forward" ? (
          <>
            {/* Live results hero — forward */}
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
              <RealEstateNote
                realEstateValue={realEstateValue}
                footnote="Shown separately — business LTV uses business value only"
              />
            )}

            {/* Inputs — forward */}
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

              <LoanStructureToggles
                compact={isWidget}
                termMonths={termMonths}
                interestOnlyEnabled={interestOnlyEnabled}
                onInterestOnlyEnabledChange={setInterestOnlyEnabled}
                interestOnlyMonths={interestOnlyMonths}
                onInterestOnlyMonthsChange={setInterestOnlyMonths}
                deferredEnabled={deferredEnabled}
                onDeferredEnabledChange={setDeferredEnabled}
                deferredMonths={deferredMonths}
                onDeferredMonthsChange={setDeferredMonths}
                isRefinance={isRefinance}
                onIsRefinanceChange={setIsRefinance}
              />
            </div>

            {/* Breakdown — forward */}
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
          </>
        ) : (
          <>
            {/* Live results hero — reverse */}
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
                  Max Loan Amount
                </div>
                <AnimatedNumber
                  value={reverseResult.maxLoanAmount}
                  prefix="$"
                  className={clsx(
                    "font-bold tabular-nums tracking-tight",
                    isWidget ? "text-[28px]" : "text-[32px] sm:text-[36px]"
                  )}
                  style={{
                    color: reverseResult.maxLoanAmount > 0 ? "#fff" : "rgba(255,255,255,0.45)",
                    letterSpacing: "-0.02em",
                  }}
                  duration={600}
                />

                {reverseBindingMessage && (
                  <p
                    className="text-[11px] mt-2.5 leading-snug font-medium"
                    style={{ color: "#93c5fd" }}
                  >
                    {reverseBindingMessage}
                  </p>
                )}

                {reverseLoanAtMax && reverseLoanAtMax.phases.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {reverseLoanAtMax.phases.map((phase, i) => (
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
                  label="DSCR Cap"
                  isBinding={reverseResult.bindingConstraint === "dscr"}
                  value={
                    hasFinancialData ? (
                      <AnimatedNumber
                        value={reverseResult.dscrBasedMaxLoan}
                        prefix="$"
                        duration={600}
                        style={{
                          color:
                            reverseResult.bindingConstraint === "dscr"
                              ? "#fff"
                              : "rgba(255,255,255,0.65)",
                        }}
                      />
                    ) : (
                      "—"
                    )
                  }
                  sub={
                    hasFinancialData
                      ? `At ${targetDscr.toFixed(2)}x target DSCR${dscrDebtNote}`
                      : "Add monthly financials"
                  }
                />
                <ResultCell
                  compact={isWidget}
                  label={`LTV Cap (${reverseResult.maxLtvPercent}%)`}
                  isBinding={reverseResult.bindingConstraint === "ltv"}
                  value={
                    reverseResult.collateralValue > 0 ? (
                      <AnimatedNumber
                        value={reverseResult.ltvBasedMaxLoan}
                        prefix="$"
                        duration={600}
                        style={{
                          color:
                            reverseResult.bindingConstraint === "ltv"
                              ? "#fff"
                              : "rgba(255,255,255,0.65)",
                        }}
                      />
                    ) : (
                      "—"
                    )
                  }
                  sub={
                    reverseResult.collateralValue > 0
                      ? `${fmtDollar(reverseResult.collateralValue)} collateral${isOwnerOccupied && realEstateValue > 0 ? " (incl. RE)" : ""}`
                      : "Add financials for valuation"
                  }
                />
              </div>
            </div>

            {(dscrExceededMessage || zeroRateMessage) && (
              <div className="space-y-2">
                {dscrExceededMessage && (
                  <ReverseNotice tone="warning">{dscrExceededMessage}</ReverseNotice>
                )}
                {zeroRateMessage && (
                  <ReverseNotice tone="info">{zeroRateMessage}</ReverseNotice>
                )}
              </div>
            )}

            {isOwnerOccupied && realEstateValue > 0 && (
              <RealEstateNote
                realEstateValue={realEstateValue}
                footnote={`Included in LTV cap at ${maxLtvPercent}% — business LTV in forward mode uses business value only`}
              />
            )}

            {/* Inputs — reverse */}
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
                  label="Target DSCR"
                  value={targetDscr}
                  onChange={setTargetDscr}
                  min={0.5}
                  max={3}
                  step={0.05}
                  decimals={2}
                  suffix="x"
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
                <TouchNumericInput
                  label="Max LTV"
                  value={maxLtvPercent}
                  onChange={setMaxLtvPercent}
                  min={50}
                  max={95}
                  step={1}
                  decimals={0}
                  suffix="%"
                  size={isWidget ? "compact" : "default"}
                />
              </div>

              <LoanStructureToggles
                compact={isWidget}
                termMonths={termMonths}
                interestOnlyEnabled={interestOnlyEnabled}
                onInterestOnlyEnabledChange={setInterestOnlyEnabled}
                interestOnlyMonths={interestOnlyMonths}
                onInterestOnlyMonthsChange={setInterestOnlyMonths}
                deferredEnabled={deferredEnabled}
                onDeferredEnabledChange={setDeferredEnabled}
                deferredMonths={deferredMonths}
                onDeferredMonthsChange={setDeferredMonths}
                isRefinance={isRefinance}
                onIsRefinanceChange={setIsRefinance}
              />
            </div>

            {/* Breakdown — reverse */}
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
                Capacity Breakdown
              </div>
              <BreakdownRow
                label="Target DSCR"
                value={`${targetDscr.toFixed(2)}x`}
              />
              {hasFinancialData && (
                <>
                  <BreakdownRow
                    label="TTM EBITDA"
                    value={fmtDollar(annualEbitda)}
                  />
                  <BreakdownRow
                    label="Payment budget (monthly)"
                    value={
                      reverseResult.targetMaxMonthlyPayment > 0
                        ? fmtDollar(reverseResult.targetMaxMonthlyPayment)
                        : "—"
                    }
                  />
                </>
              )}
              {!isRefinance && existingAnnualDebtService > 0 && (
                <BreakdownRow
                  label="Existing loans (annual)"
                  value={fmtDollar(existingAnnualDebtService)}
                />
              )}
              {reverseLoanAtMax && (
                <BreakdownRow
                  label="Est. payment at max (monthly)"
                  value={fmtDollar(reverseLoanAtMax.maxMonthlyPayment)}
                />
              )}
              {reverseAchievedDscr != null && reverseResult.maxLoanAmount > 0 && (
                <BreakdownRow
                  label="Resulting DSCR at max"
                  value={`${reverseAchievedDscr.toFixed(2)}x`}
                  bold
                />
              )}
            </div>
          </>
        )}

        {storeId && (
          <SavedLoanCalculationsSection
            storeId={storeId}
            onLoad={handleLoadSaved}
            buildSnapshot={buildSnapshot}
            compact={isWidget}
          />
        )}

        <Disclaimer variant="loan-calculator" />
      </div>
    </div>
  );
}

function CalcModeToggle({
  mode,
  onChange,
  compact,
}: {
  mode: CalcMode;
  onChange: (mode: CalcMode) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="flex gap-2">
        {(
          [
            ["forward", "Forward", "Loan amount → DSCR"],
            ["reverse", "Reverse", "Target DSCR → max loan"],
          ] as const
        ).map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={clsx(
              "flex-1 rounded-lg font-medium transition-colors",
              compact ? "px-2.5 py-2 text-[11px]" : "px-3 py-2.5 text-[12px]",
              mode === id
                ? "bg-blue-500/20 text-adaptive-info border border-blue-500/30"
                : "text-adaptive-muted border border-[var(--border)] hover:text-adaptive-secondary"
            )}
          >
            <span className="block">{label}</span>
            <span
              className={clsx(
                "block mt-0.5 font-normal leading-tight",
                compact ? "text-[9px]" : "text-[10px]",
                mode === id ? "text-adaptive-info/80" : "text-adaptive-muted"
              )}
            >
              {hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LoanStructureToggles({
  compact,
  termMonths,
  interestOnlyEnabled,
  onInterestOnlyEnabledChange,
  interestOnlyMonths,
  onInterestOnlyMonthsChange,
  deferredEnabled,
  onDeferredEnabledChange,
  deferredMonths,
  onDeferredMonthsChange,
  isRefinance,
  onIsRefinanceChange,
}: {
  compact?: boolean;
  termMonths: number;
  interestOnlyEnabled: boolean;
  onInterestOnlyEnabledChange: (v: boolean) => void;
  interestOnlyMonths: number;
  onInterestOnlyMonthsChange: (v: number) => void;
  deferredEnabled: boolean;
  onDeferredEnabledChange: (v: boolean) => void;
  deferredMonths: number;
  onDeferredMonthsChange: (v: number) => void;
  isRefinance: boolean;
  onIsRefinanceChange: (v: boolean) => void;
}) {
  return (
    <div
      className="space-y-3 pt-3 border-t"
      style={{ borderColor: "var(--border)" }}
    >
      <ToggleRow
        compact={compact}
        label="Interest-only period"
        description="Pay interest only, no principal reduction"
        checked={interestOnlyEnabled}
        onChange={onInterestOnlyEnabledChange}
      />
      {interestOnlyEnabled && (
        <TouchNumericInput
          label="Interest-Only Duration"
          value={interestOnlyMonths}
          onChange={onInterestOnlyMonthsChange}
          min={1}
          max={termMonths}
          step={1}
          format={(v) => `${v} months`}
          parse={(raw) => {
            const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
            return Number.isNaN(n) ? null : n;
          }}
          size={compact ? "compact" : "default"}
        />
      )}

      <ToggleRow
        compact={compact}
        label="Deferred payment period"
        description="No payment; interest accrues and capitalizes"
        checked={deferredEnabled}
        onChange={onDeferredEnabledChange}
      />
      {deferredEnabled && (
        <TouchNumericInput
          label="Deferred Duration"
          value={deferredMonths}
          onChange={onDeferredMonthsChange}
          min={1}
          max={termMonths}
          step={1}
          format={(v) => `${v} months`}
          parse={(raw) => {
            const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
            return Number.isNaN(n) ? null : n;
          }}
          size={compact ? "compact" : "default"}
        />
      )}

      <ToggleRow
        compact={compact}
        label="This replaces my current loan (refinance)"
        description="Exclude existing debt service from DSCR"
        checked={isRefinance}
        onChange={onIsRefinanceChange}
      />
    </div>
  );
}

function RealEstateNote({
  realEstateValue,
  footnote,
}: {
  realEstateValue: number;
  footnote: string;
}) {
  return (
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
        {footnote}
      </p>
    </div>
  );
}

function ReverseNotice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "warning" | "info";
}) {
  const styles =
    tone === "warning"
      ? {
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.25)",
          color: "#fbbf24",
        }
      : {
          background: "rgba(56,189,248,0.1)",
          border: "1px solid rgba(56,189,248,0.25)",
          color: "#38bdf8",
        };

  return (
    <div className="rounded-lg px-3.5 py-3 text-[12px] leading-snug" style={styles}>
      {children}
    </div>
  );
}

function getReverseBindingMessage(result: ReverseSolveLoanResult): string | null {
  const { bindingConstraint, dscrBasedMaxLoan, ltvBasedMaxLoan, maxLoanAmount } = result;

  if (bindingConstraint === "ltv" && dscrBasedMaxLoan > maxLoanAmount) {
    return `Limited by collateral value — cash flow would support ${fmtDollar(dscrBasedMaxLoan - maxLoanAmount)} more`;
  }
  if (bindingConstraint === "dscr" && ltvBasedMaxLoan > maxLoanAmount) {
    return `Limited by cash flow — collateral would support ${fmtDollar(ltvBasedMaxLoan - maxLoanAmount)} more`;
  }
  if (bindingConstraint === "ltv" && result.dscrAlreadyExceeded) {
    return "Limited by collateral value — existing debt already uses your full DSCR budget";
  }
  if (bindingConstraint === "dscr" && maxLoanAmount > 0) {
    return "Limited by cash flow at your target DSCR";
  }
  if (bindingConstraint === "ltv" && maxLoanAmount > 0) {
    return "Limited by collateral value at max LTV";
  }
  return null;
}

function getDscrExceededMessage(
  result: ReverseSolveLoanResult,
  isRefinance: boolean
): string | null {
  if (!result.dscrAlreadyExceeded) return null;
  if (result.bindingConstraint === "ltv" && result.maxLoanAmount > 0) return null;
  if (isRefinance) {
    return "At this target DSCR, your store's cash flow cannot support additional debt service — no max loan amount is available.";
  }
  return "Your existing debt service already meets or exceeds the payment budget for this target DSCR — no additional borrowing capacity from cash flow.";
}

function getZeroRateUnboundedMessage(result: ReverseSolveLoanResult): string | null {
  if (!result.zeroRateUnbounded) return null;
  if (result.bindingConstraint === "ltv" && result.maxLoanAmount > 0) {
    return "At 0% interest with an interest-only structure, monthly payment alone doesn't cap loan size — the max shown is based on your LTV limit.";
  }
  return "At 0% interest with an interest-only structure, monthly payment alone doesn't limit loan size — add an amortizing period or collateral value to get a meaningful max.";
}

function ResultCell({
  label,
  value,
  sub,
  valueColor,
  compact,
  isBinding,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  valueColor?: string;
  compact?: boolean;
  isBinding?: boolean;
}) {
  return (
    <div
      className={clsx(compact ? "px-3.5 py-3" : "px-5 py-4 sm:px-6")}
      style={{ background: "rgba(15,30,61,0.6)" }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div
          className="text-[10px] uppercase tracking-[0.12em] font-semibold"
          style={{ color: "#93c5fd" }}
        >
          <DisclaimerLabel>{label}</DisclaimerLabel>
        </div>
        {isBinding && (
          <span
            className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{
              background: "rgba(59,130,246,0.25)",
              color: "#93c5fd",
            }}
          >
            Binding
          </span>
        )}
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
