"use client";

import { MANUAL_CASH_SUBTEXT } from "@/components/ui/BankBalancesPanel";
import type { CashPositionComposition } from "@/lib/cashPosition";

export function LiveFromBankBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: "rgba(56, 189, 248, 0.18)",
        color: "#38bdf8",
        border: "1px solid rgba(56, 189, 248, 0.35)",
      }}
    >
      Live from Bank
    </span>
  );
}

function PartiallyLiveBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: "rgba(251, 191, 36, 0.15)",
        color: "#fbbf24",
        border: "1px solid rgba(251, 191, 36, 0.35)",
      }}
    >
      Partially live
    </span>
  );
}

export function formatCashPositionSubtext(
  composition: CashPositionComposition,
  liveStoreCount: number,
  storeCount: number
): string | null {
  switch (composition) {
    case "all_live":
      return null;
    case "all_manual":
      return MANUAL_CASH_SUBTEXT;
    case "mixed":
      return `${liveStoreCount} of ${storeCount} store${storeCount === 1 ? "" : "s"} live-synced`;
  }
}

type CashPositionIndicatorProps = {
  composition: CashPositionComposition;
  liveStoreCount?: number;
  storeCount?: number;
  variant?: "badge" | "subtext" | "both";
  className?: string;
};

/** Badge and/or subtext reflecting whether cash is live-synced, mixed, or manual-only. */
export function CashPositionIndicator({
  composition,
  liveStoreCount = 0,
  storeCount = 0,
  variant = "both",
  className,
}: CashPositionIndicatorProps) {
  const subtext = formatCashPositionSubtext(composition, liveStoreCount, storeCount);
  const showBadge = variant === "badge" || variant === "both";
  const showSubtext = variant === "subtext" || variant === "both";

  if (composition === "all_manual") {
    if (!showSubtext || !subtext) return null;
    return (
      <div className={className} style={{ fontSize: "10px", color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>
        {subtext}
      </div>
    );
  }

  return (
    <div className={className}>
      {showBadge && (
        <div className="flex flex-wrap items-center gap-2">
          {composition === "all_live" ? <LiveFromBankBadge /> : <PartiallyLiveBadge />}
        </div>
      )}
      {showSubtext && composition === "mixed" && subtext && (
        <div
          className={showBadge ? "mt-1" : undefined}
          style={{ fontSize: "10px", color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
}

type StoreCashSourceIndicatorProps = {
  source: "plaid" | "manual";
  className?: string;
};

/** Compact per-store source label for store cards. */
export function StoreCashSourceIndicator({ source, className }: StoreCashSourceIndicatorProps) {
  if (source === "plaid") {
    return (
      <span className={className}>
        <LiveFromBankBadge />
      </span>
    );
  }

  return (
    <span className={className} style={{ fontSize: "10px", color: "var(--text-muted)" }}>
      (entered)
    </span>
  );
}
