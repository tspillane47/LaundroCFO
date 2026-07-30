-- QuickBooks connection errors: surface broken connections on the Financials tab
-- (mirrors plaid_connections item_error_* fields).

ALTER TABLE quickbooks_connections
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS error_at timestamptz;
