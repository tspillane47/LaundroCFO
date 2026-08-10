/** Signup CTA copy for public marketing pages, keyed off beta_mode. */
export function getMarketingSignupCtaLabel(betaMode: boolean, withArrow = false): string {
  const label = betaMode ? "Get Started Free" : "Start Free Trial";
  return withArrow ? `${label} →` : label;
}

export function getMarketingHeroBadge(betaMode: boolean): string {
  return betaMode ? "Now in Beta — Free Access" : "14-Day Free Trial";
}

export function getMarketingHeroSubcopy(betaMode: boolean): string {
  return betaMode
    ? "No credit card required · Free during beta · Cancel anytime"
    : "No credit card required · 14-day free trial · Cancel anytime";
}

export function getMarketingBottomSubcopy(betaMode: boolean): string {
  return betaMode
    ? "Free during beta. No credit card required."
    : "Start your free trial. No credit card required.";
}

/** Hash link to the home page features section (shared by nav + footer). */
export const MARKETING_FEATURES_HREF = "/#features";
