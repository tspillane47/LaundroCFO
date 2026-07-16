"use client";

import { useEffect, useRef, useState } from "react";
import { LoanCalculator, type LoanCalculatorProps } from "@/components/debt/LoanCalculator";

const MIN_PANEL_HEIGHT = 240;
const BOTTOM_BUFFER_PX = 8;

/**
 * Sticky desktop panel for the loan calculator.
 *
 * Height is measured from the aside's top edge to the bottom of main.app-page-content
 * so the panel never extends under the app footer or past the scroll viewport.
 * Overflow lives on the inner wrapper — never on the sticky element itself.
 */
export function LoanCalculatorPanel(props: LoanCalculatorProps) {
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
      aria-label="Loan calculator"
    >
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <LoanCalculator {...props} displayMode="panel" />
      </div>
    </aside>
  );
}
