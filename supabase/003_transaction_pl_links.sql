-- Migration 3 of 3: Links between posted transactions and P&L rows.
-- Run third in the Supabase SQL Editor (after 002).

CREATE TABLE IF NOT EXISTS transaction_pl_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  category text NOT NULL,
  amount_applied numeric NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_pl_links_transaction_id_unique UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS transaction_pl_links_store_period_idx
  ON transaction_pl_links (store_id, year, month);

CREATE INDEX IF NOT EXISTS transaction_pl_links_category_idx
  ON transaction_pl_links (store_id, year, month, category);

ALTER TABLE transaction_pl_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access pl links for their stores" ON transaction_pl_links;

CREATE POLICY "Users access pl links for their stores"
  ON transaction_pl_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_pl_links.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_pl_links.store_id
        AND stores.user_id = auth.uid()
    )
  );
