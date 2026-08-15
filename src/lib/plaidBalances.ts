import { createClient } from "@/lib/supabase";
import {
  buildPlaidBalanceSnapshot,
  sumPlaidCashOnHand,
  sumPlaidCreditCardDebt,
  type PlaidAccountBalanceRow,
  type PlaidBalanceSnapshot,
} from "@/lib/plaid-shared";

export type { PlaidBalanceSnapshot };

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
