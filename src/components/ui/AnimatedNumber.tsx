"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  style?: CSSProperties;
}

export function AnimatedNumber({
  value, duration = 1200, prefix = '', suffix = '', decimals = 0, className, style
}: AnimatedNumberProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const showPlaceholder = !Number.isFinite(value);
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (showPlaceholder) return;
    const startValue = prevValue.current;
    const endValue = safeValue;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;
      setDisplayValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevValue.current = endValue;
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [safeValue, duration, showPlaceholder]);

  if (showPlaceholder) {
    return (
      <span className={className} style={style}>
        —
      </span>
    );
  }

  const formatted = decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue).toLocaleString();

  return (
    <span className={className} style={style}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
