import type { KeyboardEvent } from "react";

export const INPUT_CLASS =
  "w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500";

export function preventEnterSubmit(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
  }
}

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.split("T")[0] + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | null): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatPct(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(1) + "%";
}

export function formatBool(value: boolean | null): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

export function LabelValue({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 text-[13px] border-b border-white/[0.04] last:border-b-0">
      <span className="text-slate-400">{label}</span>
      {badge ? (
        <span className={`badge ${badge}`}>{value}</span>
      ) : (
        <span className="font-semibold text-slate-100 text-right max-w-[60%]">{value}</span>
      )}
    </div>
  );
}

export function YesNoToggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <div>
      <div className="metric-label mb-1.5">{label}</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={
            value
              ? "flex-1 py-2 rounded-lg text-[13px] font-semibold bg-blue-600/20 border border-blue-500/40 text-blue-300"
              : "flex-1 py-2 rounded-lg text-[13px] font-medium bg-[#1e2a3a] border border-white/10 text-slate-400 hover:border-white/20"
          }
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={
            !value
              ? "flex-1 py-2 rounded-lg text-[13px] font-semibold bg-blue-600/20 border border-blue-500/40 text-blue-300"
              : "flex-1 py-2 rounded-lg text-[13px] font-medium bg-[#1e2a3a] border border-white/10 text-slate-400 hover:border-white/20"
          }
        >
          No
        </button>
      </div>
    </div>
  );
}
