-- Stage 2A: stores table RLS — co-owner read + edit access.
-- INSERT and DELETE remain owner-only (unchanged).

DROP POLICY IF EXISTS "Users can select own stores" ON stores;

CREATE POLICY "Users can select accessible stores"
  ON stores
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), id));

DROP POLICY IF EXISTS "Users can update own stores" ON stores;

CREATE POLICY "Users can update accessible stores"
  ON stores
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), id))
  WITH CHECK (public.user_can_write_store(auth.uid(), id));

-- Unchanged:
--   "Users can insert own stores"
--     WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()))
--   "Users can delete own stores"
--     USING (auth.uid() = user_id AND user_can_write(auth.uid()))
