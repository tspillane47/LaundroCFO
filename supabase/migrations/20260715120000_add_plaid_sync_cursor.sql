-- Plaid Phase B: cursor for /transactions/sync incremental pagination.
-- Stores where the last sync left off so subsequent syncs only fetch new/changed data.

ALTER TABLE plaid_connections
  ADD COLUMN IF NOT EXISTS sync_cursor text;
