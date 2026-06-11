export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="h-3 bg-slate-700 rounded w-1/3 mb-4"></div>
      <div className="h-8 bg-slate-700 rounded w-1/2 mb-2"></div>
      <div className="h-3 bg-slate-700 rounded w-2/3"></div>
    </div>
  );
}
