"use client";

export function PageError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "40px" }}>
      <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
        Unable to load data
      </div>
      <button
        type="button"
        className="btn-outline"
        onClick={() => (onRetry ? onRetry() : window.location.reload())}
      >
        Retry
      </button>
    </div>
  );
}
