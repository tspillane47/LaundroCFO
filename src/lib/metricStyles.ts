import type { CSSProperties } from "react";

/** Font size (px) for metric values — scales down when text exceeds 7 characters. */
export function metricValueFontSize(
  text: string,
  base = 22,
  compact = 18,
  xs = 15,
): number {
  const len = text.length;
  if (len > 10) return xs;
  if (len > 7) return compact;
  return base;
}

export function metricValueStyle(
  text: string,
  options?: { color?: string; base?: number; compact?: number; xs?: number; inheritColor?: boolean },
): CSSProperties {
  const { color, base = 22, compact = 18, xs = 15, inheritColor = false } = options ?? {};
  return {
    fontSize: `${metricValueFontSize(text, base, compact, xs)}px`,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    ...(inheritColor ? {} : { color: color ?? "var(--text-primary)" }),
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
    fontVariantNumeric: "tabular-nums",
  };
}

/** PDF metric tiles use slightly smaller base sizes. */
export function pdfMetricValueFontSize(text: string): number {
  return metricValueFontSize(text, 18, 15, 12);
}
