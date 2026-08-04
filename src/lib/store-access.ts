import type { SupabaseClient } from "@supabase/supabase-js";

type StoreRow = Record<string, unknown> & { id: string; created_at?: string };

function applyArchivedFilter<T>(query: T, includeArchived?: boolean): T {
  if (includeArchived) {
    return query;
  }
  return (query as { or: (filter: string) => T }).or("archived.is.null,archived.eq.false");
}

function sortStoresByCreatedAt(stores: StoreRow[]): StoreRow[] {
  return [...stores].sort((a, b) => {
    const aTime = a.created_at ? new Date(String(a.created_at)).getTime() : 0;
    const bTime = b.created_at ? new Date(String(b.created_at)).getTime() : 0;
    return aTime - bTime;
  });
}

/**
 * Load stores the current session user can access (owned ∪ member).
 * Relies on stores RLS (user_can_access_store).
 */
export async function fetchAccessibleStores(
  supabase: SupabaseClient,
  options?: { includeArchived?: boolean }
) {
  let query = supabase.from("stores").select("*");
  query = applyArchivedFilter(query, options?.includeArchived);
  return query.order("created_at", { ascending: true });
}

/**
 * Load stores a specific user can access. Use with service-role/admin clients
 * where RLS is bypassed (e.g. cron jobs).
 */
export async function fetchAccessibleStoresForUserId(
  supabase: SupabaseClient,
  userId: string,
  options?: { includeArchived?: boolean }
): Promise<{ data: StoreRow[] | null; error: Error | null }> {
  let ownedQuery = supabase.from("stores").select("*").eq("user_id", userId);
  ownedQuery = applyArchivedFilter(ownedQuery, options?.includeArchived);

  const [{ data: owned, error: ownedError }, { data: memberships, error: memberError }] =
    await Promise.all([
      ownedQuery,
      supabase.from("store_members").select("store_id").eq("user_id", userId),
    ]);

  if (ownedError) {
    return { data: null, error: ownedError };
  }
  if (memberError) {
    return { data: null, error: memberError };
  }

  const ownedStores = (owned ?? []) as StoreRow[];
  const memberIds = Array.from(
    new Set((memberships ?? []).map((row) => row.store_id as string))
  ).filter((storeId) => !ownedStores.some((store) => store.id === storeId));

  if (memberIds.length === 0) {
    return { data: sortStoresByCreatedAt(ownedStores), error: null };
  }

  let memberQuery = supabase.from("stores").select("*").in("id", memberIds);
  memberQuery = applyArchivedFilter(memberQuery, options?.includeArchived);
  const { data: memberStores, error: memberStoresError } = await memberQuery;

  if (memberStoresError) {
    return { data: null, error: memberStoresError };
  }

  return {
    data: sortStoresByCreatedAt([...ownedStores, ...((memberStores ?? []) as StoreRow[])]),
    error: null,
  };
}

/** True when the session user can access the store (owner or member). */
export async function verifyUserCanAccessStore(
  supabase: SupabaseClient,
  storeId: string
): Promise<boolean> {
  const { data } = await supabase.from("stores").select("id").eq("id", storeId).maybeSingle();
  return Boolean(data);
}

/** True when the session user is the original store owner (stores.user_id). */
export async function verifyUserOwnsStore(
  supabase: SupabaseClient,
  storeId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
