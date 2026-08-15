import { createClient } from "@/lib/supabase";
import {
  buildPlaidBalanceSnapshot,
  buildPortfolioPlaidBalanceSnapshot,
  groupPlaidBalanceSnapshotsByStore,
  sumPlaidCashOnHand,
  sumPlaidCreditCardDebt,
  type PlaidAccountBalanceRow,
  type PlaidAccountBalanceRowWithStore,
  type PlaidBalanceSnapshot,
  type PortfolioPlaidBalanceSnapshot,
} from "@/lib/plaid-shared";

export type { PlaidBalanceSnapshot, PortfolioPlaidBalanceSnapshot };

export type PortfolioPlaidBalanceData = {
  hasAnyPlaidConnections: boolean;
  portfolioSnapshot: PortfolioPlaidBalanceSnapshot | null;
  snapshotsByStoreId: Record<string, PlaidBalanceSnapshot>;
  connectedStoreIds: string[];
};

const EMPTY_PORTFOLIO_PLAID_BALANCE_DATA: PortfolioPlaidBalanceData = {
  hasAnyPlaidConnections: false,
  portfolioSnapshot: null,
  snapshotsByStoreId: {},
  connectedStoreIds: [],
};

async function fetchStorePlaidAccountRows(storeId: string): Promise<PlaidAccountBalanceRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plaid_accounts")
    .select("account_type, current_balance, last_synced_at")
    .eq("store_id", storeId);

  if (error) {
    throw new Error(`Failed to load Plaid accounts: ${error.message}`);
  }

  return (data ?? []) as PlaidAccountBalanceRow[];
}

export async function getStorePlaidCashOnHand(storeId: string): Promise<number> {
  const accounts = await fetchStorePlaidAccountRows(storeId);
  return sumPlaidCashOnHand(accounts);
}

export async function getStorePlaidCreditCardDebt(storeId: string): Promise<number> {
  const accounts = await fetchStorePlaidAccountRows(storeId);
  return sumPlaidCreditCardDebt(accounts);
}

export async function getStorePlaidBalanceSnapshot(storeId: string): Promise<PlaidBalanceSnapshot> {
  const accounts = await fetchStorePlaidAccountRows(storeId);
  return buildPlaidBalanceSnapshot(accounts);
}

export async function storeHasPlaidConnections(storeId: string): Promise<boolean> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("plaid_connections")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);

  if (error) {
    throw new Error(`Failed to load Plaid connections: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function loadPortfolioPlaidBalanceData(
  storeIds: string[]
): Promise<PortfolioPlaidBalanceData> {
  if (storeIds.length === 0) {
    return EMPTY_PORTFOLIO_PLAID_BALANCE_DATA;
  }

  const supabase = createClient();
  const [{ data: connections, error: connectionsError }, { data: accounts, error: accountsError }] =
    await Promise.all([
      supabase.from("plaid_connections").select("store_id").in("store_id", storeIds),
      supabase
        .from("plaid_accounts")
        .select("store_id, account_type, current_balance, last_synced_at")
        .in("store_id", storeIds),
    ]);

  if (connectionsError) {
    throw new Error(`Failed to load Plaid connections: ${connectionsError.message}`);
  }
  if (accountsError) {
    throw new Error(`Failed to load Plaid accounts: ${accountsError.message}`);
  }

  const connectedStoreIds = Array.from(
    new Set((connections ?? []).map((connection) => String(connection.store_id)))
  );

  if (connectedStoreIds.length === 0) {
    return EMPTY_PORTFOLIO_PLAID_BALANCE_DATA;
  }

  const accountRows = (accounts ?? []) as PlaidAccountBalanceRowWithStore[];
  const snapshotsByStoreId = groupPlaidBalanceSnapshotsByStore(accountRows);

  for (const storeId of connectedStoreIds) {
    if (!snapshotsByStoreId[storeId]) {
      snapshotsByStoreId[storeId] = buildPlaidBalanceSnapshot([]);
    }
  }

  return {
    hasAnyPlaidConnections: true,
    portfolioSnapshot: buildPortfolioPlaidBalanceSnapshot(accountRows, connectedStoreIds.length),
    snapshotsByStoreId,
    connectedStoreIds,
  };
}
