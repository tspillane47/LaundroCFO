import "server-only";

import {
  postTransactionsBatch,
  resolveIncomeAutoPostCategory,
  reverseTransactionPlLinkPosting,
  writeTransactionAuditLog,
  type BankImportCategory,
  type CategorizationRule,
  type FinancialsSupabaseClient,
  type TransactionPlLink,
  type TransactionStatus,
} from "@/lib/financials";
import {
  fetchExcludedPlaidAccountIds,
  isBankTransactionVisibleForExcludedPlaidAccounts,
} from "@/lib/plaid-shared";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const AUTO_POST_REVENUE_LIMIT = 200;

export type AutoPostRevenueResult = {
  postedCount: number;
  postedAmount: number;
  transactionIds: string[];
  error: string | null;
};

export type UndoAutoPostResult = {
  undone: boolean;
  error: string | null;
  storeId: string | null;
};

type AutoPostCandidate = {
  id: string;
  store_id: string;
  user_id?: string | null;
  transaction_date: string;
  description: string | null;
  amount: number;
  category: string | null;
  status?: TransactionStatus | null;
  excluded?: boolean | null;
  pending?: boolean | null;
  transaction_type?: string | null;
  plaid_account_id?: string | null;
  original_category?: string | null;
};

function emptyResult(error: string | null = null): AutoPostRevenueResult {
  return { postedCount: 0, postedAmount: 0, transactionIds: [], error };
}

export async function autoPostRevenueForStore(
  storeId: string,
  options?: { supabase?: FinancialsSupabaseClient; actingUserId?: string }
): Promise<AutoPostRevenueResult> {
  const supabase = options?.supabase ?? (createAdminSupabaseClient() as unknown as FinancialsSupabaseClient);

  const { data: storeRow, error: storeError } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError) return emptyResult(storeError.message);

  const ownerId = (storeRow as { user_id?: string } | null)?.user_id ?? options?.actingUserId ?? null;
  if (!ownerId) return emptyResult("Store not found.");

  const rulesUserId = options?.actingUserId ?? ownerId;
  const { data: ruleRows, error: rulesError } = await supabase
    .from("categorization_rules")
    .select("*")
    .eq("user_id", rulesUserId);

  if (rulesError) return emptyResult(rulesError.message);
  const rules = (ruleRows ?? []) as CategorizationRule[];

  const { data: txnRows, error: txnError } = await supabase
    .from("bank_transactions")
    .select(
      "id, store_id, user_id, transaction_date, description, amount, category, status, excluded, pending, transaction_type, plaid_account_id, original_category"
    )
    .eq("store_id", storeId)
    .eq("transaction_type", "income")
    .eq("pending", false)
    .eq("excluded", false)
    .in("status", ["needs_review", "system_classified"])
    .order("transaction_date", { ascending: true })
    .limit(1000);

  if (txnError) return emptyResult(txnError.message);

  let excludedAccountIds: string[] = [];
  try {
    excludedAccountIds = await fetchExcludedPlaidAccountIds(supabase, storeId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load bank accounts.";
    return emptyResult(message);
  }

  const eligible: AutoPostCandidate[] = [];
  for (const row of (txnRows ?? []) as AutoPostCandidate[]) {
    if (row.pending) continue;
    if (row.excluded) continue;
    if (row.transaction_type !== "income") continue;
    const status = row.status ?? "needs_review";
    if (status !== "needs_review" && status !== "system_classified") continue;
    if (!isBankTransactionVisibleForExcludedPlaidAccounts(row, excludedAccountIds)) continue;

    const decision = resolveIncomeAutoPostCategory(
      row.description,
      "income",
      Math.abs(Number(row.amount)),
      rules
    );
    if (!decision.post) continue;

    eligible.push({ ...row, category: decision.category });
    if (eligible.length >= AUTO_POST_REVENUE_LIMIT) break;
  }

  if (eligible.length === 0) return emptyResult(null);

  const result = await postTransactionsBatch(supabase, {
    storeId,
    userId: rulesUserId,
    changeSource: "auto",
    transactions: eligible.map((txn) => ({
      id: txn.id,
      transaction_date: txn.transaction_date,
      amount: Number(txn.amount),
      category: txn.category as BankImportCategory,
      status: txn.status ?? "needs_review",
      original_category: txn.original_category ?? txn.category,
      plaid_account_id: txn.plaid_account_id,
    })),
  });

  if (result.error) {
    return emptyResult(result.error);
  }

  const postedIds = result.postedTransactionIds ?? [];
  const postedIdSet = new Set(postedIds);
  const postedAmount = eligible.reduce((sum, txn) => {
    if (!postedIdSet.has(txn.id)) return sum;
    return sum + Math.abs(Number(txn.amount));
  }, 0);

  return {
    postedCount: result.postedCount,
    postedAmount,
    transactionIds: postedIds,
    error: null,
  };
}

