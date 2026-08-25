"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/intelligence";
import { IntelligenceFeed } from "@/components/ui/IntelligenceFeed";

const MIN_PANEL_HEIGHT = 240;
const BOTTOM_BUFFER_PX = 8;

function FeedCard({ items }: { items: FeedItem[] }) {
  return (
    <div className="card flex-1 min-h-0 flex flex-col">
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

/**
 * Sticky desktop rail for the store intelligence feed.
 *
 * Height is measured from the aside's top edge to the bottom of main.app-page-content
 * so the panel never extends under the app footer or past the scroll viewport.
 * Overflow lives on the inner feed wrapper — never on the sticky element itself.
 */
export function IntelligenceFeedPanel({ items }: { items: FeedItem[] }) {
  const asideRef = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;

    function measure() {
      const el = asideRef.current;
      if (!el) return;

      const main = el.closest("main.app-page-content") as HTMLElement | null;
      if (!main) return;

      const mainBottom = main.getBoundingClientRect().bottom;
      const asideTop = el.getBoundingClientRect().top;
      const available = Math.floor(mainBottom - asideTop - BOTTOM_BUFFER_PX);
      setPanelHeight(Math.max(MIN_PANEL_HEIGHT, available));
    }

    measure();

    const main = aside.closest("main.app-page-content");
    const resizeObserver = new ResizeObserver(measure);
    if (main) resizeObserver.observe(main);

    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <aside
      ref={asideRef}
      className="hidden xl:block xl:sticky xl:top-4 xl:self-start w-full"
      style={
        panelHeight != null
          ? { height: panelHeight }
          : { height: "calc(100dvh - 9.25rem)" }
      }
      aria-label="Store intelligence feed"
    >
      <div className="h-full min-h-0 flex flex-col">
        <FeedCard items={items} />
      </div>
    </aside>
  );
}
