import Link from "next/link";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  icon?: string;
}

function resolveIcon(name: string): LucideIcon | null {
  const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
  return icons[name] ?? null;
}

export function EmptyState({ title, description, ctaLabel, ctaHref, icon }: EmptyStateProps) {
  const Icon = icon ? resolveIcon(icon) : null;

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
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="btn-primary inline-flex text-[13px]">
          {ctaLabel} →
        </Link>
      )}
    </div>
  );
}
