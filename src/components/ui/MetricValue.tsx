"use client";

import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { metricValueFontSize } from "@/lib/metricStyles";

type MetricValueProps = {
  children: ReactNode;
  className?: string;
  color?: string;
  base?: number;
  compact?: number;
  xs?: number;
  title?: string;
};

export function MetricValue({
  children,
  className,
  color,
  base = 22,
  compact = 18,
  xs = 15,
  title,
}: MetricValueProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(base);
  const [tooltip, setTooltip] = useState<string | undefined>(title);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const text = el.textContent?.trim() ?? "";
    setFontSize(metricValueFontSize(text, base, compact, xs));
    if (!title) {
      setTooltip(el.scrollWidth > el.clientWidth ? text : undefined);
    }
  }, [children, base, compact, xs, title]);

  return (
    <div
      ref={ref}
      className={clsx("tabular-nums", className)}
      style={{
        fontSize: `${fontSize}px`,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        color: color ?? "var(--text-primary)",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
      }}
      title={tooltip}
    >
      {children}
    </div>
  );
}
