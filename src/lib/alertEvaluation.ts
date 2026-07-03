import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToastType } from "@/components/ui/Toast";
import {
  alertSeverityToToastType,
  fetchUnshownStoreAlerts,
  markAlertsToastShown,
  syncPortfolioAlerts,
  type StoredStoreAlert,
} from "@/lib/alerts";
import { computeStoreDscr } from "@/lib/dscr";
import { enrichMonthlyRecords, sortRecordsDesc, type MonthlyFinancialRecord } from "@/lib/financials";
import { getStoreValuation } from "@/lib/getStoreValuation";
import {
  buildRevenuePeriodKey,
  generateStoreFeed,
  parseDscrFromAlertText,
  type FeedItem,
  type PositiveEventInput,
  type StoreFeedOptions,
} from "@/lib/intelligence";

type ToastPublisher = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
};

export type AlertEvaluationResult = {
  sync: {
    inserted: number;
    resolved: number;
    updated: number;
    positiveInserted: number;
  };
  toasted: number;
};

function formatToastMessage(alert: StoredStoreAlert, storeName?: string): string {
  const prefix = storeName ? `${storeName}: ` : "";
  return `${prefix}${alert.title} — ${alert.body}`;
}

export function showStoreAlertToasts(
  toast: ToastPublisher,
  alerts: StoredStoreAlert[],
  storeNamesById?: Record<string, string>
): void {
  const severityOrder: Record<string, number> = {
    danger: 0,
    warning: 1,
    info: 2,
    success: 3,
  };

  const sorted = [...alerts].sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) ||
      a.created_at.localeCompare(b.created_at)
  );

  for (const alert of sorted) {
    const type: ToastType = alertSeverityToToastType(alert.severity, alert.alert_key);
    const message = formatToastMessage(alert, storeNamesById?.[alert.store_id]);
    toast[type](message);
  }
}

async function fetchLatestRevenueComparison(
  supabase: SupabaseClient,
  storeId: string
): Promise<{
  currentRevenue: number;
  priorRevenue: number;
  periodKey: string;
} | null> {
  const { data, error } = await supabase
    .from("monthly_financials")
    .select("year, month, revenue")
    .eq("store_id", storeId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(2);

  if (error) throw error;
  if (!data || data.length < 2) return null;

  const [latest, prior] = data;
  const currentRevenue = Number(latest.revenue) || 0;
  const priorRevenue = Number(prior.revenue) || 0;
  if (currentRevenue <= 0 || priorRevenue <= 0) return null;

  return {
    currentRevenue,
    priorRevenue,
    periodKey: buildRevenuePeriodKey(latest.year, latest.month),
  };
}

async function fetchPreviousDscrFromHistory(
  supabase: SupabaseClient,
  storeId: string
): Promise<number | null> {
  const alertKey = `dscr-${storeId}`;
  const { data, error } = await supabase
    .from("store_alerts")
    .select("title, body, severity, created_at")
    .eq("store_id", storeId)
    .eq("alert_key", alertKey)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data?.length || data[0].severity !== "danger") return null;

  const row = data[0];
  return (
    parseDscrFromAlertText(row.body) ??
    parseDscrFromAlertText(row.title)
  );
}

async function buildPositiveEventsForStore(
  supabase: SupabaseClient,
  store: Record<string, unknown>,
  feedOptions: StoreFeedOptions
): Promise<PositiveEventInput | undefined> {
  const storeId = String(store.id);
  const positiveEvents: PositiveEventInput = {};
  const existingKeys = new Set<string>();

  const { data: existingRows, error: existingError } = await supabase
    .from("store_alerts")
    .select("alert_key")
    .eq("store_id", storeId);

  if (existingError) throw existingError;
  for (const row of existingRows ?? []) {
    existingKeys.add(row.alert_key);
  }

  const revenueComparison = await fetchLatestRevenueComparison(supabase, storeId);
  if (revenueComparison) {
    const revenueKey = `revenue-up-${storeId}-${revenueComparison.periodKey}`;
    if (
      !existingKeys.has(revenueKey) &&
      revenueComparison.currentRevenue > revenueComparison.priorRevenue
    ) {
      positiveEvents.revenueUp = revenueComparison;
    }
  }

  const financials = feedOptions.resolvedFinancials;
  const debtService = feedOptions.scheduledAnnualDebtService ?? 0;
  if (financials?.source === "ttm" && debtService > 0) {
    const currentDscr = computeStoreDscr(financials.annualEbitda, debtService);
    if (currentDscr != null) {
      const previousDscr = await fetchPreviousDscrFromHistory(supabase, storeId);
      const improvedKey = `dscr-improved-${storeId}-${currentDscr.toFixed(2)}`;
      if (
        previousDscr != null &&
        !existingKeys.has(improvedKey) &&
        currentDscr > previousDscr + 0.005
      ) {
        positiveEvents.dscrImproved = { currentDscr, previousDscr };
      }
    }
  }

  if (!positiveEvents.revenueUp && !positiveEvents.dscrImproved) {
    return undefined;
  }

  return positiveEvents;
}

