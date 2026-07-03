"use client";

import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
};

const DURATION_MS = 4000;

const TYPE_STYLES: Record<
  ToastType,
  {
    accent: string;
    glow: string;
    shadow: string;
    border: string;
  }
> = {
  success: {
    accent: "#22c55e",
    glow: "rgba(34, 197, 94, 0.45)",
    shadow: "0 8px 32px rgba(34, 197, 94, 0.22), 0 2px 8px rgba(0, 0, 0, 0.12)",
    border: "rgba(34, 197, 94, 0.55)",
  },
  error: {
    accent: "#ef4444",
    glow: "rgba(239, 68, 68, 0.45)",
    shadow: "0 8px 32px rgba(239, 68, 68, 0.22), 0 2px 8px rgba(0, 0, 0, 0.12)",
    border: "rgba(239, 68, 68, 0.55)",
  },
  info: {
    accent: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.45)",
    shadow: "0 8px 32px rgba(59, 130, 246, 0.22), 0 2px 8px rgba(0, 0, 0, 0.12)",
    border: "rgba(59, 130, 246, 0.55)",
  },
  warning: {
    accent: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.45)",
    shadow: "0 8px 32px rgba(245, 158, 11, 0.22), 0 2px 8px rgba(0, 0, 0, 0.12)",
    border: "rgba(245, 158, 11, 0.55)",
  },
};

function ToastIcon({ type }: { type: ToastType }) {
  if (type === "success") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="1.5"
          className="toast-icon-circle"
        />
        <path
          d="M8 12.5l2.5 2.5L16 9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="toast-icon-stroke"
        />
      </svg>
    );
  }

  if (type === "error") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="1.5"
          className="toast-icon-circle"
        />
        <path
          d="M9 9l6 6M15 9l-6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="toast-icon-stroke"
        />
      </svg>
    );
  }

  if (type === "warning") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3.5L21.5 20H2.5L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          className="toast-icon-stroke"
        />
        <path
          d="M12 9.5v5.5M12 17.5h.01"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="toast-icon-stroke"
        />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="1.5"
        className="toast-icon-circle"
      />
      <path
        d="M12 8v5M12 16h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="toast-icon-stroke"
      />
    </svg>
  );
}

type ToastProps = {
  item: ToastItem;
  index: number;
  onDismiss: (id: string) => void;
};

export function Toast({ item, index, onDismiss }: ToastProps) {
  const styles = TYPE_STYLES[item.type];
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const remainingRef = useRef(DURATION_MS);
  const timerStartRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    setPhase("exiting");
    window.setTimeout(() => onDismiss(item.id), 280);
  }, [item.id, onDismiss]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(() => {
    clearTimer();
    timerStartRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, remainingRef.current);

    const tick = () => {
      const elapsed = Date.now() - timerStartRef.current;
      setProgress(Math.max(0, ((remainingRef.current - elapsed) / DURATION_MS) * 100));
      if (elapsed < remainingRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [clearTimer, dismiss]);

  useEffect(() => {
    scheduleDismiss();
    const enterFallback = window.setTimeout(() => {
      setPhase((current) => (current === "entering" ? "visible" : current));
    }, 450);
    return () => {
      clearTimer();
      window.clearTimeout(enterFallback);
    };
  }, [clearTimer, scheduleDismiss]);

  function handleEnterAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.animationName !== "toast-enter") return;
    setPhase((current) => (current === "entering" ? "visible" : current));
  }

  function handleMouseEnter() {
    if (phase === "exiting") return;
    clearTimer();
    const elapsed = Date.now() - timerStartRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    setPaused(true);
  }

  function handleMouseLeave() {
    if (phase === "exiting" || remainingRef.current <= 0) return;
    setPaused(false);
    scheduleDismiss();
  }

  return (
    <div
      className="absolute top-0 right-0 w-full"
      style={{
        transform: `translateY(${index * 12}px) scale(${Math.max(0.88, 1 - index * 0.04)})`,
        zIndex: 100 - index,
        opacity: index > 3 ? 0 : 1 - index * 0.06,
        pointerEvents: index > 0 ? "none" : "auto",
      }}
    >
      <div
        className={clsx(
          "toast-item toast-visible",
          phase === "entering" && "toast-enter",
          phase === "exiting" && "toast-exit"
        )}
        role="status"
        aria-live="polite"
        onAnimationEnd={handleEnterAnimationEnd}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
      <div
        className="relative overflow-hidden rounded-[12px] backdrop-blur-xl"
        style={{
          background: "var(--toast-bg)",
          border: `1px solid ${styles.border}`,
          boxShadow: `var(--toast-shadow), ${styles.shadow}, 0 0 0 1px ${styles.glow} inset`,
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none rounded-[12px] opacity-40"
          style={{
            background: `radial-gradient(ellipse at top left, ${styles.glow}, transparent 70%)`,
          }}
        />

        <div className="relative flex items-start gap-3 px-4 py-3.5 pr-9">
          <div
            className="flex-shrink-0 mt-0.5 toast-icon"
            style={{ color: styles.accent }}
          >
            <ToastIcon type={item.type} />
          </div>
          <p
            className="text-[13px] font-medium leading-snug flex-1"
            style={{ color: "var(--toast-text)" }}
          >
            {item.message}
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="toast-dismiss absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-md opacity-0 transition-opacity duration-200 hover:bg-[var(--bg-card2)]"
            style={{ color: "var(--toast-text-muted)" }}
            aria-label="Dismiss notification"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2 2l8 8M10 2L2 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div
          className="h-[2px] w-full"
          style={{ background: "var(--toast-progress-track)" }}
        >
          <div
            className="h-full transition-none"
            style={{
              width: `${progress}%`,
              backgroundColor: styles.accent,
              opacity: paused ? 0.6 : 1,
            }}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

type ToastViewportProps = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || toasts.length === 0) return null;

  const stackHeight = 80 + Math.max(0, toasts.length - 1) * 12;

  return createPortal(
    <div
      className="fixed top-4 right-4 z-[9999] pointer-events-none w-[min(360px,calc(100vw-2rem))]"
      style={{ height: stackHeight }}
      aria-label="Notifications"
    >
      {toasts.map((toast, index) => (
        <Toast key={toast.id} item={toast} index={index} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}
