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
  /** When provided (e.g. from a server-rendered marketing page), skips waiting on client fetch. */
  betaMode?: boolean;
};

export function MarketingSignupCta({
  className,
  style,
  withArrow = false,
  onClick,
  betaMode: betaModeProp,
}: MarketingSignupCtaProps) {
  const { betaMode: betaModeHook } = useBetaMode();
  const betaMode = betaModeProp ?? betaModeHook;

  return (
    <Link href="/signup" className={className} style={style} onClick={onClick}>
      {getMarketingSignupCtaLabel(betaMode, withArrow)}
    </Link>
  );
}
