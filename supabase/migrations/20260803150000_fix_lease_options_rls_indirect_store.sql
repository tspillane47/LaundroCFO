-- Fix lease_options RLS: table has no store_id — scope access via leases.store_id.

DROP POLICY IF EXISTS "Users can select accessible lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can insert accessible lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can update accessible lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can delete accessible lease options" ON lease_options;

-- Legacy policy names (pre–Stage 2B).
DROP POLICY IF EXISTS "Users can select own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can insert own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can update own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can delete own lease options" ON lease_options;

CREATE POLICY "Users can select accessible lease options"
  ON lease_options
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM leases l
      WHERE l.id = lease_options.lease_id
        AND public.user_can_access_store(auth.uid(), l.store_id)
    )
  );

CREATE POLICY "Users can insert accessible lease options"
  ON lease_options
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM leases l
      WHERE l.id = lease_options.lease_id
        AND public.user_can_write_store(auth.uid(), l.store_id)
    )
  );

CREATE POLICY "Users can update accessible lease options"
  ON lease_options
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM leases l
      WHERE l.id = lease_options.lease_id
        AND public.user_can_access_store(auth.uid(), l.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM leases l
      WHERE l.id = lease_options.lease_id
        AND public.user_can_write_store(auth.uid(), l.store_id)
    )
  );

CREATE POLICY "Users can delete accessible lease options"
  ON lease_options
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM leases l
      WHERE l.id = lease_options.lease_id
        AND public.user_can_write_store(auth.uid(), l.store_id)
    )
  );
