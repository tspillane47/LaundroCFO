/** Signup CTA copy for public marketing pages, keyed off beta_mode. */
export function getMarketingSignupCtaLabel(betaMode: boolean, withArrow = false): string {
  const label = betaMode ? "Get Started Free" : "Start Free Trial";
  return withArrow ? `${label} →` : label;
}

/** Hash link to the home page features section (shared by nav + footer). */
export const MARKETING_FEATURES_HREF = "/#features";
