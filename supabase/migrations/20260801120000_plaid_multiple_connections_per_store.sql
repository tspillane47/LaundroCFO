-- Allow multiple Plaid connections per store (e.g. checking + credit card).
-- Plaid item IDs remain globally unique — one row per Plaid Item.

DROP INDEX IF EXISTS plaid_connections_store_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS plaid_connections_plaid_item_id_idx
  ON plaid_connections (plaid_item_id);

-- Non-unique lookup index for store-scoped queries (replaces the old unique index).
CREATE INDEX IF NOT EXISTS plaid_connections_store_id_idx
  ON plaid_connections (store_id);
