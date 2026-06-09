"use client";
import { FeedItem } from "@/lib/intelligence";
import Link from "next/link";

const categoryLinks: Record<string, string> = {
  financial: '/financials',
  valuation: '/valuation',
  equipment: '/equipment',
  insurance: '/insurance',
  lease: '/lease',
  portfolio: '/portfolio',
};

const severityStyles = {
  danger: { border: 'border-l-red-500', bg: 'bg-red-500/5', text: 'text-red-400' },
  warning: { border: 'border-l-amber-500', bg: 'bg-amber-500/5', text: 'text-amber-400' },
  success: { border: 'border-l-green-500', bg: 'bg-green-500/5', text: 'text-green-400' },
  info: { border: 'border-l-blue-500', bg: 'bg-blue-500/5', text: 'text-blue-400' },
};

export function IntelligenceFeed({ items, showStoreName = false, maxItems = 20 }: {
  items: FeedItem[];
  showStoreName?: boolean;
  maxItems?: number;
}) {
  const displayed = items.slice(0, maxItems);

  if (displayed.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-2xl mb-2">✅</div>
        <div className="text-sm font-semibold text-green-400">All Clear</div>
        <div className="text-xs text-slate-500 mt-1">No urgent items. Portfolio looks healthy.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayed.map(item => {
        const style = severityStyles[item.severity];
        return (
          <div
            key={item.id}
            className={`border-l-4 ${style.border} ${style.bg} rounded-r-lg p-3 flex items-start gap-3`}
          >
            <span className="text-lg flex-shrink-0 mt-0.5">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {showStoreName && item.storeName && (
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{item.storeName}</div>
                  )}
                  <div className="text-[13px] font-semibold text-slate-100">{item.headline}</div>
                  <div className="text-[12px] text-slate-400 mt-0.5 leading-relaxed">{item.description}</div>
                </div>
                <Link
                  href={categoryLinks[item.category] ?? '/dashboard'}
                  className="text-[11px] text-slate-500 hover:text-slate-300 flex-shrink-0 mt-0.5"
                >
                  View →
                </Link>
              </div>
              <div className="text-[10px] text-slate-600 mt-1.5 flex items-center gap-2">
                <span className={`capitalize ${style.text}`}>{item.category}</span>
                <span>·</span>
                <span>{item.date}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
