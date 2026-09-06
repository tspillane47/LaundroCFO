/**
 * Remove the Sept 4 CSV re-upload duplicates for 7 Cool Road LLC.
 * Reverses posted P&L links on the copies, then deletes those 45 rows.
 * Aug 22 originals and Aug 24–31 unique rows are not touched.
 *
 * Usage:
 *   set -a && source .env.local && set +a && npx tsx scripts/cleanup-cool-road-csv-reupload-duplicates.ts
 *   set -a && source .env.local && set +a && npx tsx scripts/cleanup-cool-road-csv-reupload-duplicates.ts --execute
 */
import { createScriptSupabaseClient } from "./createScriptSupabaseClient";
import { reverseTransactionPlLinkPosting } from "../src/lib/financials";

const STORE_ID = "7c6477c6-005f-4b29-b1c0-3af7d105abe6";
const KEEP_CREATED = "2026-08-22T11:38:51.184461";
const DELETE_CREATED = "2026-09-04T11:25:54.996257";
const EXPECTED_DELETE = 45;
const EXPECTED_REVERSALS = 38;
const EXPECTED_AUG_REVENUE = 13436.09;
const PAGE = 1000;

const APPROVED_DELETE_IDS = [
  "7fe06331-0245-4a1c-a434-3b005be48678",
  "775d3c78-8ab7-45b1-9e59-ca3625ca9a71",
  "9da68784-482f-4e23-959a-f44c7a8d05f3",
  "e3d42675-e17f-4562-8934-3d1a1552f578",
  "4d08771d-9bba-4721-8fef-12761a7f7992",
  "56f86b53-0c26-4c60-b875-b4c27a1298b5",
  "901da281-4717-43a8-81f2-9ab40fdd00db",
  "5b4f803d-bfec-4ad0-afd3-b86a9faeb2fb",
  "449262a8-2606-4984-b6b0-239fe6d3dc75",
  "0150c3f7-d2c4-48ed-a421-a8d30558e451",
  "facdf0f9-ac99-4f8d-aa36-39298a3e5353",
  "c0ee8137-3819-4306-aecc-2630f15c8b76",
  "9e3ef983-bfce-4bdb-acaf-a9f7e42dc0ba",
  "c9d42161-c964-4837-87e7-298ec930717f",
  "40f18fa0-c561-42d3-8812-eb82728c78bc",
  "a10a8b52-b4a7-4534-8694-5d5d0f209ca1",
  "8ca13ee3-9bfd-4f9f-ab03-2d9d82c3556e",
  "e9bc8c7c-2fb5-47b4-b5f5-5c5e64a60f9c",
  "a366f0ce-d866-457c-bf49-6ee625ac6e54",
  "3e02c371-5916-44df-9d75-6d9d324b82ca",
  "18c4ee27-41af-4c8d-be07-3a952c1a324e",
  "8a32b6a6-83f0-4f47-a1ba-90683e293143",
  "5aa3f182-c696-4bb3-9f60-44d39d4ed536",
  "2f617888-932e-4712-bc35-8842e37d1025",
  "18b4329d-799a-49fd-a4b9-581aaa3d40df",
  "671cca32-666f-483e-9603-bc0ddcc16e5d",
  "afea95a1-3e81-4cfa-964e-62178735a7a3",
  "10740afe-1335-4052-ab48-d0b83f77c0af",
  "7dc8aa01-f750-432a-8786-8dfa4f7a34f1",
  "8d2039d5-0387-48e1-80b7-492375654664",
  "5709eaf5-e6b5-42f2-9c69-5840ee8149f6",
  "b45ff156-e452-410e-b3a1-fe3f20fec6cf",
  "3da5cb77-018f-4e1f-93d5-51378f2e8a0f",
  "d9679afa-d16e-474b-87b6-da432d9cc7a3",
  "4570cf90-c11d-4695-92d7-af48e5c954df",
  "c1cac980-fc22-430e-8acf-4599a56d79f3",
  "63355c34-3d13-4142-afd9-9a88f4247ad8",
  "f38b2350-9714-4b6f-a32b-bf638191caae",
  "0522e3eb-ce0a-4484-a60f-cd5a5e4c3881",
  "1b368b2d-13ab-455c-b3dc-82eb72b1597d",
  "a7916741-89de-4221-a295-7e01069f664b",
  "046fefd4-7a6d-4733-b47c-07953f6d825d",
  "e4b5de65-6b2f-46dd-b3a3-27a4e1280d0c",
  "857333e9-e614-4d29-8887-902743d34d1d",
  "20e4e045-f969-47c1-9fd6-098e6a665758",
] as const;

