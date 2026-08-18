import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAccessibleStores } from "@/lib/store-access";

const PLAID_CONNECTION_EXPORT_COLUMNS =
  "id, store_id, user_id, institution_name, connected_at, updated_at, has_new_transactions, item_error_code, item_error_message, item_error_at";

const QUICKBOOKS_CONNECTION_EXPORT_COLUMNS =
  "id, store_id, user_id, realm_id, connected_at, updated_at, last_synced_at, last_sync_months_synced, last_sync_skipped_count, last_sync_unmapped_count, error_code, error_message, error_at";

const PLAID_ACCOUNT_EXPORT_COLUMNS =
  "id, store_id, plaid_connection_id, account_name, account_type, account_subtype, mask, current_balance, available_balance, last_synced_at";

const SUBSCRIPTION_EXPORT_COLUMNS =
  "id, user_id, plan, status, trial_ends_at, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, created_at, updated_at";

export type UserDataExport = {
  exportedAt: string;
  userId: string;
  email: string | null;
  profile: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  storeMemberships: Record<string, unknown>[];
  stores: ExportedStoreBundle[];
};

export type ExportedStoreBundle = {
  store: Record<string, unknown>;
  members: Record<string, unknown>[];
  monthlyFinancials: Record<string, unknown>[];
  monthlyUtilities: Record<string, unknown>[];
  equipment: Record<string, unknown>[];
  storeLoans: Record<string, unknown>[];
  leases: Record<string, unknown>[];
  leaseOptions: Record<string, unknown>[];
  insurancePolicies: Record<string, unknown>[];
  realEstate: Record<string, unknown>[];
  categorizationRules: Record<string, unknown>[];
  bankTransactions: Record<string, unknown>[];
  quickbooksConnections: Record<string, unknown>[];
  plaidConnections: Record<string, unknown>[];
  plaidAccounts: Record<string, unknown>[];
};

async function loadStoreExportBundle(
  supabase: SupabaseClient,
  storeId: string
): Promise<Omit<ExportedStoreBundle, "store">> {
  const [
    members,
    monthlyFinancials,
    monthlyUtilities,
    equipment,
    storeLoans,
    leases,
    insurancePolicies,
    realEstate,
    categorizationRules,
    bankTransactions,
    quickbooksConnections,
    plaidConnections,
    plaidAccounts,
  ] = await Promise.all([
    supabase.from("store_members").select("*").eq("store_id", storeId),
    supabase.from("monthly_financials").select("*").eq("store_id", storeId),
    supabase.from("monthly_utilities").select("*").eq("store_id", storeId),
    supabase.from("equipment_inventory").select("*").eq("store_id", storeId),
    supabase.from("store_loans").select("*").eq("store_id", storeId),
    supabase.from("leases").select("*").eq("store_id", storeId),
    supabase.from("insurance_policies").select("*").eq("store_id", storeId),
    supabase.from("real_estate").select("*").eq("store_id", storeId),
    supabase.from("categorization_rules").select("*").eq("store_id", storeId),
    supabase.from("bank_transactions").select("*").eq("store_id", storeId),
    supabase
      .from("quickbooks_connections")
      .select(QUICKBOOKS_CONNECTION_EXPORT_COLUMNS)
      .eq("store_id", storeId),
    supabase.from("plaid_connections").select(PLAID_CONNECTION_EXPORT_COLUMNS).eq("store_id", storeId),
    supabase.from("plaid_accounts").select(PLAID_ACCOUNT_EXPORT_COLUMNS).eq("store_id", storeId),
  ]);

  const queryErrors = [
    members.error,
    monthlyFinancials.error,
    monthlyUtilities.error,
    equipment.error,
    storeLoans.error,
    leases.error,
    insurancePolicies.error,
    realEstate.error,
    categorizationRules.error,
    bankTransactions.error,
    quickbooksConnections.error,
    plaidConnections.error,
    plaidAccounts.error,
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    throw new Error(queryErrors.map((error) => error!.message).join("; "));
  }

  const leaseIds = (leases.data ?? []).map((row) => String(row.id));
  let leaseOptions: Record<string, unknown>[] = [];
  if (leaseIds.length > 0) {
    const { data, error } = await supabase
      .from("lease_options")
      .select("*")
      .in("lease_id", leaseIds);
    if (error) {
      throw new Error(error.message);
    }
    leaseOptions = (data ?? []) as Record<string, unknown>[];
  }

  return {
    members: (members.data ?? []) as Record<string, unknown>[],
    monthlyFinancials: (monthlyFinancials.data ?? []) as Record<string, unknown>[],
    monthlyUtilities: (monthlyUtilities.data ?? []) as Record<string, unknown>[],
    equipment: (equipment.data ?? []) as Record<string, unknown>[],
    storeLoans: (storeLoans.data ?? []) as Record<string, unknown>[],
    leases: (leases.data ?? []) as Record<string, unknown>[],
    leaseOptions,
    insurancePolicies: (insurancePolicies.data ?? []) as Record<string, unknown>[],
    realEstate: (realEstate.data ?? []) as Record<string, unknown>[],
    categorizationRules: (categorizationRules.data ?? []) as Record<string, unknown>[],
    bankTransactions: (bankTransactions.data ?? []) as Record<string, unknown>[],
    quickbooksConnections: (quickbooksConnections.data ?? []) as Record<string, unknown>[],
    plaidConnections: (plaidConnections.data ?? []) as Record<string, unknown>[],
    plaidAccounts: (plaidAccounts.data ?? []) as Record<string, unknown>[],
  };
}

export async function buildUserDataExport(
  supabase: SupabaseClient,
  userId: string,
  email: string | null
): Promise<UserDataExport> {
  const [{ data: profile, error: profileError }, { data: subscription, error: subscriptionError }, storesResult, memberships] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("subscriptions")
        .select(SUBSCRIPTION_EXPORT_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle(),
      fetchAccessibleStores(supabase, { includeArchived: true }),
      supabase.from("store_members").select("*").eq("user_id", userId),
    ]);

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (subscriptionError) {
    throw new Error(subscriptionError.message);
  }
  if (storesResult.error) {
    throw new Error(storesResult.error.message);
  }
  if (memberships.error) {
    throw new Error(memberships.error.message);
  }

  const stores = storesResult.data ?? [];
  const storeBundles = await Promise.all(
    stores.map(async (store) => ({
      store: store as Record<string, unknown>,
      ...(await loadStoreExportBundle(supabase, store.id)),
    }))
  );

  return {
    exportedAt: new Date().toISOString(),
    userId,
    email,
    profile: (profile as Record<string, unknown> | null) ?? null,
    subscription: (subscription as Record<string, unknown> | null) ?? null,
    storeMemberships: (memberships.data ?? []) as Record<string, unknown>[],
    stores: storeBundles,
  };
}
