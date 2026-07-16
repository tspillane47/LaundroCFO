-- Plaid webhook state: notify-only for new transactions and surface broken connections.

ALTER TABLE plaid_connections
  ADD COLUMN IF NOT EXISTS has_new_transactions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS item_error_code text,
  ADD COLUMN IF NOT EXISTS item_error_message text,
  ADD COLUMN IF NOT EXISTS item_error_at timestamptz;
