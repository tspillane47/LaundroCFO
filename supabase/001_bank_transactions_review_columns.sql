-- Migration 1 of 3: Transaction review columns on bank_transactions.
-- Run first in the Supabase SQL Editor.

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclusion_reason text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS original_category text,
  ADD COLUMN IF NOT EXISTS transaction_type text,
  ADD COLUMN IF NOT EXISTS split_parent_id uuid REFERENCES bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modified_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_status_check;

ALTER TABLE bank_transactions
  ADD CONSTRAINT bank_transactions_status_check
  CHECK (
    status IN (
      'needs_review',
      'reviewed',
      'posted',
      'excluded',
      'system_classified',
      'user_classified'
    )
  );

ALTER TABLE bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_transaction_type_check;

ALTER TABLE bank_transactions
  ADD CONSTRAINT bank_transactions_transaction_type_check
  CHECK (transaction_type IS NULL OR transaction_type IN ('income', 'expense'));

CREATE INDEX IF NOT EXISTS bank_transactions_status_idx
  ON bank_transactions (store_id, status)
  WHERE excluded = false;

CREATE INDEX IF NOT EXISTS bank_transactions_split_parent_id_idx
  ON bank_transactions (split_parent_id)
  WHERE split_parent_id IS NOT NULL;

-- Backfill existing rows
UPDATE bank_transactions
SET status = 'reviewed'
WHERE is_reviewed = true
  AND excluded = false
  AND status = 'needs_review';

UPDATE bank_transactions
SET original_category = category
WHERE original_category IS NULL
  AND category IS NOT NULL;

UPDATE bank_transactions
SET transaction_type = CASE
  WHEN amount < 0 THEN 'expense'
  WHEN amount > 0 THEN 'income'
  ELSE 'expense'
END
WHERE transaction_type IS NULL;
