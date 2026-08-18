"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  ctaLabel?: string;
  /** Navigate to another page. Avoid using the current route — prefer onCtaClick or cta. */
  ctaHref?: string;
  /** In-page action (opens a form, file picker, etc.). Renders a button instead of a Link. */
  onCtaClick?: () => void;
  /** Fully custom CTA (e.g. wrapped in ReadOnlyGuard). Takes precedence over other CTA props. */
  cta?: ReactNode;
  icon?: string;
}

function resolveIcon(name: string): LucideIcon | null {
  const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
  return icons[name] ?? null;
}

function normalizePath(path: string): string {
  const base = path.split("?")[0]?.split("#")[0] ?? path;
  return base.replace(/\/$/, "") || "/";
}

function isSelfReferencingHref(href: string, pathname: string): boolean {
  return normalizePath(href) === normalizePath(pathname);
}

const CTA_BUTTON_CLASS = "btn-primary inline-flex text-[13px]";

export function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
  onCtaClick,
  cta,
  icon,
}: EmptyStateProps) {
  const pathname = usePathname();
  const Icon = icon ? resolveIcon(icon) : null;

  function renderCta(): ReactNode {
    if (cta) return cta;
    if (!ctaLabel) return null;

    if (onCtaClick) {
      return (
        <button type="button" onClick={onCtaClick} className={CTA_BUTTON_CLASS}>
          {ctaLabel} →
        </button>
      );
    }

    if (ctaHref) {
      if (isSelfReferencingHref(ctaHref, pathname)) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[EmptyState] ctaHref="${ctaHref}" matches the current route (${pathname}). ` +
              "Use onCtaClick or cta for in-page actions instead of a self-link."
          );
        }
        return null;
      }

      return (
        <Link href={ctaHref} className={CTA_BUTTON_CLASS}>
          {ctaLabel} →
        </Link>
      );
    }

    return null;
  }

  const ctaNode = renderCta();

  return (
    <div className="card text-center py-12 px-6">
      {Icon && (
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
        >
          <Icon size={22} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
        </div>
      )}
      <h2 className="text-[16px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p className="text-[13px] max-w-md mx-auto mb-6" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>
      {ctaNode}
    </div>
  );
}
