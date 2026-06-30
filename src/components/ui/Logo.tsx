import clsx from "clsx";
import { WashingMachineIcon } from "@/components/ui/WashingMachineIcon";

interface LogoProps {
  variant?: "marketing" | "sidebar";
  iconSize?: number;
  className?: string;
}

const ACCENT_CLASS = "text-emerald-400 dark:text-blue-400";

export function Logo({ variant = "marketing", iconSize, className }: LogoProps) {
  const size = iconSize ?? (variant === "sidebar" ? 20 : 24);

  return (
    <div className={clsx("inline-flex items-center gap-2", className)}>
      <WashingMachineIcon size={size} className={clsx("flex-shrink-0", ACCENT_CLASS)} />
      <span
        className={clsx(
          "font-bold tracking-tight leading-none",
          variant === "sidebar" && "sidebar-brand-text",
          variant === "sidebar" ? "text-[15px]" : "text-[18px]"
        )}
        style={variant === "sidebar" ? { letterSpacing: "-0.01em" } : undefined}
      >
        <span
          className={clsx(
            variant === "marketing" ? "text-white" : "text-[var(--text-primary)]"
          )}
        >
          Laundro
        </span>
        <span className={ACCENT_CLASS}>CFO</span>
      </span>
    </div>
  );
}
