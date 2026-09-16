-- Co-owner store cards: resolve the original owner's display name/email in one batch.
-- SECURITY DEFINER so we can read auth.users.email; scoped so this is NOT a general
-- "look up anyone's email" tool. A row is returned only when:
--   * the requested id is in owner_ids
--   * that id is the original owner of at least one store (stores.user_id)
--   * the caller is a co-owner of that store via store_members
--   * the caller is not looking up themselves

CREATE OR REPLACE FUNCTION public.store_owner_labels(owner_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (u.id)
    u.id AS user_id,
    p.full_name,
    u.email::text AS email
  FROM unnest(owner_ids) AS requested(id)
  INNER JOIN auth.users u
    ON u.id = requested.id
  INNER JOIN public.stores s
    ON s.user_id = u.id
  INNER JOIN public.store_members sm
    ON sm.store_id = s.id
   AND sm.user_id = auth.uid()
  LEFT JOIN public.profiles p
    ON p.id = u.id
  WHERE auth.uid() IS NOT NULL
    AND u.id <> auth.uid()
  ORDER BY u.id;
$$;

COMMENT ON FUNCTION public.store_owner_labels(uuid[]) IS
  'Returns full_name/email for store owners the caller co-owns with. Does not leak identities of arbitrary users.';

REVOKE ALL ON FUNCTION public.store_owner_labels(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_owner_labels(uuid[]) TO authenticated;
