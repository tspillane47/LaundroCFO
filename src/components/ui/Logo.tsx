import clsx from "clsx";
import Link from "next/link";
import { WashingMachineIcon } from "@/components/ui/WashingMachineIcon";

interface LogoProps {
  variant?: "marketing" | "sidebar" | "wordmark";
  iconSize?: number;
  className?: string;
}

const MARKETING_ACCENT_CLASS = "text-[var(--text-success)]";
const BRAND_ACCENT_CLASS = "text-[var(--accent-blue)]";

/** White "Laundro" + blue "CFO" — shared by sidebar, marketing nav, footer, and mock UI. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx("font-bold tracking-tight leading-none", className)}>
      <span className="text-[var(--text-primary)]">Laundro</span>
      <span className={BRAND_ACCENT_CLASS}>CFO</span>
    </span>
  );
}

export function Logo({ variant = "marketing", iconSize, className }: LogoProps) {
  const size = iconSize ?? (variant === "sidebar" ? 20 : 24);
  const isSidebar = variant === "sidebar";
  const isWordmark = variant === "wordmark";

  const wordmark = isWordmark ? (
    <Wordmark className={className} />
  ) : (
    <span
      className={clsx(
        "font-bold tracking-tight leading-none",
        isSidebar && "sidebar-brand-text",
        isSidebar ? "text-[15px]" : "text-[18px]"
      )}
      style={isSidebar ? { letterSpacing: "-0.01em" } : undefined}
    >
      <span
        className={clsx(
          variant === "marketing" ? "text-white" : "text-[var(--text-primary)]"
        )}
      >
        Laundro
      </span>
      <span className={isSidebar ? BRAND_ACCENT_CLASS : MARKETING_ACCENT_CLASS}>CFO</span>
    </span>
  );

  if (isWordmark) {
    return wordmark;
  }

  const content = (
    <div className={clsx("inline-flex items-center gap-2", className)}>
      {!isSidebar && (
        <WashingMachineIcon size={size} className={clsx("flex-shrink-0", MARKETING_ACCENT_CLASS)} />
      )}
      {wordmark}
    </div>
  );

  if (isSidebar) {
    return (
      <Link href="/portfolio" className="inline-block hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
