-- Revenue breakdown columns for Bank Import income categorization.
-- Run in Supabase SQL editor before posting income to granular categories.

ALTER TABLE monthly_financials
  ADD COLUMN IF NOT EXISTS self_service_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wdf_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commercial_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vending_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_revenue numeric DEFAULT 0;
