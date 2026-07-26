import clsx from "clsx";
import Link from "next/link";
import { WashingMachineIcon } from "@/components/ui/WashingMachineIcon";

interface LogoProps {
  variant?: "marketing" | "sidebar";
  iconSize?: number;
  className?: string;
}

const MARKETING_ACCENT_CLASS = "text-[var(--text-success)]";
const SIDEBAR_ACCENT_CLASS = "text-[var(--accent-blue)]";

export function Logo({ variant = "marketing", iconSize, className }: LogoProps) {
  const size = iconSize ?? (variant === "sidebar" ? 20 : 24);
  const isSidebar = variant === "sidebar";

  const wordmark = (
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
      <span className={isSidebar ? SIDEBAR_ACCENT_CLASS : MARKETING_ACCENT_CLASS}>CFO</span>
    </span>
  );

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
