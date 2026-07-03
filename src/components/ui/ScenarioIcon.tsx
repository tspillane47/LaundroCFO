import {
  ArrowUp,
  BriefcaseBusiness,
  Building2,
  Shirt,
  TrendingUp,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ScenarioIconName } from "@/lib/scenarios";

const ICON_MAP: Record<ScenarioIconName, LucideIcon> = {
  Wrench,
  TrendingUp,
  Zap,
  Building2,
  Shirt,
  ArrowUp,
  BriefcaseBusiness,
  Truck,
};

export function ScenarioIcon({
  name,
  size = 14,
  className,
}: {
  name: ScenarioIconName;
  size?: number;
  className?: string;
}) {
  const Icon = ICON_MAP[name];
  return (
    <Icon
      size={size}
      strokeWidth={1.5}
      className={className ?? "flex-shrink-0 text-[var(--text-secondary)]"}
      aria-hidden
    />
  );
}
