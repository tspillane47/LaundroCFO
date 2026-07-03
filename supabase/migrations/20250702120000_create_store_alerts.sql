-- Persistent store alert instances for dedup, toast tracking, and alert history.

CREATE TABLE IF NOT EXISTS store_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('danger', 'warning', 'info')),
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  toast_shown_at timestamptz,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS store_alerts_store_id_idx
  ON store_alerts (store_id);

CREATE INDEX IF NOT EXISTS store_alerts_alert_key_idx
  ON store_alerts (alert_key);

CREATE INDEX IF NOT EXISTS store_alerts_user_store_active_idx
  ON store_alerts (user_id, store_id)
  WHERE resolved_at IS NULL;

-- One unresolved row per (store, alert_key); resolved rows remain for history.
CREATE UNIQUE INDEX IF NOT EXISTS store_alerts_active_store_key_idx
  ON store_alerts (store_id, alert_key)
  WHERE resolved_at IS NULL;

ALTER TABLE store_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access alerts for their stores" ON store_alerts;

CREATE POLICY "Users access alerts for their stores"
  ON store_alerts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = store_alerts.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = store_alerts.store_id
        AND stores.user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );
