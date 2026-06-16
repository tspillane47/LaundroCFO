-- Software & Subscriptions and Credit Card Processing Fees columns for Bank Import expense categorization.
-- Run in Supabase SQL editor before posting transactions to these categories.

ALTER TABLE monthly_financials
  ADD COLUMN IF NOT EXISTS software_subscriptions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cc_processing_fees numeric DEFAULT 0;
