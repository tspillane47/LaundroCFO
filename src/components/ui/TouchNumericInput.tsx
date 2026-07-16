"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Minus, Plus } from "lucide-react";

type TouchNumericInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  format?: (value: number) => string;
  parse?: (raw: string) => number | null;
  decimals?: number;
  className?: string;
  size?: "default" | "compact";
};

function defaultFormat(value: number, decimals: number, prefix?: string, suffix?: string): string {
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${prefix ?? ""}${formatted}${suffix ?? ""}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number, decimals: number): number {
  if (step <= 0) return value;
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(decimals));
}

export function TouchNumericInput({
  label,
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  prefix,
  suffix,
  format,
  parse,
  decimals = 0,
  className,
  size = "default",
}: TouchNumericInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = format
    ? format(value)
    : defaultFormat(value, decimals, prefix, suffix);

  const applyValue = useCallback(
    (next: number) => {
      const clamped = clamp(roundToStep(next, step, decimals), min, max);
      onChange(clamped);
    },
    [decimals, max, min, onChange, step]
  );

  const startEditing = () => {
    setDraft(String(value));
    setEditing(true);
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitDraft = () => {
    const parsed = parse ? parse(draft) : parseFloat(draft.replace(/,/g, ""));
    if (parsed != null && !Number.isNaN(parsed)) {
      applyValue(parsed);
    }
    setEditing(false);
  };

  const decrement = () => applyValue(value - step);
  const increment = () => applyValue(value + step);

  const controlSize = size === "compact" ? "min-w-[44px] min-h-[44px]" : "min-w-[52px] min-h-[52px]";
  const valueSize = size === "compact" ? "text-[16px] sm:text-[17px]" : "text-[18px] sm:text-[20px]";
  const iconSize = size === "compact" ? 17 : 19;

  return (
    <div className={className}>
      <div className="metric-label mb-2">{label}</div>
      <div
        className={clsx(
          "flex items-stretch rounded-xl overflow-hidden transition-shadow",
          editing && "ring-2 ring-[var(--input-focus-border)] ring-offset-1 ring-offset-[var(--bg-card2)]"
        )}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border2)",
          boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.12)",
        }}
      >
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className={clsx(
            "flex items-center justify-center transition-colors touch-manipulation",
            "hover:bg-[var(--bg-input)] active:bg-[var(--border)] active:scale-[0.97]",
            "disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100",
            controlSize
          )}
          style={{
            color: "var(--text-secondary)",
            borderRight: "1px solid var(--border)",
          }}
        >
          <Minus size={iconSize} strokeWidth={2.5} />
        </button>

        <div
          className="flex-1 flex items-center justify-center px-2"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)",
          }}
        >
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitDraft();
                if (e.key === "Escape") setEditing(false);
              }}
              className={clsx(
                "w-full text-center font-bold tabular-nums bg-transparent outline-none min-h-[44px]",
                valueSize
              )}
              style={{ color: "var(--text-primary)" }}
            />
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className={clsx(
                "w-full text-center font-bold tabular-nums min-h-[44px] touch-manipulation",
                "transition-all hover:text-[var(--accent-blue)] active:scale-[0.98]",
                "rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--input-focus-border)]",
                valueSize
              )}
              style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
            >
              {displayValue}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={increment}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className={clsx(
            "flex items-center justify-center transition-colors touch-manipulation",
            "hover:bg-[var(--bg-input)] active:bg-[var(--border)] active:scale-[0.97]",
            "disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100",
            controlSize
          )}
          style={{
            color: "var(--text-secondary)",
            borderLeft: "1px solid var(--border)",
          }}
        >
          <Plus size={iconSize} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
