-- Plaid connection storage (Phase A). Tokens are written server-side only.

CREATE TABLE IF NOT EXISTS plaid_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_item_id text NOT NULL,
  plaid_access_token text NOT NULL,
  institution_name text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS plaid_connections_store_id_idx
  ON plaid_connections (store_id);

CREATE INDEX IF NOT EXISTS plaid_connections_user_id_idx
  ON plaid_connections (user_id);

ALTER TABLE plaid_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own Plaid connections" ON plaid_connections;

CREATE POLICY "Users can read own Plaid connections"
  ON plaid_connections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Stable dedup key for future Plaid transaction sync (Phase B).
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS plaid_transaction_id text;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_store_plaid_txn_idx
  ON bank_transactions (store_id, plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;
