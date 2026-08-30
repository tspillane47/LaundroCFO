import { PLAID_CONNECT_TRUST } from "@/lib/plaid-shared";

export function PlaidConnectTrustPanel({
  busy,
  onCancel,
  onContinue,
}: {
  busy: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="card border border-[var(--accent-blue)]/30 bg-[var(--bg-info-tint)]">
      <div className="text-[13px] font-semibold text-slate-100 mb-1">{PLAID_CONNECT_TRUST.title}</div>
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{PLAID_CONNECT_TRUST.intro}</p>
      <ul className="mt-3 space-y-1.5 text-[12px] text-[var(--text-secondary)] leading-relaxed">
        {PLAID_CONNECT_TRUST.points.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="text-[var(--text-info)] mt-px" aria-hidden>
              •
            </span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
        <button
          type="button"
          className="btn-outline text-[12px]"
          onClick={onCancel}
          disabled={busy}
        >
          {PLAID_CONNECT_TRUST.cancelLabel}
        </button>
        <button
          type="button"
          className="btn-primary text-[12px]"
          onClick={onContinue}
          disabled={busy}
        >
          {busy ? "Connecting…" : PLAID_CONNECT_TRUST.continueLabel}
        </button>
      </div>
    </div>
  );
}
