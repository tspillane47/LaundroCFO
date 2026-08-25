"use client";

import type { FeedItem } from "@/lib/intelligence";
import { IntelligenceFeed } from "@/components/ui/IntelligenceFeed";

/**
 * Inline (non-sticky) intelligence feed for viewports below xl.
 * Caps height so a long feed cannot dwarf the charts or stretch the page.
 */
export function IntelligenceFeedMobileShell({ items }: { items: FeedItem[] }) {
  return (
    <div className="xl:hidden card flex flex-col max-h-[min(28rem,60dvh)]">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="section-title mb-0">Store Intelligence Feed</div>
        {items.length > 0 && (
          <span className="badge badge-blue text-[10px]">{items.length}</span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <IntelligenceFeed items={items} />
      </div>
    </div>
  );
}
