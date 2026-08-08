"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { getMarketingSignupCtaLabel } from "@/lib/marketingCta";
import { useBetaMode } from "@/lib/useBetaMode";

type MarketingSignupCtaProps = {
  className?: string;
  style?: CSSProperties;
  withArrow?: boolean;
  onClick?: () => void;
};

export function MarketingSignupCta({ className, style, withArrow = false, onClick }: MarketingSignupCtaProps) {
  const { betaMode } = useBetaMode();

  return (
    <Link href="/signup" className={className} style={style} onClick={onClick}>
      {getMarketingSignupCtaLabel(betaMode, withArrow)}
    </Link>
  );
}
