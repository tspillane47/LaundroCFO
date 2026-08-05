-- Fix stores SELECT RLS breaking INSERT … RETURNING during onboarding.
--
-- Stage 2A policy used user_can_access_store(), which subqueries stores and fails
-- to see the row being inserted when PostgREST evaluates SELECT for RETURNING.
-- Check ownership/membership directly on the row instead.

DROP POLICY IF EXISTS "Users can select accessible stores" ON stores;

CREATE POLICY "Users can select accessible stores"
  ON stores
  FOR SELECT
  USING (
    auth.uid() = stores.user_id
    OR EXISTS (
      SELECT 1
      FROM store_members sm
      WHERE sm.store_id = stores.id
        AND sm.user_id = auth.uid()
    )
  );
