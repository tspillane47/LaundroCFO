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

  return (
    <div className={className}>
      <div className="metric-label mb-2">{label}</div>
      <div
        className="flex items-stretch rounded-xl overflow-hidden"
        style={{
          background: "var(--bg-card2)",
          border: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className={clsx(
            "flex items-center justify-center min-w-[48px] min-h-[48px] transition-colors",
            "hover:bg-[var(--bg-input)] active:bg-[var(--border)]",
            "disabled:opacity-30 disabled:cursor-not-allowed"
          )}
          style={{ color: "var(--text-secondary)" }}
        >
          <Minus size={18} strokeWidth={2.5} />
        </button>

        <div className="flex-1 flex items-center justify-center min-h-[48px] px-2">
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
              className="w-full text-center text-[18px] font-semibold tabular-nums bg-transparent outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="w-full text-center text-[18px] font-semibold tabular-nums min-h-[44px] transition-opacity hover:opacity-80"
              style={{ color: "var(--text-primary)" }}
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
            "flex items-center justify-center min-w-[48px] min-h-[48px] transition-colors",
            "hover:bg-[var(--bg-input)] active:bg-[var(--border)]",
            "disabled:opacity-30 disabled:cursor-not-allowed"
          )}
          style={{ color: "var(--text-secondary)" }}
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
