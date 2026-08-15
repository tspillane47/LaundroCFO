-- Plaid account balances synced from /accounts/get (server-side only writes).

CREATE TABLE IF NOT EXISTS plaid_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_connection_id uuid NOT NULL REFERENCES plaid_connections(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  plaid_account_id text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL,
  account_subtype text,
  current_balance numeric NOT NULL DEFAULT 0,
  available_balance numeric,
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS plaid_accounts_plaid_account_id_idx
  ON plaid_accounts (plaid_account_id);

CREATE INDEX IF NOT EXISTS plaid_accounts_store_id_idx
  ON plaid_accounts (store_id);

CREATE INDEX IF NOT EXISTS plaid_accounts_connection_id_idx
  ON plaid_accounts (plaid_connection_id);

ALTER TABLE plaid_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read accessible Plaid accounts"
  ON plaid_accounts
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));
