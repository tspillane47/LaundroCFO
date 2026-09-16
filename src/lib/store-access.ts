import type { SupabaseClient } from "@supabase/supabase-js";

export type StoreRow = Record<string, unknown> & {
  id: string;
  created_at?: string;
  user_id?: string | null;
  ownerLabel?: string | null;
};

type StoreOwnerLabelRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

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

function resolveOwnerLabel(row: { full_name: string | null; email: string | null }): string | null {
  const name = row.full_name?.trim();
  if (name) return name;
  const email = row.email?.trim();
  if (email) return email;
  return null;
}

/** Portfolio subtitle for a co-owned store. Null for stores the current user owns. */
export function ownedBySubtitle(
  store: { user_id?: string | null; ownerLabel?: string | null },
  currentUserId: string | null | undefined
): string | null {
  if (!currentUserId || !store.user_id || store.user_id === currentUserId) {
    return null;
  }
  if (!store.ownerLabel) {
    return null;
  }
  return `Owned by ${store.ownerLabel}`;
}

async function attachOwnerLabels(
  supabase: SupabaseClient,
  stores: StoreRow[]
): Promise<StoreRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id;
  if (!currentUserId) {
    return stores;
  }

  const ownerIds = Array.from(
    new Set(
      stores
        .map((store) => store.user_id)
        .filter((id): id is string => Boolean(id) && id !== currentUserId)
    )
  );

  if (ownerIds.length === 0) {
    return stores;
  }

  const { data: labels, error: labelsError } = await supabase.rpc("store_owner_labels", {
    owner_ids: ownerIds,
  });

  if (labelsError) {
    console.error("[fetchAccessibleStores] store_owner_labels failed", labelsError);
    return stores;
  }

  const labelByOwnerId = new Map<string, string>();
  for (const row of (labels ?? []) as StoreOwnerLabelRow[]) {
    const label = resolveOwnerLabel(row);
    if (label) {
      labelByOwnerId.set(row.user_id, label);
    }
  }

  if (labelByOwnerId.size === 0) {
    return stores;
  }

  return stores.map((store) => {
    const ownerId = store.user_id;
    if (!ownerId || ownerId === currentUserId) {
      return store;
    }
    const ownerLabel = labelByOwnerId.get(ownerId);
    if (!ownerLabel) {
      return store;
    }
    return { ...store, ownerLabel };
  });
}

/**
 * Load stores the current session user can access (owned ∪ member).
 * Relies on stores RLS (user_can_access_store).
 * Co-owned stores are labeled with the owner's name/email via one batched RPC.
 */
export async function fetchAccessibleStores(
  supabase: SupabaseClient,
  options?: { includeArchived?: boolean }
) {
  let query = supabase.from("stores").select("*");
  query = applyArchivedFilter(query, options?.includeArchived);
  const result = await query.order("created_at", { ascending: true });

  if (result.error || !result.data || result.data.length === 0) {
    return result;
  }

  const stores = result.data as StoreRow[];
  const labeled = await attachOwnerLabels(supabase, stores);
  return { ...result, data: labeled };
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
