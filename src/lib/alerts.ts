import { generateStoreFeed, type FeedItem } from "@/lib/intelligence";

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

const CATEGORY_ACTION: Record<string, { action: string; label: string }> = {
  financial: { action: "financials", label: "View Financials" },
  valuation: { action: "valuation", label: "View Valuation" },
  equipment: { action: "equipment", label: "View Equipment" },
  insurance: { action: "insurance", label: "View Insurance" },
  lease: { action: "lease", label: "View Lease" },
  portfolio: { action: "portfolio", label: "View Portfolio" },
};

function feedToAlert(item: FeedItem): AlertItem {
  const actionMeta = CATEGORY_ACTION[item.category] ?? null;
  return {
    id: item.id,
    severity: item.severity,
    title: item.headline.replace(/^⚠\s*/, ""),
    body: item.description.replace(/⚠\s*/g, ""),
    tags: [item.category, item.severity],
    action: actionMeta?.action ?? null,
    actionLabel: actionMeta?.label ?? null,
    resolved: item.severity === "success",
    storeId: item.storeId,
    storeName: item.storeName,
  };
}

export function generatePortfolioAlerts(
  stores: Record<string, unknown>[],
  leasesByStore: Record<string, Record<string, unknown>>,
  equipmentByStore: Record<string, Record<string, unknown>[]>,
  insuranceByStore: Record<string, Record<string, unknown>[]>
): AlertItem[] {
  const items = stores.flatMap((store) => {
    const id = String(store.id);
    return generateStoreFeed(
      store,
      leasesByStore[id],
      equipmentByStore[id],
      insuranceByStore[id]
    );
  });

  const order = { danger: 0, warning: 1, info: 2, success: 3 };
  return items
    .sort((a, b) => order[a.severity] - order[b.severity])
    .map(feedToAlert);
}