export async function undoAutoPost(
  transactionId: string,
  userId: string,
  options?: { supabase?: FinancialsSupabaseClient }
): Promise<UndoAutoPostResult> {
  const supabase = options?.supabase ?? (createAdminSupabaseClient() as unknown as FinancialsSupabaseClient);

  const { data: transaction, error: fetchError } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("id", transactionId)
    .maybeSingle();

  if (fetchError) return { undone: false, error: fetchError.message, storeId: null };
  if (!transaction) return { undone: false, error: "Transaction not found.", storeId: null };

  const bankTxn = transaction as {
    id: string;
    store_id: string;
    status?: string | null;
    category?: string | null;
  };

  if ((bankTxn.status ?? "needs_review") !== "posted") {
    return { undone: false, error: "Only a posted transaction can be undone.", storeId: bankTxn.store_id };
  }

  const { data: audits, error: auditFetchError } = await supabase
    .from("transaction_audit_log")
    .select("change_source, new_value, changed_at")
    .eq("transaction_id", transactionId)
    .eq("field_changed", "status")
    .order("changed_at", { ascending: false })
    .limit(1);

  if (auditFetchError) return { undone: false, error: auditFetchError.message, storeId: bankTxn.store_id };

  const latest = (audits ?? [])[0] as { change_source?: string; new_value?: string } | undefined;
  if (!latest || latest.change_source !== "auto" || latest.new_value !== "posted") {
    return {
      undone: false,
      error: "This transaction was not posted automatically.",
      storeId: bankTxn.store_id,
    };
  }

  const { data: plLink, error: plLinkError } = await supabase
    .from("transaction_pl_links")
    .select("*")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (plLinkError) return { undone: false, error: plLinkError.message, storeId: bankTxn.store_id };

  if (plLink) {
    const link = plLink as TransactionPlLink;
    const { error: reverseError } = await reverseTransactionPlLinkPosting(supabase, {
      storeId: bankTxn.store_id,
      userId,
      link,
    });
    if (reverseError) return { undone: false, error: reverseError, storeId: bankTxn.store_id };

    const { error: deleteError } = await supabase.from("transaction_pl_links").delete().eq("id", link.id);
    if (deleteError) return { undone: false, error: deleteError.message, storeId: bankTxn.store_id };
  }

  const { error: updateError } = await supabase
    .from("bank_transactions")
    .update({
      status: "needs_review",
      is_reviewed: false,
      modified_at: new Date().toISOString(),
    })
    .eq("id", transactionId);

  if (updateError) return { undone: false, error: updateError.message, storeId: bankTxn.store_id };

  const { error: auditError } = await writeTransactionAuditLog(supabase, {
    transactionId,
    storeId: bankTxn.store_id,
    userId,
    fieldChanged: "status",
    oldValue: "posted",
    newValue: "needs_review",
    changeSource: "user",
  });

  if (auditError) return { undone: false, error: auditError, storeId: bankTxn.store_id };

  return { undone: true, error: null, storeId: bankTxn.store_id };
}
