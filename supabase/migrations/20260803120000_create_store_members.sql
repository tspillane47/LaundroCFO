-- Stage 1: Co-owner / shared store access — schema + core helper functions.
-- Does NOT modify RLS on existing tables (Stage 2).

-- ---------------------------------------------------------------------------
-- store_members
-- ---------------------------------------------------------------------------

CREATE TABLE store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid NOT NULL REFERENCES auth.users(id),
  CONSTRAINT store_members_store_user_unique UNIQUE (store_id, user_id)
);

CREATE INDEX store_members_store_id_idx ON store_members (store_id);
CREATE INDEX store_members_user_id_idx ON store_members (user_id);

COMMENT ON TABLE store_members IS
  'Additional users with full store access beyond stores.user_id (original owner).';

-- Prevent adding the store owner as a member (CHECK cannot subquery stores).
CREATE OR REPLACE FUNCTION public.store_members_reject_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT s.user_id
  INTO owner_id
  FROM stores s
  WHERE s.id = NEW.store_id;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'store not found: %', NEW.store_id;
  END IF;

  IF NEW.user_id = owner_id THEN
    RAISE EXCEPTION 'store owner cannot be added as a member';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER store_members_reject_owner_trg
  BEFORE INSERT ON store_members
  FOR EACH ROW
  EXECUTE FUNCTION public.store_members_reject_owner();

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER — used by RLS in Stage 2)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_can_access_store(
  check_user_id uuid,
  check_store_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    check_user_id IS NOT NULL
    AND check_store_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM stores s
        WHERE s.id = check_store_id
          AND s.user_id = check_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM store_members sm
        WHERE sm.store_id = check_store_id
          AND sm.user_id = check_user_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_write_store(
  check_user_id uuid,
  check_store_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
BEGIN
  IF NOT public.user_can_access_store(check_user_id, check_store_id) THEN
    RETURN false;
  END IF;

  SELECT s.user_id
  INTO owner_id
  FROM stores s
  WHERE s.id = check_store_id;

  IF owner_id IS NULL THEN
    RETURN false;
  END IF;

  -- Write eligibility follows the store owner's subscription/beta, not the caller's.
  RETURN public.user_can_write(owner_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_store(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_write_store(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS on store_members
-- ---------------------------------------------------------------------------

ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;

-- Owner + all members can see who has access.
CREATE POLICY "Store access holders can view members"
  ON store_members
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

-- Only the original store owner (stores.user_id) may add members.
CREATE POLICY "Store owner can add members"
  ON store_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM stores s
      WHERE s.id = store_id
        AND s.user_id = auth.uid()
    )
    AND added_by = auth.uid()
  );

-- Only the original store owner may remove members.
CREATE POLICY "Store owner can remove members"
  ON store_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM stores s
      WHERE s.id = store_members.store_id
        AND s.user_id = auth.uid()
    )
  );

-- No UPDATE policy: membership is immutable except add/remove.
