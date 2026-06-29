import type { ReactNode } from "react";
import { SCORECARD_COLORS, type ScorecardVerdict } from "@/lib/scorecard";

type MetricScorecardProps = {
  label: ReactNode;
  value: string;
  verdict: ScorecardVerdict;
};

export function MetricScorecard({ label, value, verdict }: MetricScorecardProps) {
  const accent = SCORECARD_COLORS[verdict];

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#374151]">{label}</div>
      <div className="mt-1 mb-2 text-[28px] font-bold tabular-nums text-[#0f172a]">{value}</div>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span className="text-[12px] font-medium text-[#0f172a]">{verdict}</span>
      </div>
    </div>
  );
}
