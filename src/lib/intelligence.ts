import {
  escalationSeverity,
  formatRentEscalationAlert,
  getNextRentEscalation,
} from "@/lib/rent-escalation";

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

type FeedItemDraft = Omit<FeedItem, "storeId">;

export function generateStoreFeed(store: any, lease?: any, equipment?: any[], insurance?: any[]): FeedItem[] {
  const items: FeedItemDraft[] = [];
  const now = new Date();

  // Financial items
  if (store.monthly_revenue > 0) {
    items.push({
      id: 'rev-' + store.id,
      date: formatDate(now),
      category: 'financial',
      icon: '💰',
      headline: `Monthly revenue: $${store.monthly_revenue.toLocaleString()}`,
      description: store.monthly_revenue > 60000
        ? 'Above $60k threshold — strong revenue month.'
        : 'Tracking within normal range.',
      severity: 'success',
      storeName: store.name,
    });
  }

  if (store.monthly_rent > 0) {
    const rentRatio = store.monthly_revenue > 0
      ? ((store.monthly_rent / store.monthly_revenue) * 100).toFixed(1)
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

  if (store.monthly_expenses > 0) {
    const ebitda = store.monthly_revenue - store.monthly_expenses;
    const margin = store.monthly_revenue > 0 ? ((ebitda / store.monthly_revenue) * 100).toFixed(1) : 0;
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

  if (store.annual_debt_service > 0) {
    const annualEbitda = (store.monthly_revenue - store.monthly_expenses) * 12;
    const dscr = annualEbitda / store.annual_debt_service;
    items.push({
      id: 'dscr-' + store.id,
      date: formatDate(now),
      category: 'financial',
      icon: '🏦',
      headline: `DSCR: ${dscr.toFixed(2)}x`,
      description: dscr >= 1.5
        ? 'Strong debt coverage. Lender-ready position.'
        : dscr >= 1.25
        ? 'Meets minimum lender threshold of 1.25x.'
        : '⚠ Below 1.25x minimum. Review debt service.',
      severity: dscr >= 1.5 ? 'success' : dscr >= 1.25 ? 'info' : 'danger',
      storeName: store.name,
    });
  }

  // Valuation items
  const annualEbitda = (store.monthly_revenue - store.monthly_expenses) * 12;
  const estimatedValue = annualEbitda * 3.47;
  if (estimatedValue > 0) {
    items.push({
      id: 'val-' + store.id,
      date: formatDate(now),
      category: 'valuation',
      icon: '💎',
      headline: `Store valuation: $${Math.round(estimatedValue).toLocaleString()}`,
      description: `Based on ${annualEbitda > 0 ? '3.47x' : 'N/A'} EBITDA multiple. Update equipment and lease data to refine this estimate.`,
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
      headline: `Equipment avg age: ${age.toFixed(1)} years`,
      description: age < 8
        ? 'Equipment in good shape. Positive valuation impact.'
        : age < 12
        ? 'Equipment approaching mid-life. Plan for future replacements.'
        : '⚠ Equipment aging. Consider retool to protect valuation.',
      severity: age < 8 ? 'success' : age < 12 ? 'info' : 'warning',
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
    const endDate = new Date(lease.lease_end_date);
    const yearsRemaining = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365);
    items.push({
      id: 'lease-' + store.id,
      date: formatDate(now),
      category: 'lease',
      icon: '📋',
      headline: yearsRemaining < 3
        ? `⚠ Lease expires in ${Math.round(yearsRemaining * 12)} months`
        : `Lease expires ${endDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      description: yearsRemaining < 3
        ? 'Critical: Short lease term is a significant lender risk. Begin renewal negotiations immediately.'
        : yearsRemaining < 5
        ? 'Lease renewal should be prioritized within 12 months to maintain lender confidence.'
        : `${yearsRemaining.toFixed(1)} years remaining on base lease. Good lender position.`,
      severity: yearsRemaining < 3 ? 'danger' : yearsRemaining < 5 ? 'warning' : 'success',
      storeName: store.name,
    });

    if (lease.monthly_rent && store.monthly_revenue) {
      const rentRatio = ((lease.monthly_rent / store.monthly_revenue) * 100).toFixed(1);
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
        description: `${insurance.length} active ${insurance.length === 1 ? 'policy' : 'policies'}. Premium is ${store.monthly_revenue > 0 ? ((totalPremium / (store.monthly_revenue * 12)) * 100).toFixed(1) + '% of annual revenue.' : 'recorded.'}`,
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
      headline: 'No insurance policies on file',
      description: 'Add your insurance policies to track renewals, coverage gaps, and premium costs.',
      severity: 'warning',
      storeName: store.name,
    });
  }

  // Sort by severity: danger first, then warning, then success, then info
  const order = { danger: 0, warning: 1, success: 2, info: 3 };
  return items
    .sort((a, b) => order[a.severity] - order[b.severity])
    .map((item) => ({ ...item, storeId: String(store.id) }));
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
