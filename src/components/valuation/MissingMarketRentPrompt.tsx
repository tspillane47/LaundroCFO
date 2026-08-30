import Link from "next/link";
import { MISSING_OWNER_OCCUPIED_MARKET_RENT_PROMPT } from "@/lib/getStoreValuation";

export function MissingMarketRentPrompt({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "hero" | "inline";
}) {
  const color =
    variant === "hero" ? "rgba(255,255,255,0.75)" : "var(--text-secondary)";
  return (
    <p className={className} style={{ color, fontSize: variant === "inline" ? 12 : 13 }}>
      {MISSING_OWNER_OCCUPIED_MARKET_RENT_PROMPT}.{" "}
      <Link href="/lease" className="underline underline-offset-2 hover:text-sky-300">
        Add market rent →
      </Link>
    </p>
  );
}
