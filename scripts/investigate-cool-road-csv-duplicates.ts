/**
 * Read-only investigation of 7 Cool Road LLC CSV duplicates.
 * Does not insert, update, or delete anything.
 *
 * Usage:
 *   set -a && source .env.local && set +a && npx tsx scripts/investigate-cool-road-csv-duplicates.ts
 */
import { createScriptSupabaseClient } from "./createScriptSupabaseClient";
import { csvExactDuplicateKey } from "../src/lib/financials";

const STORE_ID = "7c6477c6-005f-4b29-b1c0-3af7d105abe6";
const STORE_NAME = "7 Cool Road LLC";
const PAGE = 1000;

type Txn = {
  id: string;
  store_id: string;
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

function dateOnly(value: string): string {
  return String(value).split("T")[0];
}

function money(n: number): string {
  return Number(n).toFixed(2);
}

function dateAmountKey(row: Pick<Txn, "transaction_date" | "amount">): string {
  return `${dateOnly(row.transaction_date)}|${money(row.amount)}`;
}

function monthAmountKey(row: Pick<Txn, "transaction_date" | "amount">): string {
  return `${dateOnly(row.transaction_date).slice(0, 7)}|${money(row.amount)}`;
}

function describeDiff(a: string, b: string): string {
  if (a === b) return "EXACT match";
  if (a.trim() === b.trim()) return "whitespace-only difference";
  const aNorm = a.replace(/\s+/g, " ").trim();
  const bNorm = b.replace(/\s+/g, " ").trim();
  if (aNorm === bNorm) return "whitespace-normalized match (extra spaces/tabs)";
  if (a.toLowerCase() === b.toLowerCase()) return "case-only difference";
  if (a.includes(b) || b.includes(a)) {
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    return `one description contains the other (len ${shorter.length} vs ${longer.length})`;
  }
  let prefix = 0;
  const minLen = Math.min(a.length, b.length);
  while (prefix < minLen && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < minLen - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;
  const aMid = a.slice(prefix, a.length - suffix);
  const bMid = b.slice(prefix, b.length - suffix);
  return `differ after shared prefix ${JSON.stringify(a.slice(0, prefix))} | A mid=${JSON.stringify(aMid)} | B mid=${JSON.stringify(bMid)}`;
}

function jsonLen(s: string): { chars: number; bytes: number } {
  return { chars: s.length, bytes: Buffer.byteLength(s, "utf8") };
}

async function main() {
  const supabase = await createScriptSupabaseClient();

  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .select("id, name")
    .eq("id", STORE_ID)
    .maybeSingle();
  if (storeErr) throw new Error(storeErr.message);
  if (!store) throw new Error(`Store ${STORE_ID} not found`);

  const all = await fetchAll<Txn>(
    supabase
      .from("bank_transactions")
      .select(
        "id, store_id, transaction_date, description, amount, category, transaction_type, status, excluded, plaid_transaction_id, created_at"
      )
      .eq("store_id", STORE_ID)
      .order("created_at", { ascending: true })
  );

  const csv = all.filter((r) => !r.plaid_transaction_id);
  const plaid = all.filter((r) => r.plaid_transaction_id);

  const createdBuckets = new Map<string, number>();
  for (const row of csv) {
    const bucket = row.created_at.slice(0, 19);
    createdBuckets.set(bucket, (createdBuckets.get(bucket) ?? 0) + 1);
  }

  const exactGroups = new Map<string, Txn[]>();
  const dateAmountGroups = new Map<string, Txn[]>();
  const monthAmountGroups = new Map<string, Txn[]>();
  for (const row of csv) {
    const exact = csvExactDuplicateKey(row);
    exactGroups.set(exact, [...(exactGroups.get(exact) ?? []), row]);
    const da = dateAmountKey(row);
    dateAmountGroups.set(da, [...(dateAmountGroups.get(da) ?? []), row]);
    const ma = monthAmountKey(row);
    monthAmountGroups.set(ma, [...(monthAmountGroups.get(ma) ?? []), row]);
  }

  const exactDups = [...exactGroups.values()].filter((g) => g.length >= 2);
  const dateAmountDups = [...dateAmountGroups.values()].filter((g) => g.length >= 2);
  const dateAmountDescDiffer = dateAmountDups.filter((g) => {
    const first = g[0].description ?? "";
    return g.some((r) => (r.description ?? "") !== first);
  });
  const dateAmountExactDesc = dateAmountDups.filter((g) => {
    const first = g[0].description ?? "";
    return g.every((r) => (r.description ?? "") === first);
  });
  const monthAmountDups = [...monthAmountGroups.values()].filter((g) => g.length >= 2);
  const monthOnlyDups = monthAmountDups.filter((g) => {
    const dates = new Set(g.map((r) => dateOnly(r.transaction_date)));
    return dates.size > 1;
  });

  console.log("=== Store ===");
  console.log({ id: store.id, name: store.name, expected: STORE_NAME });
  console.log("\n=== Row counts ===");
  console.log({
    total: all.length,
    csv_no_plaid: csv.length,
    plaid: plaid.length,
    csv_date_range:
      csv.length === 0
        ? null
        : {
            min: dateOnly(csv.reduce((a, b) => (a.transaction_date < b.transaction_date ? a : b)).transaction_date),
            max: dateOnly(csv.reduce((a, b) => (a.transaction_date > b.transaction_date ? a : b)).transaction_date),
          },
  });

  console.log("\n=== CSV created_at buckets (upload batches) ===");
  console.log(
    [...createdBuckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([created_at, count]) => ({ created_at, count }))
  );

  console.log("\n=== Duplicate group counts (CSV only) ===");
  console.log({
    exact_date_amount_description_groups: exactDups.length,
    exact_date_amount_description_extra_rows: exactDups.reduce((n, g) => n + g.length - 1, 0),
    same_date_same_amount_groups: dateAmountDups.length,
    same_date_same_amount_with_identical_descriptions: dateAmountExactDesc.length,
    same_date_same_amount_with_differing_descriptions: dateAmountDescDiffer.length,
    same_month_same_amount_groups: monthAmountDups.length,
    same_month_same_amount_different_dates: monthOnlyDups.length,
  });

  function printGroup(label: string, group: Txn[]) {
    const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
    console.log(`\n--- ${label} ---`);
    console.log({
      date: dateOnly(sorted[0].transaction_date),
      amount: money(sorted[0].amount),
      type: sorted[0].transaction_type,
      status: [...new Set(sorted.map((r) => r.status))],
      row_count: sorted.length,
    });
    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i];
      const desc = row.description ?? "";
      console.log(`\n  [${i + 1}] id=${row.id}`);
      console.log(`      created_at=${row.created_at}`);
      console.log(`      date=${dateOnly(row.transaction_date)}  amount=${money(row.amount)}  type=${row.transaction_type}  status=${row.status}  excluded=${row.excluded}`);
      console.log(`      category=${row.category}`);
      console.log(`      description_len=${JSON.stringify(jsonLen(desc))}`);
      console.log(`      description_full=${JSON.stringify(desc)}`);
      if (i > 0) {
        const prev = sorted[0].description ?? "";
        console.log(`      vs_oldest_description: ${describeDiff(prev, desc)}`);
        console.log(`      exact_key_match=${csvExactDuplicateKey(sorted[0]) === csvExactDuplicateKey(row)}`);
      }
    }
  }

  console.log("\n=== SIDE-BY-SIDE: same date + same amount, descriptions DIFFER ===");
  if (dateAmountDescDiffer.length === 0) {
    console.log("(none)");
  } else {
    const sorted = dateAmountDescDiffer.sort(
      (a, b) => dateOnly(b[0].transaction_date).localeCompare(dateOnly(a[0].transaction_date)) || money(b[0].amount).localeCompare(money(a[0].amount))
    );
    for (const group of sorted) printGroup("date+amount match, descriptions differ", group);
  }

  console.log("\n=== SIDE-BY-SIDE: same date + same amount, descriptions EXACTLY match (exact-match skip should have blocked) ===");
  if (dateAmountExactDesc.length === 0) {
    console.log("(none — exact-match skip appears to be working for identical rows)");
  } else {
    for (const group of dateAmountExactDesc) printGroup("EXACT date+amount+description duplicate still in DB", group);
  }

  console.log("\n=== SIDE-BY-SIDE: same month + same amount, DIFFERENT dates (month heuristic false-positive candidates) ===");
  if (monthOnlyDups.length === 0) {
    console.log("(none)");
  } else {
    const samples = monthOnlyDups
      .sort((a, b) => b.length - a.length)
      .slice(0, 15);
    for (const group of samples) printGroup("month+amount match, dates differ", group);
    if (monthOnlyDups.length > samples.length) {
      console.log(`\n... ${monthOnlyDups.length - samples.length} more month-only groups omitted`);
    }
  }

  console.log("\n=== Most recent CSV rows (20) ===");
  const recent = [...csv].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
  for (const row of recent) {
    console.log({
      created_at: row.created_at,
      date: dateOnly(row.transaction_date),
      amount: money(row.amount),
      type: row.transaction_type,
      status: row.status,
      description: row.description,
      id: row.id,
    });
  }

  const today = csv.filter((r) => r.created_at.startsWith("2026-09-09"));
  const older = csv.filter((r) => !r.created_at.startsWith("2026-09-09"));
  const olderExact = new Map<string, Txn[]>();
  const olderDA = new Map<string, Txn[]>();
  const olderMA = new Map<string, Txn[]>();
  for (const r of older) {
    const k = csvExactDuplicateKey(r);
    olderExact.set(k, [...(olderExact.get(k) ?? []), r]);
    olderDA.set(dateAmountKey(r), [...(olderDA.get(dateAmountKey(r)) ?? []), r]);
    olderMA.set(monthAmountKey(r), [...(olderMA.get(monthAmountKey(r)) ?? []), r]);
  }

  console.log("\n=== EACH OF TODAY'S ROWS vs OLDER ===");
  let exactHits = 0;
  let daHits = 0;
  let maHits = 0;
  let noHits = 0;
  for (const row of [...today].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || dateOnly(a.transaction_date).localeCompare(dateOnly(b.transaction_date))
  )) {
    const exact = olderExact.get(csvExactDuplicateKey(row)) ?? [];
    const das = olderDA.get(dateAmountKey(row)) ?? [];
    const mas = olderMA.get(monthAmountKey(row)) ?? [];
    const dateAmtNonExact = das.filter((m) => csvExactDuplicateKey(m) !== csvExactDuplicateKey(row));
    const monthOnly = mas.filter((m) => dateOnly(m.transaction_date) !== dateOnly(row.transaction_date));
    if (exact.length) exactHits += 1;
    else if (das.length) daHits += 1;
    else if (monthOnly.length) maHits += 1;
    else noHits += 1;
    console.log(
      `\n[${row.created_at.slice(11, 19)}] ${dateOnly(row.transaction_date)} $${money(row.amount)} ${row.transaction_type} ${row.status} excl=${row.excluded}`
    );
    console.log(`  NEW desc=${JSON.stringify(row.description)}`);
    console.log(`  NEW id=${row.id} cat=${row.category}`);
    console.log(
      `  hits: exact=${exact.length} sameDateAmt=${das.length} sameMonthAmt=${mas.length} monthDiffDate=${monthOnly.length}`
    );
    for (const m of [...exact, ...dateAmtNonExact, ...monthOnly]) {
      const kind = exact.includes(m)
        ? "EXACT (skip should have blocked)"
        : dateAmtNonExact.includes(m)
          ? "same date+amount, different description"
          : "same month+amount, different date";
      console.log(`    ${kind}`);
      console.log(
        `      existing id=${m.id} created=${m.created_at} date=${dateOnly(m.transaction_date)} amt=${money(m.amount)} type=${m.transaction_type} status=${m.status} excluded=${m.excluded}`
      );
      console.log(`      existing desc=${JSON.stringify(m.description)}`);
    }
  }
  console.log("\n=== TODAY summary vs older ===");
  console.log({
    exactHits,
    sameDateAmtDifferentDesc: daHits,
    monthAmtDifferentDateOnly: maHits,
    noOlderMatch: noHits,
  });

  const b1 = today.filter((r) => r.created_at.startsWith("2026-09-09T10:12:48"));
  const b2 = today.filter((r) => r.created_at.startsWith("2026-09-09T10:12:56"));
  console.log("\n=== ALL rows from first today batch ===");
  for (const r of b1) {
    console.log({
      date: dateOnly(r.transaction_date),
      amount: money(r.amount),
      type: r.transaction_type,
      status: r.status,
      description: r.description,
      id: r.id,
    });
  }
  console.log("\n=== TODAY vs TODAY (batch2 vs batch1) ===");
  for (const row of b2) {
    const matches = b1.filter((m) => monthAmountKey(m) === monthAmountKey(row));
    if (matches.length === 0) continue;
    console.log(`\nB2 ${dateOnly(row.transaction_date)} $${money(row.amount)} ${JSON.stringify(row.description)}`);
    for (const m of matches) {
      console.log(
        `  B1 ${dateOnly(m.transaction_date)} $${money(m.amount)} type=${m.transaction_type} ${JSON.stringify(m.description)} exact=${csvExactDuplicateKey(m) === csvExactDuplicateKey(row)} sameDate=${dateOnly(m.transaction_date) === dateOnly(row.transaction_date)}`
      );
    }
  }

  const sept4 = csv.filter((r) => r.created_at.startsWith("2026-09-04"));
  console.log("\n=== Sept 4 remaining rows ===");
  console.log({
    count: sept4.length,
    min: sept4.length
      ? dateOnly(sept4.reduce((a, b) => (a.transaction_date < b.transaction_date ? a : b)).transaction_date)
      : null,
    max: sept4.length
      ? dateOnly(sept4.reduce((a, b) => (a.transaction_date > b.transaction_date ? a : b)).transaction_date)
      : null,
  });

  const leftoverCreated: Record<string, number> = {};
  for (const g of exactDups) {
    const k = [...new Set(g.map((r) => r.created_at.slice(0, 10)))].sort().join(" + ");
    leftoverCreated[k] = (leftoverCreated[k] ?? 0) + 1;
  }
  console.log("exact dup groups by created dates:", leftoverCreated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