const PROTECTED_UNIQUE_IDS = [
  "11e082be-b85c-4c8e-8a92-5949309dee29",
  "b0c017bd-8f71-43dc-8f5b-2276543d6a90",
  "7c68f4e5-3c18-4a51-bc99-a7bce39c563e",
  "358af73f-81b4-4c0f-9474-35e57af489f5",
  "ca8a4d7d-10d8-4f63-95ca-8e737612d214",
  "4eb6ae16-14d1-4b00-8478-725d0f6efe23",
  "5ed7cfad-ea97-4e78-9989-7072333472bf",
  "c6516205-a924-4bae-8c2a-e40be28d2453",
  "377e9ab7-6eb7-4a9f-89a2-e494f4c0dfb0",
  "47fd6d40-69d5-4fde-8b86-faef24d24727",
  "48c4323e-c384-4c1e-9c4a-d48d10db9580",
  "0d907142-d236-4df9-8d38-0fb1fb5c8cc0",
  "f6594eab-3f52-4791-ad10-2afedd09036b",
  "3525f8f7-34d6-4e26-8507-089e4dc09705",
  "bfcb61cc-ccbf-4072-a1d4-d8c2a10e53e7",
  "871f213b-9f35-424b-b64b-1f3174cb027a",
] as const;

type Txn = {
  id: string;
  store_id: string;
  user_id: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  category: string | null;
  transaction_type: string | null;
  status: string | null;
  excluded: boolean | null;
  plaid_transaction_id: string | null;
  created_at: string;
};

type PlLink = {
  id: string;
  transaction_id: string;
  category: string;
  year: number;
  month: number;
  amount_applied: number;
};

function keyOf(row: Pick<Txn, "transaction_date" | "amount" | "description">): string {
  return `${String(row.transaction_date).slice(0, 10)}|${Number(row.amount).toFixed(2)}|${row.description ?? ""}`;
}

