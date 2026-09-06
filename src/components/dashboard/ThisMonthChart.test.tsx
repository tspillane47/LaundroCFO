/** @vitest-environment happy-dom */

import React, { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildThisMonthChartModel } from "@/lib/thisMonthChart";
import { THIS_MONTH_CHART_HEIGHT } from "@/components/dashboard/ThisMonthChart";

let previewWidth = 800;

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
      const plotHeight = typeof height === "number" ? height : THIS_MONTH_CHART_HEIGHT;
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

import { ThisMonthChart } from "@/components/dashboard/ThisMonthChart";

const SAMPLE_MODEL = buildThisMonthChartModel(
  [
    { transaction_date: "2026-09-01", amount: 400, category: "self_service_revenue" },
    { transaction_date: "2026-09-03", amount: 80, category: "rent" },
    { transaction_date: "2026-09-06", amount: 250, category: "wdf_revenue" },
  ],
  new Date(2026, 8, 6)
);

function mountAtWidth(width: number) {
  previewWidth = width;
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ThisMonthChart model={SAMPLE_MODEL} />);
  });
  return { host, root };
}

describe("ThisMonthChart", () => {
  let roots: Root[] = [];
  let hosts: HTMLElement[] = [];

  beforeEach(() => {
    previewWidth = 800;
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

  it("draws the same glow area/line treatment and stops at today", () => {
    const host = renderAt(900);
    expect(host.textContent).toContain("This Month");
    expect(host.textContent).toContain("September");
    expect(host.textContent).toContain("through Sep 6");
    expect(host.querySelector(".recharts-bar-rectangle")).toBeNull();
    expect(host.querySelector(".recharts-area")).toBeTruthy();
    expect(host.querySelector(".recharts-area-curve")).toBeTruthy();

    const ticks = [...host.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick")].map(
      (tick) => tick.textContent
    );
    expect(ticks).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(ticks).not.toContain("7");
  });

  it("explains how to get daily data when nothing is categorized yet", () => {
    const empty = buildThisMonthChartModel([], new Date(2026, 8, 6));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    hosts.push(host);
    roots.push(root);
    act(() => {
      root.render(<ThisMonthChart model={empty} />);
    });
    expect(host.textContent).toMatch(/Sync or import bank transactions/);
  });
});
