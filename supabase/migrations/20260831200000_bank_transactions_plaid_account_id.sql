-- Trace each bank transaction to the Plaid account it came from (Part 2).
-- Existing rows stay NULL until a later sync touches them.

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS plaid_account_id text;

CREATE INDEX IF NOT EXISTS bank_transactions_store_plaid_account_idx
  ON bank_transactions (store_id, plaid_account_id)
  WHERE plaid_account_id IS NOT NULL;
