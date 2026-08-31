-- Persist Link-selected accounts and later exclude flags (Part 1).
-- Existing rows grandfather as included = true, selected_via_link = false.

ALTER TABLE plaid_accounts
  ADD COLUMN IF NOT EXISTS mask text,
  ADD COLUMN IF NOT EXISTS included boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS selected_via_link boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz;
