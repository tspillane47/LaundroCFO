import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToastType } from "@/components/ui/Toast";
import {
  generateStoreFeed,
  isPositiveEventAlertKey,
  type FeedItem,
  type StoreFeedOptions,
} from "@/lib/intelligence";

export type AlertItem = {
  id: string;
  severity: "warning" | "info" | "success" | "danger";
  title: string;
  body: string;
  tags: string[];
  action: string | null;
  actionLabel: string | null;
  resolved: boolean;
  storeId: string;
  storeName?: string;
};

export type ActionItem = {
  id: string;
  severity: "urgent" | "warning" | "info";
  severityLabel: string;
  title: string;
  description: string;
  href: string;
};

export type PersistableAlertSeverity = "danger" | "warning" | "info";

export type PersistableAlert = {
  alert_key: string;
  severity: PersistableAlertSeverity;
  title: string;
  body: string;
};

export type PositiveEventAlert = {
  alert_key: string;
  severity: "success";
  title: string;
  body: string;
};

export type StoreAlertRow = {
  id: string;
  alert_key: string;
  title: string;
  body: string;
  severity: string;
};

export type StoreAlertSyncPlan = {
  toInsert: PersistableAlert[];
  toResolve: StoreAlertRow[];
  toUpdate: Array<{ row: StoreAlertRow; alert: PersistableAlert }>;
};

export type StoreAlertSyncResult = {
  inserted: number;
  resolved: number;
  updated: number;
  positiveInserted: number;
};

export type StoredStoreAlert = {
  id: string;
  store_id: string;
  alert_key: string;
  severity: string;
  title: string;
  body: string;
  created_at: string;
  toast_shown_at: string | null;
  resolved_at: string | null;
  storeName?: string;
};

const CATEGORY_ACTION: Record<string, { action: string; label: string }> = {
  financial: { action: "financials", label: "View Financials" },
  valuation: { action: "valuation", label: "View Valuation" },
  equipment: { action: "equipment", label: "View Equipment" },
  insurance: { action: "insurance", label: "View Insurance" },
  lease: { action: "lease", label: "View Lease" },
  portfolio: { action: "portfolio", label: "View Portfolio" },
};

const CATEGORY_HREF: Record<string, string> = {
  financial: "/financials",
  valuation: "/valuation",
  equipment: "/equipment",
  insurance: "/insurance",
  lease: "/lease",
  portfolio: "/portfolio",
};

const SEVERITY_TO_ACTION = {
  danger: { severity: "urgent" as const, severityLabel: "URGENT" },
  warning: { severity: "warning" as const, severityLabel: "WARN" },
  info: { severity: "info" as const, severityLabel: "INFO" },
};

export type PortfolioAlertsOptions = {
  scheduledDebtServiceByStore?: Record<string, number>;
  feedOptionsByStore?: Record<string, StoreFeedOptions>;
};

function cleanHeadline(value: string): string {
  return value.replace(/^⚠\s*/, "").trim();
}

function cleanDescription(value: string): string {
  return value.replace(/⚠\s*/g, "").trim();
}

function feedToAlert(item: FeedItem): AlertItem {
  const actionMeta = CATEGORY_ACTION[item.category] ?? null;
  return {
    id: item.id,
    severity: item.severity,
    title: cleanHeadline(item.headline),
    body: cleanDescription(item.description),
    tags: [item.category, item.severity],
    action: actionMeta?.action ?? null,
    actionLabel: actionMeta?.label ?? null,
    resolved: item.severity === "success",
    storeId: item.storeId,
    storeName: item.storeName,
  };
}

export function feedItemsToPersistableAlerts(items: FeedItem[]): PersistableAlert[] {
  return items
    .filter(
      (item): item is FeedItem & { severity: PersistableAlertSeverity } =>
        item.severity === "danger" ||
        item.severity === "warning" ||
        item.severity === "info"
    )
    .map((item) => ({
      alert_key: item.id,
      severity: item.severity,
      title: cleanHeadline(item.headline),
      body: cleanDescription(item.description),
    }));
}

export function planStoreAlertSync(
  current: PersistableAlert[],
  activeRows: StoreAlertRow[]
): StoreAlertSyncPlan {
  const conditionActiveRows = activeRows.filter(
    (row) => !isPositiveEventAlertKey(row.alert_key)
  );
  const currentByKey = new Map(current.map((alert) => [alert.alert_key, alert]));
  const currentKeys = new Set(current.map((alert) => alert.alert_key));
  const activeByKey = new Map(conditionActiveRows.map((row) => [row.alert_key, row]));

  const toInsert = current.filter((alert) => !activeByKey.has(alert.alert_key));
  const toResolve = conditionActiveRows.filter((row) => !currentKeys.has(row.alert_key));
  const toUpdate = conditionActiveRows
    .filter((row) => currentKeys.has(row.alert_key))
    .map((row) => ({ row, alert: currentByKey.get(row.alert_key)! }))
    .filter(
      ({ row, alert }) =>
        row.title !== alert.title ||
        row.body !== alert.body ||
        row.severity !== alert.severity
    );

  return { toInsert, toResolve, toUpdate };
}

export function feedItemsToPositiveEvents(items: FeedItem[]): PositiveEventAlert[] {
  return items
    .filter(
      (item) =>
        item.severity === "success" &&
        (item.id.startsWith("revenue-up-") || item.id.startsWith("dscr-improved-"))
    )
    .map((item) => ({
      alert_key: item.id,
      severity: "success" as const,
      title: cleanHeadline(item.headline),
      body: cleanDescription(item.description),
    }));
}

export function alertSeverityToToastType(
  severity: string,
  alertKey: string
): ToastType {
  if (severity === "danger") return "error";
  if (severity === "warning") return "warning";
  if (severity === "success") return "success";
  if (isPositiveEventAlertKey(alertKey)) return "success";
  return "info";
}

export function planToastShownUpdates(
  unshownAlerts: Array<{ id: string }>,
  alreadyMarkedIds: Set<string>
): string[] {
  return unshownAlerts
    .map((alert) => alert.id)
    .filter((id) => !alreadyMarkedIds.has(id));
}

export function feedItemsToActionItems(
  items: FeedItem[],
  options?: { isOwnerOccupied?: boolean }
): ActionItem[] {
  return items
    .filter((item) => {
      if (item.severity === "success") return false;
      if (item.severity === "info" && !item.id.startsWith("val-change-")) {
        return false;
      }
      if (
        options?.isOwnerOccupied &&
        item.category === "lease" &&
        item.id.startsWith("lease-") &&
        !item.id.includes("escalation") &&
        item.severity === "danger"
      ) {
        return false;
      }
      return (
        item.severity === "danger" ||
        item.severity === "warning" ||
        item.severity === "info"
      );
    })
    .map((item) => {
      const actionMeta = SEVERITY_TO_ACTION[item.severity as keyof typeof SEVERITY_TO_ACTION];
      return {
        id: item.id,
        severity: actionMeta.severity,
        severityLabel: actionMeta.severityLabel,
        title: cleanHeadline(item.headline),
        description: cleanDescription(item.description),
        href: CATEGORY_HREF[item.category] ?? "/dashboard",
      };
    });
}

export function generatePortfolioAlerts(
  stores: Record<string, unknown>[],
  leasesByStore: Record<string, Record<string, unknown>>,
  equipmentByStore: Record<string, Record<string, unknown>[]>,
  insuranceByStore: Record<string, Record<string, unknown>[]>,
  options?: PortfolioAlertsOptions
): AlertItem[] {
  const items = stores.flatMap((store) => {
    const id = String(store.id);
    const feedOptions: StoreFeedOptions = {
      scheduledAnnualDebtService: options?.scheduledDebtServiceByStore?.[id] ?? 0,
      ...options?.feedOptionsByStore?.[id],
    };
    return generateStoreFeed(
      store,
      leasesByStore[id],
      equipmentByStore[id],
      insuranceByStore[id],
      feedOptions
    );
  });

  const order = { danger: 0, warning: 1, info: 2, success: 3 };
  return items
    .sort((a, b) => order[a.severity] - order[b.severity])
    .map(feedToAlert);
}

export async function syncStoreAlerts(
  supabase: SupabaseClient,
  params: {
    userId: string;
    storeId: string;
    feedItems: FeedItem[];
  }
): Promise<StoreAlertSyncResult> {
  const current = feedItemsToPersistableAlerts(params.feedItems);

  const { data: activeRows, error: fetchError } = await supabase
    .from("store_alerts")
    .select("id, alert_key, title, body, severity")
    .eq("store_id", params.storeId)
    .is("resolved_at", null);

  if (fetchError) {
    throw fetchError;
  }

  const plan = planStoreAlertSync(current, activeRows ?? []);
  const nowIso = new Date().toISOString();
  let inserted = 0;
  let resolved = 0;
  let updated = 0;

  if (plan.toResolve.length > 0) {
    const { error } = await supabase
      .from("store_alerts")
      .update({ resolved_at: nowIso })
      .in(
        "id",
        plan.toResolve.map((row) => row.id)
      );

    if (error) throw error;
    resolved = plan.toResolve.length;
  }

  if (plan.toUpdate.length > 0) {
    const results = await Promise.all(
      plan.toUpdate.map(({ row, alert }) =>
        supabase
          .from("store_alerts")
          .update({
            title: alert.title,
            body: alert.body,
            severity: alert.severity,
          })
          .eq("id", row.id)
      )
    );

    const updateError = results.find((result) => result.error)?.error;
    if (updateError) throw updateError;
    updated = plan.toUpdate.length;
  }

  if (plan.toInsert.length > 0) {
    const { error } = await supabase.from("store_alerts").insert(
      plan.toInsert.map((alert) => ({
        user_id: params.userId,
        store_id: params.storeId,
        alert_key: alert.alert_key,
        severity: alert.severity,
        title: alert.title,
        body: alert.body,
      }))
    );

    if (error) throw error;
    inserted = plan.toInsert.length;
  }

  const positiveInserted = await syncPositiveEvents(supabase, params);

  return { inserted, resolved, updated, positiveInserted };
}

