"use client";
import { useEffect, useState } from "react";

interface ValueChangeIndicatorProps {
  value: number;
  formatFn?: (delta: number) => string;
}

export function ValueChangeIndicator({ value, formatFn }: ValueChangeIndicatorProps) {
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prevValue !== null && prevValue !== value) {
      const change = value - prevValue;
      setDelta(change);
      setVisible(true);
      setPrevValue(value);
      const timer = setTimeout(() => setVisible(false), 2800);
      return () => clearTimeout(timer);
    }
    if (prevValue === null) {
      setPrevValue(value);
    }
  }, [value, prevValue]);

  if (!visible || delta === null || delta === 0) return null;

  const isPositive = delta > 0;
  const format = formatFn ?? ((d: number) => '$' + Math.abs(Math.round(d)).toLocaleString());

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '13px',
        fontWeight: 600,
        color: isPositive ? 'var(--text-success)' : 'var(--text-danger)',
        background: isPositive ? 'var(--bg-success-tint)' : 'var(--bg-danger-tint)',
        padding: '3px 10px',
        borderRadius: '20px',
        marginLeft: '10px',
        animation: 'fadeInOut 2.8s ease-in-out',
      }}
    >
      {isPositive ? '↑' : '↓'} {isPositive ? '+' : '-'}{format(Math.abs(delta))}
    </span>
  );
}