function money(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

function sameIdSet(a: string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

async function fetchAll<T>(query: {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

function findDuplicatePairs(rows: Txn[]): Array<{ keep: Txn; remove: Txn }> {
  const groups = new Map<string, Txn[]>();
  for (const row of rows) {
    const k = keyOf(row);
    const list = groups.get(k) ?? [];
    list.push(row);
    groups.set(k, list);
  }
  return [...groups.values()]
    .map((g) => ({
      keep: g.find((r) => r.created_at === KEEP_CREATED),
      remove: g.find((r) => r.created_at === DELETE_CREATED),
    }))
    .filter((p): p is { keep: Txn; remove: Txn } => Boolean(p.keep && p.remove));
}

async function main() {
  const execute = process.argv.includes("--execute");
  const supabase = await createScriptSupabaseClient();

  const all = await fetchAll<Txn>(
    supabase
      .from("bank_transactions")
      .select(
        "id, store_id, user_id, transaction_date, description, amount, category, transaction_type, status, excluded, plaid_transaction_id, created_at"
      )
      .eq("store_id", STORE_ID)
      .is("plaid_transaction_id", null)
      .order("created_at", { ascending: true })
  );

  const pairs = findDuplicatePairs(all);
  const deleteIds = pairs.map((p) => p.remove.id).sort();
  const keepIds = pairs.map((p) => p.keep.id);

  if (pairs.length !== EXPECTED_DELETE) {
    throw new Error(`Refusing: expected ${EXPECTED_DELETE} pairs, found ${pairs.length}.`);
  }
  if (!sameIdSet(deleteIds, [...APPROVED_DELETE_IDS].sort())) {
    throw new Error("Refusing: live delete IDs do not match the approved list.");
  }
  if (deleteIds.some((id) => (PROTECTED_UNIQUE_IDS as readonly string[]).includes(id))) {
    throw new Error("Refusing: a protected Aug 24–31 row is in the delete list.");
  }
  if (keepIds.some((id) => deleteIds.includes(id))) {
    throw new Error("Refusing: a keep ID is also in the delete list.");
  }

  const { data: removeRows, error: removeErr } = await supabase
    .from("bank_transactions")
    .select(
      "id, store_id, user_id, created_at, plaid_transaction_id, status, excluded, transaction_date, amount, description"
    )
    .eq("store_id", STORE_ID)
    .in("id", deleteIds);
  if (removeErr) throw new Error(removeErr.message);
  if ((removeRows ?? []).length !== EXPECTED_DELETE) {
    throw new Error(`Refusing: expected ${EXPECTED_DELETE} live delete rows, found ${(removeRows ?? []).length}.`);
  }
  for (const row of removeRows ?? []) {
    if (row.store_id !== STORE_ID) throw new Error(`Refusing: store mismatch on ${row.id}`);
    if (row.created_at !== DELETE_CREATED) throw new Error(`Refusing: created_at mismatch on ${row.id}`);
    if (row.plaid_transaction_id) throw new Error(`Refusing: plaid id present on ${row.id}`);
  }

  const { data: uniqueRows, error: uniqueErr } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("store_id", STORE_ID)
    .in("id", [...PROTECTED_UNIQUE_IDS]);
  if (uniqueErr) throw new Error(uniqueErr.message);
  if ((uniqueRows ?? []).length !== PROTECTED_UNIQUE_IDS.length) {
    throw new Error(
      `Refusing: expected ${PROTECTED_UNIQUE_IDS.length} unique Aug 24–31 rows, found ${(uniqueRows ?? []).length}.`
    );
  }

  const { data: links, error: linkErr } = await supabase
    .from("transaction_pl_links")
    .select("id, transaction_id, category, year, month, amount_applied")
    .in("transaction_id", deleteIds);
  if (linkErr) throw new Error(linkErr.message);
  const plLinks = (links ?? []) as PlLink[];
  if (plLinks.length !== EXPECTED_REVERSALS) {
    throw new Error(`Refusing: expected ${EXPECTED_REVERSALS} P&L links, found ${plLinks.length}.`);
  }
  if (plLinks.some((l) => !deleteIds.includes(l.transaction_id))) {
    throw new Error("Refusing: a P&L link is not on a delete-list transaction.");
  }

  const { data: keepLinks, error: keepLinkErr } = await supabase
    .from("transaction_pl_links")
    .select("id, transaction_id")
    .in("transaction_id", keepIds);
  if (keepLinkErr) throw new Error(keepLinkErr.message);
  const keepLinkIds = new Set((keepLinks ?? []).map((l) => l.id as string));

  const { data: mfBefore, error: mfBeforeErr } = await supabase
    .from("monthly_financials")
    .select("revenue, self_service_revenue, wdf_revenue")
    .eq("store_id", STORE_ID)
    .eq("year", 2026)
    .eq("month", 8)
    .maybeSingle();
  if (mfBeforeErr) throw new Error(mfBeforeErr.message);

  console.log("=== Pre-flight ===");
  console.log({
    execute,
    pairs: pairs.length,
    pl_links_to_reverse: plLinks.length,
    unique_aug24_31_still_present: (uniqueRows ?? []).length,
    current_aug_revenue: money(Number(mfBefore?.revenue ?? 0)),
  });

  if (!execute) {
    console.log("Dry-run only. Re-run with --execute to apply.");
    return;
  }

  const removeById = new Map((removeRows ?? []).map((r) => [r.id as string, r]));
  let reversed = 0;
  let deletedLinks = 0;
  let deletedTxns = 0;

  for (const pair of pairs) {
    const remove = removeById.get(pair.remove.id);
    if (!remove) throw new Error(`Missing live row ${pair.remove.id}`);
    const rowLinks = plLinks.filter((l) => l.transaction_id === pair.remove.id);

    for (const link of rowLinks) {
      if (keepLinkIds.has(link.id)) {
        throw new Error(`Refusing: link ${link.id} belongs to a keep row.`);
      }
      const { error: reverseError } = await reverseTransactionPlLinkPosting(supabase, {
        storeId: STORE_ID,
        userId: remove.user_id as string,
        link,
      });
      if (reverseError) {
        throw new Error(`P&L reverse failed for ${pair.remove.id} / ${link.id}: ${reverseError}`);
      }
      reversed += 1;

      const { error: deleteLinkError } = await supabase
        .from("transaction_pl_links")
        .delete()
        .eq("id", link.id)
        .eq("transaction_id", pair.remove.id);
      if (deleteLinkError) {
        throw new Error(`Link delete failed for ${link.id}: ${deleteLinkError.message}`);
      }
      deletedLinks += 1;
    }

    const { error: deleteTxnError, count } = await supabase
      .from("bank_transactions")
      .delete({ count: "exact" })
      .eq("id", pair.remove.id)
      .eq("store_id", STORE_ID)
      .is("plaid_transaction_id", null);
    if (deleteTxnError) {
      throw new Error(`Txn delete failed for ${pair.remove.id}: ${deleteTxnError.message}`);
    }
    if (count !== 1) {
      throw new Error(`Txn delete count for ${pair.remove.id} was ${count}, expected 1.`);
    }
    deletedTxns += 1;
  }

  const { data: remainingDeletes, error: remainErr } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("store_id", STORE_ID)
    .in("id", deleteIds);
  if (remainErr) throw new Error(remainErr.message);

  const { data: remainingKeeps, error: keepRemainErr } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("store_id", STORE_ID)
    .in("id", keepIds);
  if (keepRemainErr) throw new Error(keepRemainErr.message);

  const { data: remainingUnique, error: uniqueRemainErr } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("store_id", STORE_ID)
    .in("id", [...PROTECTED_UNIQUE_IDS]);
  if (uniqueRemainErr) throw new Error(uniqueRemainErr.message);

  const { data: remainingLinks, error: remainingLinkErr } = await supabase
    .from("transaction_pl_links")
    .select("id")
    .in("transaction_id", deleteIds);
  if (remainingLinkErr) throw new Error(remainingLinkErr.message);

  const afterAll = await fetchAll<Txn>(
    supabase
      .from("bank_transactions")
      .select(
        "id, store_id, user_id, transaction_date, description, amount, category, transaction_type, status, excluded, plaid_transaction_id, created_at"
      )
      .eq("store_id", STORE_ID)
      .is("plaid_transaction_id", null)
      .order("created_at", { ascending: true })
  );
  const remainingPairs = findDuplicatePairs(afterAll);

  const groups = new Map<string, Txn[]>();
  for (const row of afterAll) {
    const k = keyOf(row);
    const list = groups.get(k) ?? [];
    list.push(row);
    groups.set(k, list);
  }
  const anyExactDups = [...groups.values()].filter((g) => g.length >= 2);

  const { data: mfAfter, error: mfAfterErr } = await supabase
    .from("monthly_financials")
    .select("revenue, self_service_revenue, wdf_revenue")
    .eq("store_id", STORE_ID)
    .eq("year", 2026)
    .eq("month", 8)
    .maybeSingle();
  if (mfAfterErr) throw new Error(mfAfterErr.message);
  const actualRevenue = money(Number(mfAfter?.revenue ?? 0));

  console.log("\n=== Post-flight ===");
  console.log({
    reversed,
    deletedLinks,
    deletedTxns,
    remaining_delete_ids: (remainingDeletes ?? []).length,
    remaining_keep_ids: (remainingKeeps ?? []).length,
    remaining_unique_aug24_31: (remainingUnique ?? []).length,
    remaining_delete_pl_links: (remainingLinks ?? []).length,
    remaining_sept4_vs_aug22_pairs: remainingPairs.length,
    remaining_exact_duplicate_groups: anyExactDups.length,
    aug_2026_revenue: actualRevenue,
    matches_expected_revenue: actualRevenue === EXPECTED_AUG_REVENUE,
  });

  if (deletedTxns !== EXPECTED_DELETE) {
    throw new Error(`Deleted ${deletedTxns} rows, expected ${EXPECTED_DELETE}.`);
  }
  if (reversed !== EXPECTED_REVERSALS || deletedLinks !== EXPECTED_REVERSALS) {
    throw new Error(`Reversed/deleted links ${reversed}/${deletedLinks}, expected ${EXPECTED_REVERSALS}.`);
  }
  if ((remainingDeletes ?? []).length !== 0) {
    throw new Error("Some delete-list rows still exist.");
  }
  if ((remainingKeeps ?? []).length !== EXPECTED_DELETE) {
    throw new Error("An Aug 22 original is missing.");
  }
  if ((remainingUnique ?? []).length !== PROTECTED_UNIQUE_IDS.length) {
    throw new Error("A protected Aug 24–31 row is missing.");
  }
  if (remainingPairs.length !== 0 || anyExactDups.length !== 0) {
    throw new Error("Duplicate pairs still remain on this store.");
  }
  if (actualRevenue !== EXPECTED_AUG_REVENUE) {
    throw new Error(`August revenue is ${actualRevenue}, expected ${EXPECTED_AUG_REVENUE}.`);
  }

  console.log("Cleanup succeeded.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
