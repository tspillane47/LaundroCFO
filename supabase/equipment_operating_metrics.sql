-- Equipment operating metrics: vend prices and dryer revenue split.
-- Run in Supabase SQL editor before using turns-per-day calculations.

ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS avg_vend_price numeric DEFAULT NULL;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS dryer_revenue_pct numeric DEFAULT 35;
