import { sumPortfolioCash } from "@/lib/portfolioMetrics";
import type { PlaidBalanceSnapshot } from "@/lib/plaid-shared";

export type CashPositionSource = "plaid" | "manual";

export type CashPositionComposition = "all_live" | "all_manual" | "mixed";

export type StoreCashPosition = {
  amount: number;
  source: CashPositionSource;
};

export type PortfolioCashPositionSummary = {
  total: number;
  liveStoreCount: number;
  manualStoreCount: number;
  storeCount: number;
  composition: CashPositionComposition;
  byStoreId: Record<string, StoreCashPosition>;
};

export type StoreManualCashFields = {
  operating_account_balance?: number | null;
  reserve_account_balance?: number | null;
  petty_cash?: number | null;
};

/** Manual cash: operating + reserve + petty. */
export function sumStoreManualCash(store: StoreManualCashFields): number {
  return (
    (store.operating_account_balance ?? 0) +
    (store.reserve_account_balance ?? 0) +
    (store.petty_cash ?? 0)
  );
}

/**
 * A store is live-synced when it has a Plaid connection and at least one synced
 * depository account row. Credit-only syncs do not qualify — manual cash is used instead.
 */
export function isStorePlaidLiveSynced(
  hasPlaidConnection: boolean,
  plaidSnapshot: PlaidBalanceSnapshot | undefined
): boolean {
  return hasPlaidConnection && (plaidSnapshot?.depositoryAccountCount ?? 0) > 0;
}

/** Per-store cash figure: Plaid depository total when live-synced, else manual entry. */
export function computeStoreCashPosition(
  store: StoreManualCashFields,
  hasPlaidConnection: boolean,
  plaidSnapshot?: PlaidBalanceSnapshot
): StoreCashPosition {
  if (isStorePlaidLiveSynced(hasPlaidConnection, plaidSnapshot)) {
    return { amount: plaidSnapshot!.cashOnHand, source: "plaid" };
  }
  return { amount: sumStoreManualCash(store), source: "manual" };
}

export function deriveCashPositionComposition(
  liveStoreCount: number,
  storeCount: number
): CashPositionComposition {
  if (storeCount === 0 || liveStoreCount === 0) return "all_manual";
  if (liveStoreCount === storeCount) return "all_live";
  return "mixed";
}

/** Portfolio-wide cash position — never double-counts Plaid and manual for the same store. */
export function computePortfolioCashPosition(
  stores: Array<StoreManualCashFields & { id: string }>,
  connectedStoreIds: string[],
  snapshotsByStoreId: Record<string, PlaidBalanceSnapshot>
): PortfolioCashPositionSummary {
  const connectedSet = new Set(connectedStoreIds);
  const byStoreId: Record<string, StoreCashPosition> = {};
  let total = 0;
  let liveStoreCount = 0;
  let manualStoreCount = 0;

  for (const store of stores) {
    const position = computeStoreCashPosition(
      store,
      connectedSet.has(store.id),
      snapshotsByStoreId[store.id]
    );
    byStoreId[store.id] = position;
    total += position.amount;
    if (position.source === "plaid") {
      liveStoreCount += 1;
    } else {
      manualStoreCount += 1;
    }
  }

  return {
    total,
    liveStoreCount,
    manualStoreCount,
    storeCount: stores.length,
    composition: deriveCashPositionComposition(liveStoreCount, stores.length),
    byStoreId,
  };
}

/** Convenience when Plaid data is unavailable — all stores use manual cash. */
export function computeManualOnlyPortfolioCash(
  stores: Array<StoreManualCashFields & { id: string }>
): PortfolioCashPositionSummary {
  return computePortfolioCashPosition(stores, [], {});
}

export { sumPortfolioCash };
