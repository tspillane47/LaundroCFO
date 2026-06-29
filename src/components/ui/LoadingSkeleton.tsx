import clsx from "clsx";

const bone = "rounded animate-pulse bg-gray-200 dark:bg-white/10";

function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className={clsx(bone, "h-3 w-1/3 mb-4")} />
      <div className={clsx(bone, "h-8 w-1/2 mb-2")} />
      <div className={clsx(bone, "h-3 w-2/3")} />
    </div>
  );
}

function CardVariant() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className={clsx(bone, "h-5 w-48")} />
        <div className={clsx(bone, "h-3 w-72")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="card animate-pulse space-y-4">
        <div className={clsx(bone, "h-4 w-1/4")} />
        <div className={clsx(bone, "h-32 w-full")} />
        <div className="grid grid-cols-2 gap-4">
          <div className={clsx(bone, "h-20 w-full")} />
          <div className={clsx(bone, "h-20 w-full")} />
        </div>
      </div>
    </div>
  );
}

function TableVariant() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className={clsx(bone, "h-5 w-40")} />
        <div className={clsx(bone, "h-3 w-64")} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="card animate-pulse">
        <div className={clsx(bone, "h-4 w-32 mb-4")} />
        <div className={clsx(bone, "h-8 w-full mb-3")} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={clsx(bone, "h-10 w-full mb-2")} />
        ))}
      </div>
    </div>
  );
}

function MetricVariant() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className={clsx(bone, "h-5 w-56")} />
        <div className={clsx(bone, "h-3 w-80")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="card animate-pulse space-y-3">
        <div className={clsx(bone, "h-4 w-36")} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className={clsx(bone, "h-3 flex-1")} />
            <div className={clsx(bone, "h-3 w-16")} />
            <div className={clsx(bone, "h-3 w-16")} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PageVariant() {
  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className={clsx(bone, "h-5 w-52")} />
          <div className={clsx(bone, "h-3 w-72")} />
        </div>
        <div className="flex gap-2">
          <div className={clsx(bone, "h-9 w-24")} />
          <div className={clsx(bone, "h-9 w-24")} />
        </div>
      </div>
      <div className={clsx(bone, "h-36 w-full rounded-xl")} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="card animate-pulse space-y-4">
        <div className={clsx(bone, "h-4 w-40")} />
        <div className={clsx(bone, "h-8 w-full")} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={clsx(bone, "h-12 w-full")} />
        ))}
      </div>
      <div className="card animate-pulse space-y-3">
        <div className={clsx(bone, "h-4 w-48")} />
        <div className={clsx(bone, "h-48 w-full")} />
      </div>
    </div>
  );
}

function TextRowsVariant({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className={clsx(bone, "h-4 w-3/4 mb-2")} />
          <div className={clsx(bone, "h-4 w-1/2")} />
        </div>
      ))}
    </div>
  );
}

type LoadingSkeletonProps = {
  variant?: "card" | "table" | "metric" | "page";
  rows?: number;
};

export function LoadingSkeleton({ variant, rows = 3 }: LoadingSkeletonProps) {
  if (variant) {
    switch (variant) {
      case "card":
        return <CardVariant />;
      case "table":
        return <TableVariant />;
      case "metric":
        return <MetricVariant />;
      case "page":
        return <PageVariant />;
    }
  }

  return <TextRowsVariant rows={rows} />;
}

/** @deprecated Use LoadingSkeleton with variant="card" instead */
export function CardSkeleton() {
  return <SkeletonCard />;
}
