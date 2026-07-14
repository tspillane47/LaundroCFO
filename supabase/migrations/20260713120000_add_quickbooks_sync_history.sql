-- QuickBooks Phase C: persist last sync summary on quickbooks_connections
-- so users can see when a store last synced and what happened.

ALTER TABLE quickbooks_connections
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_months_synced integer,
  ADD COLUMN IF NOT EXISTS last_sync_skipped_count integer,
  ADD COLUMN IF NOT EXISTS last_sync_unmapped_count integer;