export async function buildPortfolioFeedItems(
  supabase: SupabaseClient,
  stores: Record<string, unknown>[],
  options?: { storeIds?: string[] }
): Promise<Array<{ id: string; feedItems: FeedItem[] }>> {
  const targetStores = options?.storeIds?.length
    ? stores.filter((store) => options.storeIds!.includes(String(store.id)))
    : stores;

  if (targetStores.length === 0) return [];

  const storeIds = targetStores.map((store) => String(store.id));
  const [
    { data: leasesData, error: leaseError },
    { data: equipmentData, error: equipError },
    { data: insuranceData, error: insError },
    { data: loansData, error: loansError },
  ] = await Promise.all([
    supabase.from("leases").select("*").in("store_id", storeIds),
    supabase.from("equipment_inventory").select("*").in("store_id", storeIds),
    supabase
      .from("insurance_policies")
      .select("*")
      .in("store_id", storeIds)
      .eq("is_active", true),
    supabase
      .from("store_loans")
      .select("store_id, monthly_payment")
      .in("store_id", storeIds)
      .eq("is_active", true),
  ]);

  if (leaseError) throw leaseError;
  if (equipError) throw equipError;
  if (insError) throw insError;
  if (loansError) throw loansError;

  const leasesByStore: Record<string, Record<string, unknown>> = {};
  for (const lease of leasesData ?? []) {
    if (!leasesByStore[lease.store_id]) leasesByStore[lease.store_id] = lease;
  }

  const equipmentByStore: Record<string, Record<string, unknown>[]> = {};
  for (const item of equipmentData ?? []) {
    if (!equipmentByStore[item.store_id]) equipmentByStore[item.store_id] = [];
    equipmentByStore[item.store_id].push(item);
  }

  const insuranceByStore: Record<string, Record<string, unknown>[]> = {};
  for (const policy of insuranceData ?? []) {
    if (!insuranceByStore[policy.store_id]) insuranceByStore[policy.store_id] = [];
    insuranceByStore[policy.store_id].push(policy);
  }

  const scheduledDebtServiceByStore: Record<string, number> = {};
  for (const loan of loansData ?? []) {
    const id = String(loan.store_id);
    scheduledDebtServiceByStore[id] =
      (scheduledDebtServiceByStore[id] ?? 0) + (loan.monthly_payment ?? 0) * 12;
  }

  const valuations = await Promise.all(
    targetStores.map((store) => getStoreValuation(String(store.id)))
  );

  const results: Array<{ id: string; feedItems: FeedItem[] }> = [];

  for (let index = 0; index < targetStores.length; index += 1) {
    const store = targetStores[index];
    const storeId = String(store.id);
    const valuation = valuations[index];

    const feedOptions: StoreFeedOptions = {
      scheduledAnnualDebtService: scheduledDebtServiceByStore[storeId] ?? 0,
      resolvedFinancials: valuation?.resolvedFinancials,
      monthlyUtilities: store.monthly_utilities as number | undefined,
      isOwnerOccupied: store.occupancy_type === "owner_occupied",
      positiveEvents: await buildPositiveEventsForStore(supabase, store, {
        scheduledAnnualDebtService: scheduledDebtServiceByStore[storeId] ?? 0,
        resolvedFinancials: valuation?.resolvedFinancials,
      }),
    };

    const feedItems = generateStoreFeed(
      store,
      leasesByStore[storeId],
      equipmentByStore[storeId],
      insuranceByStore[storeId],
      feedOptions
    );

    results.push({ id: storeId, feedItems });
  }

  return results;
}

export async function evaluatePortfolioAlerts(
  supabase: SupabaseClient,
  params: {
    userId: string;
    stores: Record<string, unknown>[];
    toast?: ToastPublisher;
    storeIds?: string[];
  }
): Promise<AlertEvaluationResult> {
  const storeNamesById = Object.fromEntries(
    params.stores.map((store) => [String(store.id), String(store.name ?? "Store")])
  );

  const portfolioFeed = await buildPortfolioFeedItems(supabase, params.stores, {
    storeIds: params.storeIds,
  });

  const sync = await syncPortfolioAlerts(supabase, {
    userId: params.userId,
    stores: portfolioFeed,
  });

  const targetStoreIds = params.storeIds ?? params.stores.map((store) => String(store.id));
  const unshown = await fetchUnshownStoreAlerts(supabase, {
    userId: params.userId,
    storeIds: targetStoreIds,
  });

  if (params.toast && unshown.length > 0) {
    showStoreAlertToasts(params.toast, unshown, storeNamesById);
    await markAlertsToastShown(
      supabase,
      unshown.map((alert) => alert.id)
    );
  }

  return {
    sync,
    toasted: unshown.length,
  };
}

/** Compare latest vs prior monthly_financials revenue — same month-over-month basis as operating reports. */
export function compareMonthlyRevenue(
  records: MonthlyFinancialRecord[]
): {
  currentRevenue: number;
  priorRevenue: number;
  periodKey: string;
} | null {
  const sorted = enrichMonthlyRecords(sortRecordsDesc(records));
  if (sorted.length < 2) return null;

  const latest = sorted[0];
  const prior = sorted[1];
  const currentRevenue = latest.revenue ?? 0;
  const priorRevenue = prior.revenue ?? 0;
  if (currentRevenue <= 0 || priorRevenue <= 0) return null;

  return {
    currentRevenue,
    priorRevenue,
    periodKey: buildRevenuePeriodKey(latest.year, latest.month),
  };
}
