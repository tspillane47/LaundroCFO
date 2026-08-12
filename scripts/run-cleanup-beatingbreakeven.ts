/**
 * Executes scripts/cleanup-beatingbreakeven.sql against production via service role.
 * Run: set -a && source .env.local && set +a && npx tsx scripts/run-cleanup-beatingbreakeven.ts
 */
import { createScriptSupabaseClient } from "./createScriptSupabaseClient";

const USER_ID = "072cd1e3-0988-4c83-b071-29f93cbe997e";
const STORE_ID = "82b66d93-128e-4b11-a569-5e2b179e3e61";
const STORE_NAME = "beatingbreakeven LLC";
const SUBSCRIPTION_ID = "720abade-4f2f-4b66-a7f1-e58632204c06";

async function main() {
  const admin = await createScriptSupabaseClient();

  console.log("=== Pre-flight ===");

  const { data: storeBefore, error: storeBeforeError } = await admin
    .from("stores")
    .select("id, name, user_id, created_at")
    .eq("id", STORE_ID)
    .eq("user_id", USER_ID)
    .eq("name", STORE_NAME)
    .maybeSingle();
  if (storeBeforeError) throw storeBeforeError;
  console.log("store:", storeBefore);

  const { data: subBefore, error: subBeforeError } = await admin
    .from("subscriptions")
    .select("id, user_id, status, plan, stripe_subscription_id, trial_ends_at, created_at")
    .eq("user_id", USER_ID)
    .eq("id", SUBSCRIPTION_ID)
    .eq("status", "trialing")
    .is("stripe_subscription_id", null)
    .maybeSingle();
  if (subBeforeError) throw subBeforeError;
  console.log("subscription:", subBefore);

  const { data: profileBefore, error: profileBeforeError } = await admin
    .from("profiles")
    .select("id, onboarding_path, onboarding_completed")
    .eq("id", USER_ID)
    .maybeSingle();
  if (profileBeforeError) throw profileBeforeError;
  console.log("profile:", profileBefore);

  if (!storeBefore) {
    console.log("Store already deleted — skipping store DELETE.");
  } else {
    const { data: deletedStore, error: deleteStoreError } = await admin
      .from("stores")
      .delete()
      .eq("id", STORE_ID)
      .eq("user_id", USER_ID)
      .eq("name", STORE_NAME)
      .select("id, name")
      .maybeSingle();
    if (deleteStoreError) throw deleteStoreError;
    console.log("deleted store:", deletedStore);
  }

  if (!subBefore) {
    console.log("Subscription already deleted — skipping subscription DELETE.");
  } else {
    const { data: deletedSub, error: deleteSubError } = await admin
      .from("subscriptions")
      .delete()
      .eq("user_id", USER_ID)
      .eq("id", SUBSCRIPTION_ID)
      .eq("status", "trialing")
      .is("stripe_subscription_id", null)
      .select("id, status")
      .maybeSingle();
    if (deleteSubError) throw deleteSubError;
    console.log("deleted subscription:", deletedSub);
  }

  console.log("\n=== Post-flight ===");

  const { data: storesAfter, error: storesAfterError } = await admin
    .from("stores")
    .select("id, name")
    .eq("user_id", USER_ID);
  if (storesAfterError) throw storesAfterError;
  console.log("stores for user:", storesAfter);

  const { data: subAfter, error: subAfterError } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (subAfterError) throw subAfterError;
  console.log("subscription for user:", subAfter ?? null);

  if ((storesAfter?.length ?? 0) > 0 || subAfter) {
    throw new Error("Cleanup incomplete — store or subscription still present.");
  }

  console.log("\nCleanup complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
