import "server-only";

import { fetchBetaModeSetting } from "@/lib/beta";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/** ISR window for public marketing pages that read beta_mode server-side. Keep in sync with `revalidate` exports on marketing pages. */
export const MARKETING_REVALIDATE_SECONDS = 60;

/** Server-side beta_mode for public marketing pages — revalidated every MARKETING_REVALIDATE_SECONDS. */
export async function getPublicBetaMode(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  return fetchBetaModeSetting(supabase);
}
