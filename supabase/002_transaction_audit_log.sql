-- Migration 2 of 3: Audit trail for transaction changes.
-- Run second in the Supabase SQL Editor (after 001).

CREATE TABLE IF NOT EXISTS transaction_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  field_changed text NOT NULL,
  old_value text,
  new_value text,
  change_source text NOT NULL
);

ALTER TABLE transaction_audit_log
  DROP CONSTRAINT IF EXISTS transaction_audit_log_change_source_check;

ALTER TABLE transaction_audit_log
  ADD CONSTRAINT transaction_audit_log_change_source_check
  CHECK (change_source IN ('user', 'rule', 'import'));

CREATE INDEX IF NOT EXISTS transaction_audit_log_transaction_id_idx
  ON transaction_audit_log (transaction_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS transaction_audit_log_store_id_idx
  ON transaction_audit_log (store_id, changed_at DESC);

ALTER TABLE transaction_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access audit logs for their stores" ON transaction_audit_log;

CREATE POLICY "Users access audit logs for their stores"
  ON transaction_audit_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_audit_log.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_audit_log.store_id
        AND stores.user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );
