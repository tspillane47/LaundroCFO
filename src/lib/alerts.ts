import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateStoreFeed,
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
  const currentByKey = new Map(current.map((alert) => [alert.alert_key, alert]));
  const currentKeys = new Set(current.map((alert) => alert.alert_key));
  const activeByKey = new Map(activeRows.map((row) => [row.alert_key, row]));

  const toInsert = current.filter((alert) => !activeByKey.has(alert.alert_key));
  const toResolve = activeRows.filter((row) => !currentKeys.has(row.alert_key));
  const toUpdate = activeRows
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

  return { inserted, resolved, updated };
}

export async function syncPortfolioAlerts(
  supabase: SupabaseClient,
  params: {
    userId: string;
    stores: Array<{ id: string; feedItems: FeedItem[] }>;
  }
): Promise<StoreAlertSyncResult> {
  const totals: StoreAlertSyncResult = { inserted: 0, resolved: 0, updated: 0 };

  for (const store of params.stores) {
    const result = await syncStoreAlerts(supabase, {
      userId: params.userId,
      storeId: store.id,
      feedItems: store.feedItems,
    });
    totals.inserted += result.inserted;
    totals.resolved += result.resolved;
    totals.updated += result.updated;
  }

  return totals;
}
