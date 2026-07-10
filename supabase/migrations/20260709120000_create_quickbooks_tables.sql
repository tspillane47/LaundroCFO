-- Document quickbooks_mapping (pre-existing in production) and add quickbooks_connections
-- for per-store OAuth token storage. Tokens are written server-side only.

CREATE TABLE IF NOT EXISTS quickbooks_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  qb_account_name text NOT NULL,
  laundrocfo_field text NOT NULL
);

CREATE INDEX IF NOT EXISTS quickbooks_mapping_store_id_idx
  ON quickbooks_mapping (store_id);

ALTER TABLE quickbooks_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their QB mappings" ON quickbooks_mapping;

CREATE POLICY "Users own their QB mappings"
  ON quickbooks_mapping
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS quickbooks_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  realm_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  access_token_expires_at timestamptz NOT NULL,
  refresh_token_expires_at timestamptz NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quickbooks_connections_store_id_idx
  ON quickbooks_connections (store_id);

CREATE INDEX IF NOT EXISTS quickbooks_connections_user_id_idx
  ON quickbooks_connections (user_id);

ALTER TABLE quickbooks_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own QB connections" ON quickbooks_connections;

CREATE POLICY "Users can read own QB connections"
  ON quickbooks_connections
  FOR SELECT
  USING (auth.uid() = user_id);
