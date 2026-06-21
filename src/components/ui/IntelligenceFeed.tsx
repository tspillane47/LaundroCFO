"use client";
import { FeedItem } from "@/lib/intelligence";
import Link from "next/link";

const categoryLinks: Record<string, string> = {
  financial: "/financials",
  valuation: "/valuation",
  equipment: "/equipment",
  insurance: "/insurance",
  lease: "/lease",
  portfolio: "/portfolio",
};

const categoryLabels: Record<string, string> = {
  financial: "FIN",
  valuation: "VAL",
  equipment: "EQP",
  insurance: "INS",
  lease: "LSE",
  portfolio: "PRT",
};

const severityStyles = {
  danger: { border: "border-l-red-500", bg: "bg-red-500/5", text: "text-red-400" },
  warning: { border: "border-l-amber-500", bg: "bg-amber-500/5", text: "text-amber-400" },
  success: { border: "border-l-green-500", bg: "bg-green-500/5", text: "text-green-400" },
  info: { border: "border-l-blue-500", bg: "bg-blue-500/5", text: "text-adaptive-info" },
};

export function IntelligenceFeed({
  items,
  showStoreName = false,
  maxItems = 20,
}: {
  items: FeedItem[];
  showStoreName?: boolean;
  maxItems?: number;
}) {
  const displayed = items.slice(0, maxItems);

  if (displayed.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          All Clear
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          No urgent items. Portfolio looks healthy.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayed.map((item) => {
        const style = severityStyles[item.severity];
        const catLabel = categoryLabels[item.category] ?? item.category.slice(0, 3).toUpperCase();
        return (
          <div
            key={item.id}
            className={`border-l-4 ${style.border} ${style.bg} rounded-r-lg p-3 flex items-start gap-3`}
          >
            <span
              style={{
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                width: "28px",
                flexShrink: 0,
                marginTop: "2px",
              }}
              className={style.text}
            >
              {catLabel}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {showStoreName && item.storeName && (
                    <div
                      className="text-[10px] uppercase tracking-wider mb-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {item.storeName}
                    </div>
                  )}
                  <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {item.headline}
                  </div>
                  <div
                    className="text-[12px] mt-0.5 leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {item.description}
                  </div>
                </div>
                <Link
                  href={categoryLinks[item.category] ?? "/dashboard"}
                  className="text-[11px] flex-shrink-0 mt-0.5 hover:underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  View
                </Link>
              </div>
              <div
                className="text-[10px] mt-1.5 flex items-center gap-2"
                style={{ color: "var(--text-muted)" }}
              >
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
