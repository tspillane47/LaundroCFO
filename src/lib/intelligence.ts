import { calcUtilityRatio } from "@/lib/calculations";
import {
  escalationSeverity,
  formatRentEscalationAlert,
  getNextRentEscalation,
} from "@/lib/rent-escalation";
import { computeStoreDscr, hasScheduledDebtService, shouldTriggerLowDscrAlert } from "@/lib/dscr";
import {
  computeStoreValuation,
  type StoreValuationContext,
} from "@/lib/getStoreValuation";

export interface FeedItem {
  id: string;
  date: string;
  category: 'financial' | 'valuation' | 'equipment' | 'insurance' | 'lease' | 'portfolio';
  icon: string;
  headline: string;
  description: string;
  severity: 'info' | 'warning' | 'success' | 'danger';
  storeId: string;
  storeName?: string;
}

export type StoreFeedFinancials = {
  monthlyRevenue: number;
  monthlyExpenses: number;
  annualEbitda: number;
  source: 'ttm' | 'none';
};

export type PositiveEventInput = {
  revenueUp?: {
    currentRevenue: number;
    priorRevenue: number;
    periodKey: string;
  };
  dscrImproved?: {
    currentDscr: number;
    previousDscr: number;
  };
};

export type StoreFeedValuation = {
  businessValue: number;
  finalMultiple: number;
};

export type StoreFeedOptions = {
  scheduledAnnualDebtService?: number;
  resolvedFinancials?: StoreFeedFinancials | null;
  /** @deprecated Use ttmUtilities — stale profile fallback only. */
  monthlyUtilities?: number;
  ttmRevenue?: number;
  ttmUtilities?: number;
  isOwnerOccupied?: boolean;
  /** Canonical valuation from getStoreValuation(); falls back to computeStoreValuation when omitted. */
  valuation?: StoreFeedValuation | null;
  valuationMonthlyChange?: number;
  positiveEvents?: PositiveEventInput;
};

const POSITIVE_EVENT_PREFIXES = ["revenue-up-", "dscr-improved-", "val-change-"] as const;

export function isPositiveEventAlertKey(alertKey: string): boolean {
  return POSITIVE_EVENT_PREFIXES.some((prefix) => alertKey.includes(prefix));
}

export function buildRevenuePeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Parse DSCR values from alert title/body text (e.g. "1.10x"). */
export function parseDscrFromAlertText(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)x/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function appendPositiveFeedItems(
  store: { id: string; name?: string },
  items: FeedItemDraft[],
  now: Date,
  positiveEvents?: PositiveEventInput
): void {
  if (!positiveEvents) return;

  if (positiveEvents.revenueUp) {
    const { currentRevenue, priorRevenue, periodKey } = positiveEvents.revenueUp;
    if (currentRevenue > priorRevenue && priorRevenue > 0) {
      const change = currentRevenue - priorRevenue;
      const pct = ((change / priorRevenue) * 100).toFixed(1);
      items.push({
        id: `revenue-up-${store.id}-${periodKey}`,
        date: formatDate(now),
        category: "financial",
        icon: "📈",
        headline: "Revenue Increased",
        description: `Monthly revenue rose $${Math.round(change).toLocaleString()} (${pct}%) vs. the prior month.`,
        severity: "success",
        storeName: store.name,
      });
    }
  }

  if (positiveEvents.dscrImproved) {
    const { currentDscr, previousDscr } = positiveEvents.dscrImproved;
    if (currentDscr > previousDscr + 0.005) {
      const delta = currentDscr - previousDscr;
      items.push({
        id: `dscr-improved-${store.id}-${currentDscr.toFixed(2)}`,
        date: formatDate(now),
        category: "financial",
        icon: "🏦",
        headline: "DSCR Improved",
        description: `DSCR rose from ${previousDscr.toFixed(2)}x to ${currentDscr.toFixed(2)}x (+${delta.toFixed(2)}x).`,
        severity: "success",
        storeName: store.name,
      });
    }
  }
}

type FeedItemDraft = Omit<FeedItem, "storeId">;

