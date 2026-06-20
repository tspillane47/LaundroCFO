/**
 * One-time backfill for store cache columns and orphaned lease dates.
 *
 * For each store (or a single storeId):
 * 1. Sync stores.washers / dryers / avg_machine_age from equipment_inventory
 * 2. Sync stores.annual_debt_service / loan_balance from active store_loans
 * 3. Copy stores.lease_expiration → leases.lease_end_date when the lease row is
 *    missing or has no end date (does not overwrite an existing lease_end_date)
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     npx tsx scripts/backfill-store-caches.ts [--dry-run] [storeId]
 *
 * Or sign in as a user (RLS applies — only that user's stores):
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SUPABASE_SCRIPT_EMAIL=... SUPABASE_SCRIPT_PASSWORD=... \
 *     npx tsx scripts/backfill-store-caches.ts [--dry-run] [storeId]
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createScriptSupabaseClient } from "./createScriptSupabaseClient";
import {
  resolveDebtFromLoans,
  resolveEquipmentFromInventory,
  type ResolvedDebt,
  type ResolvedEquipment,
} from "../src/lib/storeCanonical";
import type { EquipmentRecord } from "../src/lib/equipment";

type StoreRow = {
  id: string;
  user_id: string;
  name: string | null;
  lease_expiration: string | null;
  archived: boolean | null;
};

type LeaseRow = {
  id: string;
  store_id: string;
  lease_end_date: string | null;
};

type Summary = {
  storesProcessed: number;
  equipmentSynced: number;
  debtSynced: number;
  leasesCreated: number;
  leasesUpdated: number;
  leaseSkipped: number;
  errors: number;
};

function parseArgs(argv: string[]): { dryRun: boolean; storeId?: string } {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const storeId = args.find((arg) => arg !== "--dry-run");
  return { dryRun, storeId };
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const datePart = value.split("T")[0];
  return datePart || null;
}

function equipmentPayload(resolved: ResolvedEquipment) {
  return {
    washers: resolved.totalWashers > 0 ? resolved.totalWashers : null,
    dryers: resolved.totalDryers > 0 ? resolved.totalDryers : null,
    avg_machine_age: resolved.weightedAvgAge,
  };
}

function debtPayload(debt: ResolvedDebt) {
  return {
    annual_debt_service: debt.annualDebtService > 0 ? debt.annualDebtService : null,
    loan_balance: debt.loanBalance > 0 ? debt.loanBalance : null,
  };
}

async function fetchStores(supabase: SupabaseClient, storeId?: string): Promise<StoreRow[]> {
  let query = supabase
    .from("stores")
    .select("id, user_id, name, lease_expiration, archived")
    .or("archived.is.null,archived.eq.false")
    .order("name", { ascending: true });

  if (storeId) {
    query = query.eq("id", storeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load stores: ${error.message}`);
  }
  return (data ?? []) as StoreRow[];
}

async function backfillEquipmentCache(
  supabase: SupabaseClient,
  storeId: string,
  dryRun: boolean
): Promise<ResolvedEquipment & { payload: ReturnType<typeof equipmentPayload> }> {
  const { data: equipment, error: fetchError } = await supabase
    .from("equipment_inventory")
    .select("*")
    .eq("store_id", storeId);

  if (fetchError) {
    throw new Error(`equipment_inventory fetch failed: ${fetchError.message}`);
  }

  const resolved = resolveEquipmentFromInventory((equipment ?? []) as EquipmentRecord[]);
  const payload = equipmentPayload(resolved);

  if (!dryRun) {
    const { error: updateError } = await supabase.from("stores").update(payload).eq("id", storeId);
    if (updateError) {
      throw new Error(`stores equipment cache update failed: ${updateError.message}`);
    }
  }

  return { ...resolved, payload };
}

async function backfillDebtCache(
  supabase: SupabaseClient,
  storeId: string,
  dryRun: boolean
): Promise<ResolvedDebt & { payload: ReturnType<typeof debtPayload> }> {
  const { data: loans, error: fetchError } = await supabase
    .from("store_loans")
    .select("monthly_payment, current_balance, is_active")
    .eq("store_id", storeId)
    .eq("is_active", true);

  if (fetchError) {
    throw new Error(`store_loans fetch failed: ${fetchError.message}`);
  }

  const debt = resolveDebtFromLoans(loans ?? []);
  const payload = debtPayload(debt);

  if (!dryRun) {
    const { error: updateError } = await supabase.from("stores").update(payload).eq("id", storeId);
    if (updateError) {
      throw new Error(`stores debt cache update failed: ${updateError.message}`);
    }
  }

  return { ...debt, payload };
}

async function syncOrphanedLeaseExpiration(
  supabase: SupabaseClient,
  store: StoreRow,
  lease: LeaseRow | null,
  dryRun: boolean
): Promise<"created" | "updated" | "skipped" | "unchanged"> {
  const expiration = normalizeDate(store.lease_expiration);
  if (!expiration) {
    return "skipped";
  }

  if (!lease) {
    if (dryRun) {
      return "created";
    }
    const { error } = await supabase.from("leases").insert({
      store_id: store.id,
      user_id: store.user_id,
      lease_end_date: expiration,
    });
    if (error) {
      throw new Error(`leases insert failed: ${error.message}`);
    }
    return "created";
  }

  if (lease.lease_end_date) {
    const existing = normalizeDate(lease.lease_end_date);
    if (existing === expiration) {
      return "unchanged";
    }
    return "skipped";
  }

  if (dryRun) {
    return "updated";
  }

  const { error } = await supabase
    .from("leases")
    .update({ lease_end_date: expiration })
    .eq("id", lease.id);

  if (error) {
    throw new Error(`leases update failed: ${error.message}`);
  }

  return "updated";
}

async function main() {
  const { dryRun, storeId } = parseArgs(process.argv);
  const supabase = await createScriptSupabaseClient();

  const stores = await fetchStores(supabase, storeId);
  if (stores.length === 0) {
    console.error(storeId ? `No store found for id ${storeId}` : "No stores found to backfill.");
    process.exit(1);
  }

  const summary: Summary = {
    storesProcessed: 0,
    equipmentSynced: 0,
    debtSynced: 0,
    leasesCreated: 0,
    leasesUpdated: 0,
    leaseSkipped: 0,
    errors: 0,
  };

  console.log(
    dryRun
      ? `DRY RUN — no writes (${stores.length} store${stores.length === 1 ? "" : "s"})\n`
      : `Backfilling ${stores.length} store${stores.length === 1 ? "" : "s"}...\n`
  );

  for (const store of stores) {
    const label = store.name?.trim() || "(unnamed)";
    console.log(`— ${label} (${store.id})`);

    try {
      const equipment = await backfillEquipmentCache(supabase, store.id, dryRun);
      summary.equipmentSynced += 1;
      console.log(
        `  equipment cache: washers=${equipment.payload.washers ?? 0}, dryers=${equipment.payload.dryers ?? 0}, avg_age=${equipment.payload.avg_machine_age ?? "null"}${dryRun ? " (dry-run)" : ""}`
      );

      const debt = await backfillDebtCache(supabase, store.id, dryRun);
      summary.debtSynced += 1;
      console.log(
        `  debt cache: annual_debt_service=${debt.payload.annual_debt_service ?? 0}, loan_balance=${debt.payload.loan_balance ?? 0}${dryRun ? " (dry-run)" : ""}`
      );

      const { data: leaseData, error: leaseError } = await supabase
        .from("leases")
        .select("id, store_id, lease_end_date")
        .eq("store_id", store.id)
        .maybeSingle();

      if (leaseError) {
        throw new Error(`leases fetch failed: ${leaseError.message}`);
      }

      const leaseResult = await syncOrphanedLeaseExpiration(
        supabase,
        store,
        (leaseData as LeaseRow | null) ?? null,
        dryRun
      );

      if (leaseResult === "created") {
        summary.leasesCreated += 1;
        console.log(`  lease: ${dryRun ? "would create" : "created"} lease_end_date=${normalizeDate(store.lease_expiration)}`);
      } else if (leaseResult === "updated") {
        summary.leasesUpdated += 1;
        console.log(`  lease: ${dryRun ? "would set" : "set"} lease_end_date=${normalizeDate(store.lease_expiration)}`);
      } else if (leaseResult === "unchanged") {
        console.log(`  lease: lease_end_date already matches stores.lease_expiration`);
      } else {
        summary.leaseSkipped += 1;
        if (store.lease_expiration) {
          console.log(
            `  lease: skipped (stores.lease_expiration=${normalizeDate(store.lease_expiration)} — existing lease_end_date kept or no orphan)`
          );
        } else {
          console.log(`  lease: skipped (no stores.lease_expiration)`);
        }
      }

      summary.storesProcessed += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log("");
  }

  console.log("=== Summary ===");
  console.log(`  Stores processed:  ${summary.storesProcessed}`);
  console.log(`  Equipment caches:  ${summary.equipmentSynced}`);
  console.log(`  Debt caches:       ${summary.debtSynced}`);
  console.log(`  Leases created:    ${summary.leasesCreated}`);
  console.log(`  Leases updated:    ${summary.leasesUpdated}`);
  console.log(`  Lease rows skipped:${summary.leaseSkipped}`);
  console.log(`  Errors:            ${summary.errors}`);
  if (dryRun) {
    console.log("\nRe-run without --dry-run to apply changes.");
  }

  process.exit(summary.errors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
