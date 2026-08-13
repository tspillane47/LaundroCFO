-- Stage 2C: Co-owner access on join-based store-scoped tables.
-- Replaces EXISTS (... stores.user_id = auth.uid()) with helper functions.

-- ---------------------------------------------------------------------------
-- transaction_pl_links
-- No user_id column — store-scoped only.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select pl links for their stores" ON transaction_pl_links;
DROP POLICY IF EXISTS "Users can insert pl links for their stores" ON transaction_pl_links;
DROP POLICY IF EXISTS "Users can update pl links for their stores" ON transaction_pl_links;
DROP POLICY IF EXISTS "Users can delete pl links for their stores" ON transaction_pl_links;

-- Legacy single-policy name.
DROP POLICY IF EXISTS "Users access pl links for their stores" ON transaction_pl_links;

-- Idempotent re-run (manual fix / partial apply).
DROP POLICY IF EXISTS "Users can select accessible pl links" ON transaction_pl_links;
DROP POLICY IF EXISTS "Users can insert accessible pl links" ON transaction_pl_links;
DROP POLICY IF EXISTS "Users can update accessible pl links" ON transaction_pl_links;
DROP POLICY IF EXISTS "Users can delete accessible pl links" ON transaction_pl_links;

CREATE POLICY "Users can select accessible pl links"
  ON transaction_pl_links
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible pl links"
  ON transaction_pl_links
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible pl links"
  ON transaction_pl_links
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible pl links"
  ON transaction_pl_links
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- transaction_audit_log
-- INSERT keeps user_id = auth.uid() (actor attribution).
-- UPDATE relaxes row user_id — append-only; any store editor may act on store rows.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select audit logs for their stores" ON transaction_audit_log;
DROP POLICY IF EXISTS "Users can insert audit logs for their stores" ON transaction_audit_log;
DROP POLICY IF EXISTS "Users can update audit logs for their stores" ON transaction_audit_log;
DROP POLICY IF EXISTS "Users can delete audit logs for their stores" ON transaction_audit_log;

-- Legacy single-policy name.
DROP POLICY IF EXISTS "Users access audit logs for their stores" ON transaction_audit_log;

-- Idempotent re-run (manual fix / partial apply).
DROP POLICY IF EXISTS "Users can select accessible audit logs" ON transaction_audit_log;
DROP POLICY IF EXISTS "Users can insert accessible audit logs" ON transaction_audit_log;
DROP POLICY IF EXISTS "Users can update accessible audit logs" ON transaction_audit_log;
DROP POLICY IF EXISTS "Users can delete accessible audit logs" ON transaction_audit_log;

CREATE POLICY "Users can select accessible audit logs"
  ON transaction_audit_log
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible audit logs"
  ON transaction_audit_log
  FOR INSERT
  WITH CHECK (
    public.user_can_write_store(auth.uid(), store_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update accessible audit logs"
  ON transaction_audit_log
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible audit logs"
  ON transaction_audit_log
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- store_alerts
-- Split from FOR ALL; INSERT keeps user_id = auth.uid() (actor on create).
-- UPDATE relaxes row user_id — alerts are store-scoped shared state.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users access alerts for their stores" ON store_alerts;

-- Idempotent re-run (manual fix / partial apply).
DROP POLICY IF EXISTS "Users can select accessible store alerts" ON store_alerts;
DROP POLICY IF EXISTS "Users can insert accessible store alerts" ON store_alerts;
DROP POLICY IF EXISTS "Users can update accessible store alerts" ON store_alerts;
DROP POLICY IF EXISTS "Users can delete accessible store alerts" ON store_alerts;

CREATE POLICY "Users can select accessible store alerts"
  ON store_alerts
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible store alerts"
  ON store_alerts
  FOR INSERT
  WITH CHECK (
    public.user_can_write_store(auth.uid(), store_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update accessible store alerts"
  ON store_alerts
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible store alerts"
  ON store_alerts
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));
