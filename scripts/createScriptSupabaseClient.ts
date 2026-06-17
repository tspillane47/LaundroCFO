import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for local CLI scripts. App tables use RLS tied to auth.uid(),
 * so the anon key alone cannot read stores, store_loans, monthly_financials, etc.
 *
 * Set one of:
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS (recommended for admin/debug scripts)
 *   SUPABASE_SCRIPT_EMAIL + SUPABASE_SCRIPT_PASSWORD — signs in as a real user
 */
export async function createScriptSupabaseClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const email = process.env.SUPABASE_SCRIPT_EMAIL;
  const password = process.env.SUPABASE_SCRIPT_PASSWORD;
  if (email && password) {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(`Script auth failed: ${error.message}`);
    }
    return client;
  }

  throw new Error(
    "Scripts need elevated Supabase access because tables are protected by RLS. " +
      "Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase Dashboard → Settings → API), " +
      "or set SUPABASE_SCRIPT_EMAIL and SUPABASE_SCRIPT_PASSWORD to sign in as a user."
  );
}
