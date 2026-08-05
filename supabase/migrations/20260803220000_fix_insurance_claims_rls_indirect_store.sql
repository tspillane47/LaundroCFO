-- Stage 2D: insurance_claims — no store_id column; scope via insurance_policies.store_id.
-- Same indirect EXISTS pattern as lease_options (via leases.store_id).

DROP POLICY IF EXISTS "Users can select accessible insurance claims" ON insurance_claims;
DROP POLICY IF EXISTS "Users can insert accessible insurance claims" ON insurance_claims;
DROP POLICY IF EXISTS "Users can update accessible insurance claims" ON insurance_claims;
DROP POLICY IF EXISTS "Users can delete accessible insurance claims" ON insurance_claims;

-- Current policy names (enforce_write_access_rls_round2).
DROP POLICY IF EXISTS "Users can select own insurance claims" ON insurance_claims;
DROP POLICY IF EXISTS "Users can insert own insurance claims" ON insurance_claims;
DROP POLICY IF EXISTS "Users can update own insurance claims" ON insurance_claims;
DROP POLICY IF EXISTS "Users can delete own insurance claims" ON insurance_claims;

-- Legacy single-policy name (backfill).
DROP POLICY IF EXISTS "Users own their insurance claims" ON insurance_claims;

CREATE POLICY "Users can select accessible insurance claims"
  ON insurance_claims
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM insurance_policies ip
      WHERE ip.id = insurance_claims.policy_id
        AND public.user_can_access_store(auth.uid(), ip.store_id)
    )
  );

CREATE POLICY "Users can insert accessible insurance claims"
  ON insurance_claims
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM insurance_policies ip
      WHERE ip.id = insurance_claims.policy_id
        AND public.user_can_write_store(auth.uid(), ip.store_id)
    )
  );

CREATE POLICY "Users can update accessible insurance claims"
  ON insurance_claims
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM insurance_policies ip
      WHERE ip.id = insurance_claims.policy_id
        AND public.user_can_access_store(auth.uid(), ip.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM insurance_policies ip
      WHERE ip.id = insurance_claims.policy_id
        AND public.user_can_write_store(auth.uid(), ip.store_id)
    )
  );

CREATE POLICY "Users can delete accessible insurance claims"
  ON insurance_claims
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM insurance_policies ip
      WHERE ip.id = insurance_claims.policy_id
        AND public.user_can_write_store(auth.uid(), ip.store_id)
    )
  );
