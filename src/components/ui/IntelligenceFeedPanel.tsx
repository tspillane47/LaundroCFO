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

function visibleGridSibling(aside: HTMLElement): HTMLElement | null {
  const parent = aside.parentElement;
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    if (child === aside) continue;
    const el = child as HTMLElement;
    if (el.offsetParent === null) continue;
    return el;
  }
  return null;
}

/**
 * Sticky desktop rail for the store intelligence feed.
 *
 * In document flow the rail matches the left column so it fills the grid row
 * (the leftover-viewport measure at mount is much shorter than the charts).
 * Once sticky, height is clamped from the aside's top edge to the nearer of
 * main.app-page-content's visible bottom or the grid row bottom, so it never
 * extends under the app footer. Overflow lives on the inner feed wrapper.
 */
export function IntelligenceFeedPanel({ items }: { items: FeedItem[] }) {
  const asideRef = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;

    const main = aside.closest("main.app-page-content") as HTMLElement | null;
    const leftCol = visibleGridSibling(aside);
    let raf = 0;

    function measure() {
      const el = asideRef.current;
      if (!el) return;

      const scrollMain = el.closest("main.app-page-content") as HTMLElement | null;
      if (!scrollMain) return;

      const mainRect = scrollMain.getBoundingClientRect();
      const asideTop = el.getBoundingClientRect().top;
      const parent = el.parentElement;
      const parentBottom = parent?.getBoundingClientRect().bottom ?? mainRect.bottom;
      const clampBottom = Math.min(mainRect.bottom, parentBottom);
      const availableViewport = Math.floor(clampBottom - asideTop - BOTTOM_BUFFER_PX);

      const sibling = visibleGridSibling(el);
      const leftHeight = sibling ? Math.floor(sibling.getBoundingClientRect().height) : 0;

      const stickyOffset = Number.parseFloat(getComputedStyle(el).top) || 16;
      const isPinned = asideTop <= mainRect.top + stickyOffset + 2;

      const next = isPinned
        ? Math.max(MIN_PANEL_HEIGHT, availableViewport)
        : Math.max(MIN_PANEL_HEIGHT, leftHeight || availableViewport);

      setPanelHeight(next);
    }

    function onScrollOrResize() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    }

    measure();

    const resizeObserver = new ResizeObserver(onScrollOrResize);
    if (main) resizeObserver.observe(main);
    if (leftCol) resizeObserver.observe(leftCol);

    main?.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      main?.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  return (
    <aside
      ref={asideRef}
      className="hidden xl:block xl:sticky xl:top-4 xl:self-start w-full"
      style={panelHeight != null ? { height: panelHeight } : { minHeight: MIN_PANEL_HEIGHT }}
      aria-label="Store intelligence feed"
    >
      <div className="h-full min-h-0 flex flex-col">
        <FeedCard items={items} />
      </div>
    </aside>
  );
}
