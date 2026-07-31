/**
 * One-off cleanup: remove stale duplicate onboarding equipment rows for
 * Waterbury Laundromat (ltspillane@aol.com).
 *
 * Keeps the 23:46:57 batch (user's final intent, high_speed_extract=true on washers).
 * Removes the 23:46:49 batch (stale first submission).
 *
 * Usage (requires SUPABASE_SERVICE_ROLE_KEY in .env.local):
 *   npx tsx scripts/cleanup-waterbury-onboarding-equipment-duplicates.ts
 *   npx tsx scripts/cleanup-waterbury-onboarding-equipment-duplicates.ts --execute
 */
import { createScriptSupabaseClient } from "./createScriptSupabaseClient";

const STORE_ID = "ec20b2ce-2951-4cf0-9e1c-cf5ee53bb056";

/** Rows from batch 2026-07-30T23:46:49.120613 — stale duplicate submission. */
const ROWS_TO_DELETE = [
  "aefc8c7d-f229-4e17-8ec6-10675570f9d7", // Washer Mixed qty=21, 200G=false
  "868d4df8-2a28-4eaf-b25e-f7bbf1522a71", // Dryer  Mixed qty=16
] as const;

/** Rows from batch 2026-07-30T23:46:57.007118 — kept (final intent). */
const ROWS_TO_KEEP = [
  "4a770e2f-98cc-40df-bdf7-9e06fc8a7797", // Washer Mixed qty=21, 200G=true
  "c886e8ec-36ba-494e-90f5-df15c91e06fb", // Dryer  Mixed qty=16
] as const;

async function main() {
  const execute = process.argv.includes("--execute");
  const supabase = await createScriptSupabaseClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, washers, dryers")
    .eq("id", STORE_ID)
    .single();
  if (storeError || !store) {
    throw new Error(`Store not found: ${storeError?.message ?? STORE_ID}`);
  }

  const { data: allRows, error: fetchError } = await supabase
    .from("equipment_inventory")
    .select("id, machine_type, machine_size, quantity, high_speed_extract, created_at")
    .eq("store_id", STORE_ID)
    .order("created_at", { ascending: true });
  if (fetchError) throw fetchError;

  console.log(`Store: ${store.name} (${store.id})`);
  console.log(`Current equipment rows (${allRows?.length ?? 0}):`);
  for (const row of allRows ?? []) {
    const action = ROWS_TO_DELETE.includes(row.id as (typeof ROWS_TO_DELETE)[number])
      ? "DELETE"
      : ROWS_TO_KEEP.includes(row.id as (typeof ROWS_TO_KEEP)[number])
        ? "KEEP"
        : "UNEXPECTED";
    console.log(
      `  [${action}] ${row.id} | ${row.machine_type} ${row.machine_size} qty=${row.quantity} 200G=${row.high_speed_extract} | ${row.created_at}`
    );
  }

  const unexpected = (allRows ?? []).filter(
    (r) =>
      !ROWS_TO_DELETE.includes(r.id as (typeof ROWS_TO_DELETE)[number]) &&
      !ROWS_TO_KEEP.includes(r.id as (typeof ROWS_TO_KEEP)[number])
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Aborting: found ${unexpected.length} unexpected row(s). Re-verify IDs before deleting.`
    );
  }

  if (!execute) {
    console.log("\nDry run only. Re-run with --execute to delete the two stale rows.");
    console.log("\nEquivalent SQL:");
    console.log(
      `DELETE FROM equipment_inventory WHERE id IN ('${ROWS_TO_DELETE.join("', '")}');`
    );
    return;
  }

  const { error: deleteError, count } = await supabase
    .from("equipment_inventory")
    .delete({ count: "exact" })
    .in("id", [...ROWS_TO_DELETE]);

  if (deleteError) throw deleteError;
  console.log(`\nDeleted ${count ?? 0} row(s).`);

  const { data: remaining } = await supabase
    .from("equipment_inventory")
    .select("id, machine_type, quantity, high_speed_extract, created_at")
    .eq("store_id", STORE_ID);
  console.log("Remaining rows:", remaining?.length ?? 0);
  for (const row of remaining ?? []) {
    console.log(
      `  ${row.id} | ${row.machine_type} qty=${row.quantity} 200G=${row.high_speed_extract} | ${row.created_at}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
