/** @vitest-environment happy-dom */

import React, { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildYearRevenueEbitdaChartData,
  YEAR_CHART_HEIGHT,
  YEAR_CHART_MIN_WIDTH,
} from "@/lib/yearRevenueEbitdaChart";

let previewWidth = 1100;

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
      height,
    }: {
      children?: ReactNode;
      height?: number | string;
    }) => {
      const plotHeight = typeof height === "number" ? height : YEAR_CHART_HEIGHT;
      return (
        <div style={{ width: previewWidth, height: plotHeight }}>
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child as ReactElement<{ width?: number; height?: number }>, {
                  width: previewWidth,
                  height: plotHeight,
                })
              : child
          )}
        </div>
      );
    },
  };
});

import { YearRevenueEbitdaChart } from "@/components/financials/YearRevenueEbitdaChart";

const SAMPLE_DATA = buildYearRevenueEbitdaChartData([
  { revenue: 18400, ebitda: 4200 },
  { revenue: 17600, ebitda: 3900 },
  { revenue: 19200, ebitda: -1100 },
  { revenue: 16800, ebitda: 3600 },
  { revenue: 20100, ebitda: 5100 },
  { revenue: 18800, ebitda: 4400 },
]);

function mountAtWidth(width: number) {
  previewWidth = width;
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<YearRevenueEbitdaChart year={2026} data={SAMPLE_DATA} />);
  });
  return { host, root };
}

describe("YearRevenueEbitdaChart", () => {
  let roots: Root[] = [];
  let hosts: HTMLElement[] = [];

  beforeEach(() => {
    previewWidth = 1100;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => {
      for (const root of roots) root.unmount();
    });
    for (const host of hosts) host.remove();
    roots = [];
    hosts = [];
  });

  function renderAt(width: number) {
    const mounted = mountAtWidth(width);
    roots.push(mounted.root);
    hosts.push(mounted.host);
    return mounted.host;
  }

  it("uses a fixed 360px plot at a desktop width and keeps all 12 month ticks", () => {
    const host = renderAt(1280);
    const plot = host.querySelector("[style*='min-width']") as HTMLElement | null;
    expect(plot).toBeTruthy();
    expect(plot?.style.height).toBe(`${YEAR_CHART_HEIGHT}px`);
    expect(plot?.style.minWidth).toBe(`${YEAR_CHART_MIN_WIDTH}px`);

    const ticks = [...host.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick")].map(
      (tick) => tick.textContent
    );
    expect(ticks).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  });

  it("draws bars only for months with data and keeps later months blank", () => {
    const host = renderAt(1280);
    const drawn = host.querySelectorAll(".recharts-bar-rectangle path, .recharts-bar-rectangle rect");
    const blankSlots = [...host.querySelectorAll(".recharts-bar-rectangle")].filter(
      (node) => node.childElementCount === 0
    );
    expect(drawn.length).toBe(12);
    expect(blankSlots).toHaveLength(12);

    const labels = [...host.querySelectorAll("text")]
      .map((node) => node.textContent ?? "")
      .filter((text) => text.includes("$") || text.includes("k"));
    expect(labels).toContain("$18k");
    expect(labels).toContain("-$1k");
    expect(labels.filter((label) => label === "$0")).toHaveLength(0);
  });

  it("keeps the same 360px plot height at a phone-sized wrapper", () => {
    const host = renderAt(390);
    const plot = host.querySelector("[style*='min-width']") as HTMLElement | null;
    expect(plot?.style.height).toBe(`${YEAR_CHART_HEIGHT}px`);
    expect(plot?.style.minWidth).toBe(`${YEAR_CHART_MIN_WIDTH}px`);
    expect(host.querySelector(".overflow-x-auto")).toBeTruthy();
  });
});
