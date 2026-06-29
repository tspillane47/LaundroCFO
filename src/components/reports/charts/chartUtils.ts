export const PDF_CHART = {
  navy: "#0f1e3d",
  slate600: "#475569",
  slate400: "#374151",
  slate200: "#e2e8f0",
  blue: "#3b82f6",
  blueDark: "#1d4ed8",
  green: "#22c55e",
  greenDark: "#15803d",
  amber: "#f59e0b",
  red: "#ef4444",
  white: "#ffffff",
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function formatAxisCurrency(value: number): string {
  if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${Math.round(value)}`;
}

export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function benchmarkPositionPct(
  store: number,
  min: number,
  max: number
): number {
  if (max === min) return 50;
  return clamp(((store - min) / (max - min)) * 100, 0, 100);
}

export function benchmarkStatusColor(
  store: number,
  top25: number,
  bottom25: number,
  lowerIsBetter: boolean
): string {
  const isGood = lowerIsBetter ? store <= top25 : store >= top25;
  const isBad = lowerIsBetter ? store >= bottom25 : store <= bottom25;
  if (isGood) return PDF_CHART.greenDark;
  if (isBad) return PDF_CHART.red;
  return PDF_CHART.amber;
}

export const CATEGORY_COLORS = [
  "#1e3a8a",
  "#1d4ed8",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#334155",
  "#475569",
  "#64748b",
  "#374151",
  "#374151",
  "#0f766e",
  "#059669",
  "#10b981",
  "#6b7280",
  "#78716c",
];
