-- Auto-post revenue: distinguish pending Plaid rows, allow an "auto" audit source,
-- and remember the last dashboard bank refresh so we can throttle it.

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false;

ALTER TABLE transaction_audit_log
  DROP CONSTRAINT IF EXISTS transaction_audit_log_change_source_check;

ALTER TABLE transaction_audit_log
  ADD CONSTRAINT transaction_audit_log_change_source_check
  CHECK (change_source IN ('user', 'rule', 'import', 'system', 'auto'));

CREATE TABLE IF NOT EXISTS store_bank_refresh (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  last_refreshed_at timestamptz NOT NULL
);

ALTER TABLE store_bank_refresh ENABLE ROW LEVEL SECURITY;
