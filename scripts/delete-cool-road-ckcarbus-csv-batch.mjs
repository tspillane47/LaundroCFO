/**
 * Delete the unposted Sept 4 CKCARBUS CSV batch for 7 Cool Road LLC.
 * Dry-run by default; pass --execute to delete.
 */
import { createClient } from "@supabase/supabase-js";

const STORE_ID = "7c6477c6-005f-4b29-b1c0-3af7d105abe6";
const DESCRIPTION = "CKCARBUS        0001";
const CREATED_AT_START = "2026-09-04T10:55:51.000000+00:00";
const CREATED_AT_END = "2026-09-04T10:55:52.000000+00:00";
const EXPECTED_COUNT = 61;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const execute = process.argv.includes("--execute");

const { data, error } = await supabase
  .from("bank_transactions")
  .select(
    "id, store_id, transaction_date, description, amount, category, transaction_type, status, excluded, plaid_transaction_id, created_at"
  )
  .eq("store_id", STORE_ID)
  .eq("description", DESCRIPTION)
  .eq("status", "needs_review")
  .is("plaid_transaction_id", null)
  .gte("created_at", CREATED_AT_START)
  .lt("created_at", CREATED_AT_END)
  .order("id", { ascending: true });

if (error) throw error;
const rows = data ?? [];
const ids = rows.map((row) => row.id);

console.log("Matched rows:", rows.length);
console.log("created_at values:", [...new Set(rows.map((row) => row.created_at))]);
console.log("statuses:", [...new Set(rows.map((row) => row.status))]);
console.log("posted:", rows.filter((row) => row.status === "posted").length);
console.log("plaid:", rows.filter((row) => row.plaid_transaction_id).length);

const deleteSql = `DELETE FROM bank_transactions
WHERE store_id = '${STORE_ID}'
  AND description = '${DESCRIPTION}'
  AND status = 'needs_review'
  AND plaid_transaction_id IS NULL
  AND created_at >= '${CREATED_AT_START}'
  AND created_at < '${CREATED_AT_END}'
  AND id IN (
${ids.map((id) => `    '${id}'`).join(",\n")}
  );`;

console.log("\n--- DELETE statement ---\n");
console.log(deleteSql);

if (rows.length !== EXPECTED_COUNT) {
  throw new Error(`Refusing to delete: expected ${EXPECTED_COUNT} rows, found ${rows.length}.`);
}
if (rows.some((row) => row.status !== "needs_review" || row.plaid_transaction_id || row.description !== DESCRIPTION || row.store_id !== STORE_ID)) {
  throw new Error("Refusing to delete: a matched row failed the safety checks.");
}

if (!execute) {
  console.log("\nDry-run only. Re-run with --execute to delete these rows.");
  process.exit(0);
}

const { error: deleteError, count } = await supabase
  .from("bank_transactions")
  .delete({ count: "exact" })
  .in("id", ids)
  .eq("store_id", STORE_ID)
  .eq("description", DESCRIPTION)
  .eq("status", "needs_review")
  .is("plaid_transaction_id", null);

if (deleteError) throw deleteError;
console.log("\nDeleted rows:", count);

const { count: remaining, error: remainingError } = await supabase
  .from("bank_transactions")
  .select("id", { count: "exact", head: true })
  .eq("store_id", STORE_ID)
  .eq("description", DESCRIPTION)
  .gte("created_at", CREATED_AT_START)
  .lt("created_at", CREATED_AT_END);

if (remainingError) throw remainingError;
console.log("Remaining CKCARBUS rows in this created_at second:", remaining);
