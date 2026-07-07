-- Enforce read-only write blocking at the database level (Phase 3b backstop).
-- Mirrors src/lib/access.ts isReadOnly logic via user_can_write().
-- Client-side ReadOnlyGuard/useWriteGuard remain the UX layer; this cannot be bypassed.

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

  -- Beta mode (mirrors fetchBetaMode + parseBetaSettingValue in src/lib/access.ts / src/lib/beta.ts)
  SELECT value
  INTO beta_value
  FROM app_settings
  WHERE key = 'beta_mode';

  IF beta_value IS NULL THEN
    -- No row: parseBetaSettingValue(undefined) falls back to BETA_MODE (true)
    RETURN true;
  END IF;

  IF jsonb_typeof(beta_value) = 'boolean' THEN
    IF beta_value = 'true'::jsonb THEN
      RETURN true;
    END IF;
    -- boolean false: continue to subscription check
  ELSIF jsonb_typeof(beta_value) = 'string' THEN
    IF beta_value #>> '{}' = 'true' THEN
      RETURN true;
    ELSIF beta_value #>> '{}' <> 'false' THEN
      -- Unrecognized string: BETA_MODE default (true)
      RETURN true;
    END IF;
    -- string "false": continue to subscription check
  ELSE
    -- Unrecognized jsonb type: BETA_MODE default (true)
    RETURN true;
  END IF;

  -- Subscription (mirrors resolveSubscriptionAccess write decision)
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

  -- canceled, past_due, incomplete, or any other status
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_write(uuid) TO authenticated;

-- monthly_financials: SELECT always allowed for owner; writes require user_can_write()
DROP POLICY IF EXISTS "Users own their monthly financials" ON monthly_financials;

CREATE POLICY "Users can select own monthly financials"
  ON monthly_financials
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own monthly financials"
  ON monthly_financials
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own monthly financials"
  ON monthly_financials
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own monthly financials"
  ON monthly_financials
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- equipment_inventory
DROP POLICY IF EXISTS "Users own their equipment" ON equipment_inventory;

CREATE POLICY "Users can select own equipment"
  ON equipment_inventory
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own equipment"
  ON equipment_inventory
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own equipment"
  ON equipment_inventory
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own equipment"
  ON equipment_inventory
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- store_loans
DROP POLICY IF EXISTS "Users own their loans" ON store_loans;

CREATE POLICY "Users can select own loans"
  ON store_loans
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own loans"
  ON store_loans
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own loans"
  ON store_loans
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own loans"
  ON store_loans
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));