function calcYearsRemaining(endDate: string, now: Date): number {
  const end = new Date(endDate);
  return Math.max(0, (end.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function hasTtmFinancials(financials?: StoreFeedFinancials | null): financials is StoreFeedFinancials {
  return financials?.source === 'ttm';
}

function resolveFeedValuation(
  store: any,
  lease: any,
  equipment: any[] | undefined,
  financials: StoreFeedFinancials | null | undefined,
  provided?: StoreFeedValuation | null
): StoreFeedValuation | null {
  if (provided && provided.businessValue > 0) {
    return provided;
  }

  const ctx: StoreValuationContext = {
    store,
    equipment: equipment ?? [],
    lease: lease ?? null,
    leaseOptions: [],
    realEstate: null,
    resolvedFinancials: hasTtmFinancials(financials) ? financials : undefined,
  };

  const result = computeStoreValuation(ctx);
  if (result.businessValue <= 0) return null;

  return {
    businessValue: result.businessValue,
    finalMultiple: result.finalMultiple,
  };
}

export function generateStoreFeed(
  store: any,
  lease?: any,
  equipment?: any[],
  insurance?: any[],
  options?: StoreFeedOptions
): FeedItem[] {
  const items: FeedItemDraft[] = [];
  const now = new Date();
  const financials = options?.resolvedFinancials;
  const hasFinancialData = hasTtmFinancials(financials);
  const monthlyRevenue = hasFinancialData
    ? financials.monthlyRevenue
    : Number(store.monthly_revenue) || 0;
  const monthlyExpenses = hasFinancialData
    ? financials.monthlyExpenses
    : Number(store.monthly_expenses) || 0;
  const annualEbitda = hasFinancialData
    ? financials.annualEbitda
    : (monthlyRevenue - monthlyExpenses) * 12;

  // Financial items
  if (monthlyRevenue > 0) {
    items.push({
      id: 'rev-' + store.id,
      date: formatDate(now),
      category: 'financial',
      icon: '💰',
      headline: `Monthly revenue: $${monthlyRevenue.toLocaleString()}`,
      description: monthlyRevenue > 60000
        ? 'Above $60k threshold — strong revenue month.'
        : 'Tracking within normal range.',
      severity: 'success',
      storeName: store.name,
    });
  }

  if (store.monthly_rent > 0) {
    const rentRatio = monthlyRevenue > 0
      ? ((store.monthly_rent / monthlyRevenue) * 100).toFixed(1)
      : 0;
    items.push({
      id: 'rent-' + store.id,
      date: formatDate(now),
      category: 'financial',
      icon: '🏠',
      headline: `Monthly rent: $${store.monthly_rent.toLocaleString()}`,
      description: `${rentRatio}% of revenue. ${Number(rentRatio) > 20 ? '⚠ Above 20% threshold — monitor closely.' : 'Within healthy range.'}`,
      severity: Number(rentRatio) > 20 ? 'warning' : 'info',
      storeName: store.name,
    });
  }

  if (monthlyExpenses > 0 || monthlyRevenue > 0) {
    const ebitda = monthlyRevenue - monthlyExpenses;
    const margin = monthlyRevenue > 0 ? ((ebitda / monthlyRevenue) * 100).toFixed(1) : 0;
    items.push({
      id: 'ebitda-' + store.id,
      date: formatDate(now),
      category: 'financial',
      icon: '📊',
      headline: `Monthly EBITDA: $${ebitda.toLocaleString()}`,
      description: `${margin}% margin. ${Number(margin) > 28 ? 'Above industry median of 22% — strong performance.' : Number(margin) > 20 ? 'Near industry median of 22%.' : '⚠ Below industry median — review expenses.'}`,
      severity: Number(margin) > 25 ? 'success' : Number(margin) > 18 ? 'info' : 'warning',
      storeName: store.name,
    });
  }

  if (hasFinancialData) {
    const ttmRevenue = options?.ttmRevenue ?? 0;
    const ttmUtilities = options?.ttmUtilities ?? 0;
    if (ttmRevenue > 0 && ttmUtilities > 0) {
      const utilityRatio = calcUtilityRatio(ttmUtilities, ttmRevenue);
      if (utilityRatio > 20) {
        items.push({
          id: 'utility-' + store.id,
          date: formatDate(now),
          category: 'financial',
          icon: '⚡',
          headline: 'High Utility Costs',
          description: `Utilities are ${utilityRatio.toFixed(1)}% of revenue — above the 20% threshold.`,
          severity: 'warning',
          storeName: store.name,
        });
      }
    }
  }

  const scheduledAnnualDebtService = options?.scheduledAnnualDebtService ?? 0;
  if (hasScheduledDebtService(scheduledAnnualDebtService)) {
    const dscr = computeStoreDscr(annualEbitda, scheduledAnnualDebtService);
    if (dscr != null) {
      const isLow = shouldTriggerLowDscrAlert(dscr, scheduledAnnualDebtService);
      items.push({
        id: 'dscr-' + store.id,
        date: formatDate(now),
        category: 'financial',
        icon: '🏦',
        headline: isLow ? 'DSCR Below Threshold' : `DSCR: ${dscr.toFixed(2)}x`,
        description: isLow
          ? `Current DSCR of ${dscr.toFixed(2)}x is below the 1.25x minimum.`
          : dscr >= 1.5
            ? 'Strong debt coverage. Lender-ready position.'
            : 'Meets minimum lender threshold of 1.25x.',
        severity: isLow ? 'danger' : dscr >= 1.5 ? 'success' : 'info',
        storeName: store.name,
      });
    }
  }

  // Valuation items — same calcValuation path as Valuation page (getStoreValuation)
  const feedValuation = resolveFeedValuation(
    store,
    lease,
    equipment,
    financials,
    options?.valuation
  );
  if (feedValuation) {
    items.push({
      id: 'val-' + store.id,
      date: formatDate(now),
      category: 'valuation',
      icon: '💎',
      headline: `Store valuation: $${Math.round(feedValuation.businessValue).toLocaleString()}`,
      description: `Based on ${feedValuation.finalMultiple.toFixed(2)}x EBITDA multiple. Update equipment and lease data to refine this estimate.`,
      severity: 'info',
      storeName: store.name,
    });
  }

  if (options?.valuationMonthlyChange != null && options.valuationMonthlyChange > 0) {
    items.push({
      id: 'val-change-' + store.id,
      date: formatDate(now),
      category: 'valuation',
      icon: '📈',
      headline: 'Valuation Increased',
      description: `Store value rose $${Math.round(options.valuationMonthlyChange).toLocaleString()} this month.`,
      severity: 'info',
      storeName: store.name,
    });
  }

  // Equipment items
  if (store.avg_machine_age > 0) {
    const age = store.avg_machine_age;
    items.push({
      id: 'equip-' + store.id,
      date: formatDate(now),
      category: 'equipment',
      icon: '⚙️',
      headline: age > 12 ? 'Equipment Aging' : `Equipment avg age: ${age.toFixed(1)} years`,
      description: age <= 8
        ? 'Equipment in good shape. Positive valuation impact.'
        : age <= 12
        ? 'Equipment approaching mid-life. Plan for future replacements.'
        : `Average machine age is ${age.toFixed(1)} years — consider replacement planning.`,
      severity: age <= 8 ? 'success' : age <= 12 ? 'info' : 'warning',
      storeName: store.name,
    });
  }

  if (equipment && equipment.length > 0) {
    const washers200G = equipment.filter(e => e.machine_type === 'Washer' && e.high_speed_extract);
    const total200G = washers200G.reduce((s, e) => s + e.quantity, 0);
    const totalWashers = equipment.filter(e => e.machine_type === 'Washer').reduce((s, e) => s + e.quantity, 0);
    if (totalWashers > 0) {
      const pct200G = Math.round((total200G / totalWashers) * 100);
      items.push({
        id: 'equip-200g-' + store.id,
        date: formatDate(now),
        category: 'equipment',
        icon: '⚡',
        headline: `${pct200G}% high-speed extract washers`,
        description: pct200G > 50
          ? 'Majority 200G+ machines. Adds +0.10x to valuation multiple.'
          : 'Less than 50% 200G machines. Upgrade opportunity.',
        severity: pct200G > 50 ? 'success' : 'info',
        storeName: store.name,
      });
    }
  }

  // Lease items
  if (lease?.lease_end_date) {
    const yearsRemaining = calcYearsRemaining(lease.lease_end_date, now);
    const endDate = new Date(lease.lease_end_date);
    items.push({
      id: 'lease-' + store.id,
      date: formatDate(now),
      category: 'lease',
      icon: '📋',
      headline: yearsRemaining < 3
        ? 'Lease Expiring'
        : `Lease expires ${endDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      description: yearsRemaining < 3
        ? `Only ${yearsRemaining.toFixed(1)} years remaining on your lease.`
        : yearsRemaining < 5
        ? 'Lease renewal should be prioritized within 12 months to maintain lender confidence.'
        : `${yearsRemaining.toFixed(1)} years remaining on base lease. Good lender position.`,
      severity: yearsRemaining < 3 ? 'danger' : yearsRemaining < 5 ? 'warning' : 'success',
      storeName: store.name,
    });

    if (lease.monthly_rent && monthlyRevenue) {
      const rentRatio = ((lease.monthly_rent / monthlyRevenue) * 100).toFixed(1);
      items.push({
        id: 'lease-rent-' + store.id,
        date: formatDate(now),
        category: 'lease',
        icon: '🏢',
        headline: `Rent to revenue: ${rentRatio}%`,
        description: Number(rentRatio) < 15
          ? 'Favorable rent burden. Positive for EBITDA margin and valuation.'
          : Number(rentRatio) < 20
          ? 'Moderate rent burden. Monitor as revenue fluctuates.'
          : '⚠ High rent burden. Above 20% threshold — lenders will scrutinize.',
        severity: Number(rentRatio) < 15 ? 'success' : Number(rentRatio) < 20 ? 'info' : 'warning',
        storeName: store.name,
      });
    }
  }

  if (lease) {
    const escalation = getNextRentEscalation(
      lease.lease_start_date,
      lease.annual_escalation_pct,
      lease.monthly_rent,
      now
    );
    const escalationAlertSeverity = escalation
      ? escalationSeverity(escalation.monthsUntil)
      : null;
    if (escalation && escalationAlertSeverity) {
      items.push({
        id: 'lease-escalation-' + store.id,
        date: formatDate(now),
        category: 'lease',
        icon: '📈',
        headline: formatRentEscalationAlert(escalation),
        description: `Next escalation on ${escalation.nextDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} (${lease.annual_escalation_pct}% annual increase). Review cash flow and budget accordingly.`,
        severity: escalationAlertSeverity,
        storeName: store.name,
      });
    }
  }

  // Insurance items
  if (insurance && insurance.length > 0) {
    const soonExpiring = insurance.filter(p => {
      if (!p.expiration_date) return false;
      const days = Math.round((new Date(p.expiration_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return days < 90 && days > 0;
    });

    soonExpiring.forEach(p => {
      const days = Math.round((new Date(p.expiration_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      items.push({
        id: 'ins-' + p.id,
        date: formatDate(now),
        category: 'insurance',
        icon: '🛡️',
        headline: `${p.policy_type} policy expires in ${days} days`,
        description: `Carrier: ${p.carrier ?? 'Unknown'}. Policy #${p.policy_number ?? 'N/A'}. Contact agent to begin renewal.`,
        severity: days < 30 ? 'danger' : 'warning',
        storeName: store.name,
      });
    });

    const hasBI = insurance.some(p => p.business_interruption);
    if (!hasBI) {
      items.push({
        id: 'ins-bi-' + store.id,
        date: formatDate(now),
        category: 'insurance',
        icon: '⚠️',
        headline: 'Missing business interruption coverage',
        description: 'No active policy includes business interruption. This is a significant coverage gap for laundromat operators.',
        severity: 'warning',
        storeName: store.name,
      });
    }

    const totalPremium = insurance.reduce((s, p) => s + (p.annual_premium ?? 0), 0);
    if (totalPremium > 0) {
      items.push({
        id: 'ins-premium-' + store.id,
        date: formatDate(now),
        category: 'insurance',
        icon: '🛡️',
        headline: `Total annual insurance premium: $${totalPremium.toLocaleString()}`,
        description: `${insurance.length} active ${insurance.length === 1 ? 'policy' : 'policies'}. Premium is ${monthlyRevenue > 0 ? ((totalPremium / (monthlyRevenue * 12)) * 100).toFixed(1) + '% of annual revenue.' : 'recorded.'}`,
        severity: 'info',
        storeName: store.name,
      });
    }
  } else {
    items.push({
      id: 'ins-missing-' + store.id,
      date: formatDate(now),
      category: 'insurance',
      icon: '🛡️',
      headline: 'Add Insurance Policies',
      description: 'No active insurance policies on file for this store.',
      severity: 'warning',
      storeName: store.name,
    });
  }

  appendPositiveFeedItems(store, items, now, options?.positiveEvents);

  // Sort by severity: danger first, then warning, then success, then info
  const order = { danger: 0, warning: 1, success: 2, info: 3 };
  return items
    .sort((a, b) => order[a.severity] - order[b.severity])
    .map((item) => ({ ...item, storeId: String(store.id) }));
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
