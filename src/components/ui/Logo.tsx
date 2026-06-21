import clsx from "clsx";
import { WashingMachineIcon } from "@/components/ui/WashingMachineIcon";

const BRAND_BLUE = "#3b82f6";

interface LogoProps {
  variant?: "marketing" | "sidebar";
  iconSize?: number;
  className?: string;
}

export function Logo({ variant = "marketing", iconSize, className }: LogoProps) {
  const size = iconSize ?? (variant === "sidebar" ? 32 : 28);

  return (
    <div className={clsx("inline-flex items-center gap-2", className)}>
      <WashingMachineIcon size={size} color={BRAND_BLUE} />
      <span
        className={clsx(
          "font-bold tracking-tight",
          variant === "sidebar" ? "text-[15px]" : "text-[18px]"
        )}
        style={variant === "sidebar" ? { letterSpacing: "-0.01em" } : undefined}
      >
        <span
          className={clsx(
            variant === "marketing"
              ? "text-white"
              : "text-[var(--text-primary)] dark:text-white"
          )}
        >
          Laundro
        </span>
        <span style={{ color: BRAND_BLUE }}>CFO</span>
      </span>
    </div>
  );
}