export async function syncPositiveEvents(
  supabase: SupabaseClient,
  params: {
    userId: string;
    storeId: string;
    feedItems: FeedItem[];
  }
): Promise<number> {
  const events = feedItemsToPositiveEvents(params.feedItems);
  if (events.length === 0) return 0;

  const { data: existingRows, error: fetchError } = await supabase
    .from("store_alerts")
    .select("alert_key")
    .eq("store_id", params.storeId)
    .in(
      "alert_key",
      events.map((event) => event.alert_key)
    );

  if (fetchError) throw fetchError;

  const existingKeys = new Set((existingRows ?? []).map((row) => row.alert_key));
  const toInsert = events.filter((event) => !existingKeys.has(event.alert_key));
  if (toInsert.length === 0) return 0;

  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("store_alerts").insert(
    toInsert.map((event) => ({
      user_id: params.userId,
      store_id: params.storeId,
      alert_key: event.alert_key,
      severity: event.severity,
      title: event.title,
      body: event.body,
      resolved_at: nowIso,
    }))
  );

  if (error) throw error;
  return toInsert.length;
}

export async function fetchUnshownStoreAlerts(
  supabase: SupabaseClient,
  params: {
    userId: string;
    storeIds?: string[];
  }
): Promise<StoredStoreAlert[]> {
  let query = supabase
    .from("store_alerts")
    .select("id, store_id, alert_key, severity, title, body, created_at, toast_shown_at, resolved_at")
    .eq("user_id", params.userId)
    .is("toast_shown_at", null)
    .order("created_at", { ascending: true });

  if (params.storeIds?.length) {
    query = query.in("store_id", params.storeIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StoredStoreAlert[];
}

export async function markAlertsToastShown(
  supabase: SupabaseClient,
  alertIds: string[]
): Promise<void> {
  if (alertIds.length === 0) return;

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("store_alerts")
    .update({ toast_shown_at: nowIso })
    .in("id", alertIds);

  if (error) throw error;
}

function storedAlertToAlertItem(
  row: StoredStoreAlert,
  storeName?: string
): AlertItem {
  const categoryTag = row.alert_key.includes("lease")
    ? "lease"
    : row.alert_key.includes("ins")
      ? "insurance"
      : row.alert_key.includes("equip")
        ? "equipment"
        : row.alert_key.includes("val")
          ? "valuation"
          : "financial";
  const actionMeta = CATEGORY_ACTION[categoryTag] ?? null;
  const isResolved =
    row.severity === "success" || row.resolved_at != null;

  return {
    id: row.alert_key,
    severity: row.severity as AlertItem["severity"],
    title: row.title,
    body: row.body,
    tags: [categoryTag, row.severity],
    action: actionMeta?.action ?? null,
    actionLabel: actionMeta?.label ?? null,
    resolved: isResolved,
    storeId: row.store_id,
    storeName,
  };
}

export async function fetchPortfolioStoreAlerts(
  supabase: SupabaseClient,
  params: {
    userId: string;
    storeNamesById?: Record<string, string>;
  }
): Promise<AlertItem[]> {
  const { data, error } = await supabase
    .from("store_alerts")
    .select("id, store_id, alert_key, severity, title, body, created_at, toast_shown_at, resolved_at")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const severityOrder = { danger: 0, warning: 1, info: 2, success: 3 };
  return (data ?? [])
    .map((row) =>
      storedAlertToAlertItem(
        row as StoredStoreAlert,
        params.storeNamesById?.[row.store_id]
      )
    )
    .sort(
      (a, b) =>
        (severityOrder[a.severity as keyof typeof severityOrder] ?? 9) -
        (severityOrder[b.severity as keyof typeof severityOrder] ?? 9)
    );
}

export async function syncPortfolioAlerts(
  supabase: SupabaseClient,
  params: {
    userId: string;
    stores: Array<{ id: string; feedItems: FeedItem[] }>;
  }
): Promise<StoreAlertSyncResult> {
  const totals: StoreAlertSyncResult = {
    inserted: 0,
    resolved: 0,
    updated: 0,
    positiveInserted: 0,
  };

  for (const store of params.stores) {
    const result = await syncStoreAlerts(supabase, {
      userId: params.userId,
      storeId: store.id,
      feedItems: store.feedItems,
    });
    totals.inserted += result.inserted;
    totals.resolved += result.resolved;
    totals.updated += result.updated;
    totals.positiveInserted += result.positiveInserted;
  }

  return totals;
}
