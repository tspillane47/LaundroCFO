import clsx from "clsx";
import type { CSSProperties } from "react";

function ShimmerBone({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={clsx("skeleton-shimmer rounded", className)} style={style} />;
}

function MetricCardVariant() {
  return (
    <div className="card">
      <ShimmerBone className="h-3 w-[60%] mb-4" />
      <ShimmerBone className="h-8 w-[40%]" />
    </div>
  );
}

function ChartVariant() {
  const barHeights = [48, 72, 36, 60];
  return (
    <div className="card flex flex-col min-h-[280px]">
      <ShimmerBone className="h-3 w-40 mb-4" />
      <div className="flex-[7] min-h-[140px] mb-4">
        <ShimmerBone className="h-full w-full rounded-lg" />
      </div>
      <div className="flex-[3] flex items-end justify-around gap-3 px-2">
        {barHeights.map((h, i) => (
          <ShimmerBone key={i} className="w-8 rounded-sm" style={{ height: h }} />
        ))}
      </div>
    </div>
  );
}

function TableVariant({ withIcon, rows = 6 }: { withIcon?: boolean; rows?: number }) {
  const headerWidths = ["w-[30%]", "w-[20%]", "w-[25%]", "w-[15%]"];
  const rowWidths = ["w-[28%]", "w-[18%]", "w-[22%]", "w-[12%]"];

  if (withIcon) {
    return (
      <div className="card !p-0 overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              "flex items-center gap-4 px-5 py-4",
              i < rows - 1 && "border-b border-[var(--border)]"
            )}
          >
            <ShimmerBone className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 flex gap-4">
              {rowWidths.map((w, j) => (
                <ShimmerBone key={j} className={clsx("h-3", w)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex gap-4 pb-3 border-b border-[var(--border)]">
        {headerWidths.map((w, i) => (
          <ShimmerBone key={i} className={clsx("h-3", w)} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className={clsx(
            "flex gap-4 py-3.5",
            row < rows - 1 && "border-b border-[var(--border)]"
          )}
        >
          {rowWidths.map((w, i) => (
            <ShimmerBone key={i} className={clsx("h-3", w)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DialVariant() {
  return (
    <div className="card flex flex-col items-center py-6">
      <div className="relative w-36 h-[72px] mb-4">
        <ShimmerBone className="absolute inset-0 rounded-t-full" />
      </div>
      <ShimmerBone className="h-8 w-16 mb-2" />
      <ShimmerBone className="h-3 w-24" />
    </div>
  );
}

function TrackVariant() {
  return (
    <div className="card py-4">
      <ShimmerBone className="h-3 w-32 mb-4" />
      <div className="relative">
        <ShimmerBone className="h-2 w-full rounded-full" />
        <ShimmerBone className="absolute top-1/2 -translate-y-1/2 left-[35%] h-4 w-4 rounded-full" />
      </div>
    </div>
  );
}

function PageVariant() {
  return (
    <div className="space-y-5">
      <ShimmerBone className="h-6 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <MetricCardVariant key={i} />
        ))}
      </div>
      <ChartVariant />
      <TableVariant />
    </div>
  );
}

function SidebarItemVariant() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <ShimmerBone className="h-5 w-5 rounded-full shrink-0" />
      <ShimmerBone className="h-3 w-20" />
    </div>
  );
}

function TextRowsVariant({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <ShimmerBone className="h-4 w-3/4" />
          <ShimmerBone className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export type LoadingSkeletonVariant =
  | "metric-card"
  | "chart"
  | "table"
  | "dial"
  | "track"
  | "page"
  | "sidebar-item"
  | "card"
  | "metric";

type LoadingSkeletonProps = {
  variant?: LoadingSkeletonVariant;
  rows?: number;
  withIcon?: boolean;
};

export function LoadingSkeleton({ variant, rows = 3, withIcon }: LoadingSkeletonProps) {
  if (variant) {
    switch (variant) {
      case "metric-card":
        return <MetricCardVariant />;
      case "chart":
        return <ChartVariant />;
      case "table":
        return <TableVariant withIcon={withIcon} rows={withIcon ? rows : 6} />;
      case "dial":
        return <DialVariant />;
      case "track":
        return <TrackVariant />;
      case "page":
        return <PageVariant />;
      case "sidebar-item":
        return <SidebarItemVariant />;
      case "card":
        return <PageVariant />;
      case "metric":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <MetricCardVariant key={i} />
              ))}
            </div>
            <TableVariant />
          </div>
        );
    }
  }

  return <TextRowsVariant rows={rows} />;
}

/** @deprecated Use LoadingSkeleton with variant="metric-card" instead */
export function CardSkeleton() {
  return <MetricCardVariant />;
}
