-- Fix user_can_write() fail-open beta_mode handling.
--
-- Access rules (matches src/lib/access.ts + documented "no_subscription → readonly"):
--   beta_mode explicitly true  → grant write access unconditionally (ignore subscription)
--   beta_mode false/missing/unrecognized → require active or valid trialing subscription
--   no subscription row        → block (readonly)

CREATE OR REPLACE FUNCTION public.user_can_write(check_user_id uuid)
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

  -- Beta on: unconditional access (no subscription check).
  IF beta_value IS NOT NULL THEN
    IF jsonb_typeof(beta_value) = 'boolean' AND beta_value = 'true'::jsonb THEN
      RETURN true;
    ELSIF jsonb_typeof(beta_value) = 'string' AND beta_value #>> '{}' = 'true' THEN
      RETURN true;
    END IF;
  END IF;

  -- Beta off (false, missing row, or unrecognized value): subscription required.
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
