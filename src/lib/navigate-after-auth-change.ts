/**
 * Full-document navigation after a mutation that changes what middleware
 * would do for a route (onboarding complete, sign-in, etc.).
 *
 * Next.js 15.5's client router reuses a prefetched middleware redirect
 * without re-evaluating middleware (vercel/next.js#88937). router.replace
 * to /portfolio is then a no-op if /portfolio was prefetched while the
 * user was still incomplete. A document load always hits middleware fresh.
 */
export function replaceFullDocument(href: string): void {
  window.location.replace(href);
}
