"use client";

type ReviewQueueProgressProps = {
  ready: number;
  total: number;
  className?: string;
};

/** Matches the "X of Y" progress pattern from Getting Started setup progress. */
export function ReviewQueueProgress({ ready, total, className }: ReviewQueueProgressProps) {
  const pct = total > 0 ? (ready / total) * 100 : 0;

  return (
    <div className={className}>
      <div
        className="rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
      >
        <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
          Ready to post
        </span>
        <span className="text-[13px] font-semibold text-blue-500">
          {ready} of {total} ready to post
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden mt-2"
        style={{ background: "var(--border)" }}
        aria-hidden
      >
        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
