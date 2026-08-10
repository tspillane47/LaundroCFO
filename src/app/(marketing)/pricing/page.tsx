import { getPublicBetaMode } from "@/lib/beta-server";
import { PricingPageClient } from "./PricingPageClient";

/** Revalidate beta-dependent marketing copy every 60s (see MARKETING_REVALIDATE_SECONDS). */
export const revalidate = 60;

export default async function PricingPage() {
  const betaMode = await getPublicBetaMode();
  return <PricingPageClient betaMode={betaMode} />;
}
