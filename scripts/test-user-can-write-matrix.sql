-- Ephemeral candidate for pre-deploy matrix testing. NOT applied to production user_can_write().
-- Run via: supabase db execute --file scripts/test-user-can-write-matrix.sql
-- Or paste into Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.user_can_write_v2(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  beta_value jsonb;
  sub_status text;
  sub_trial_ends_at timestamptz;
BEGIN
  IF check_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT value
  INTO beta_value
  FROM app_settings
  WHERE key = 'beta_mode';

  -- Beta on only when explicitly true. Grants access unconditionally (no subscription check).
  IF beta_value IS NOT NULL THEN
    IF jsonb_typeof(beta_value) = 'boolean' AND beta_value = 'true'::jsonb THEN
      RETURN true;
    ELSIF jsonb_typeof(beta_value) = 'string' AND beta_value #>> '{}' = 'true' THEN
      RETURN true;
    END IF;
  END IF;

  -- Beta off (false, missing, or unrecognized): subscription required.
  SELECT status, trial_ends_at
  INTO sub_status, sub_trial_ends_at
  FROM subscriptions
  WHERE user_id = check_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF sub_status = 'active' THEN
    RETURN true;
  END IF;

  IF sub_status = 'trialing' THEN
    RETURN sub_trial_ends_at IS NOT NULL AND sub_trial_ends_at > now();
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_write_v2(uuid) TO authenticated, service_role;
