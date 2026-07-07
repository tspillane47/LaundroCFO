-- Phase 3b Round 2: RLS write backstop for stores, Insurance, Occupancy/Lease, Utilities,
-- Transactions, and Scenarios tables. Mirrors client ReadOnlyGuard/useWriteGuard via user_can_write().
-- SELECT policies remain unrestricted for owners; INSERT/UPDATE/DELETE require user_can_write(auth.uid()).

-- stores (root ownership table — gates all store writes including occupancy_type)
DROP POLICY IF EXISTS "Users can only see their own stores" ON stores;

CREATE POLICY "Users can select own stores"
  ON stores
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stores"
  ON stores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own stores"
  ON stores
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own stores"
  ON stores
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- insurance_policies
DROP POLICY IF EXISTS "Users own their insurance policies" ON insurance_policies;

CREATE POLICY "Users can select own insurance policies"
  ON insurance_policies
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insurance policies"
  ON insurance_policies
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own insurance policies"
  ON insurance_policies
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own insurance policies"
  ON insurance_policies
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- insurance_claims
DROP POLICY IF EXISTS "Users own their insurance claims" ON insurance_claims;

CREATE POLICY "Users can select own insurance claims"
  ON insurance_claims
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insurance claims"
  ON insurance_claims
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own insurance claims"
  ON insurance_claims
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own insurance claims"
  ON insurance_claims
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- leases
DROP POLICY IF EXISTS "Users can delete own leases" ON leases;
DROP POLICY IF EXISTS "Users can insert own leases" ON leases;
DROP POLICY IF EXISTS "Users can select own leases" ON leases;
DROP POLICY IF EXISTS "Users can update own leases" ON leases;

CREATE POLICY "Users can select own leases"
  ON leases
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own leases"
  ON leases
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own leases"
  ON leases
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own leases"
  ON leases
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- lease_options
DROP POLICY IF EXISTS "Users can delete own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can insert own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can select own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can update own lease options" ON lease_options;

CREATE POLICY "Users can select own lease options"
  ON lease_options
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lease options"
  ON lease_options
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own lease options"
  ON lease_options
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own lease options"
  ON lease_options
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- real_estate
DROP POLICY IF EXISTS "Users own their real estate records" ON real_estate;

CREATE POLICY "Users can select own real estate"
  ON real_estate
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own real estate"
  ON real_estate
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own real estate"
  ON real_estate
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own real estate"
  ON real_estate
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- monthly_utilities
DROP POLICY IF EXISTS "Users own their utilities" ON monthly_utilities;

CREATE POLICY "Users can select own utilities"
  ON monthly_utilities
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own utilities"
  ON monthly_utilities
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own utilities"
  ON monthly_utilities
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own utilities"
  ON monthly_utilities
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- bank_transactions
DROP POLICY IF EXISTS "Users own their bank transactions" ON bank_transactions;

CREATE POLICY "Users can select own bank transactions"
  ON bank_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bank transactions"
  ON bank_transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own bank transactions"
  ON bank_transactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own bank transactions"
  ON bank_transactions
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- categorization_rules
DROP POLICY IF EXISTS "Users own their rules" ON categorization_rules;

CREATE POLICY "Users can select own categorization rules"
  ON categorization_rules
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categorization rules"
  ON categorization_rules
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can update own categorization rules"
  ON categorization_rules
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own categorization rules"
  ON categorization_rules
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- saved_scenarios
DROP POLICY IF EXISTS "Users can insert own saved scenarios" ON saved_scenarios;
DROP POLICY IF EXISTS "Users can delete own saved scenarios" ON saved_scenarios;

CREATE POLICY "Users can insert own saved scenarios"
  ON saved_scenarios
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own saved scenarios"
  ON saved_scenarios
  FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));

-- transaction_audit_log (append-only audit trail written during transaction review workflow)
DROP POLICY IF EXISTS "Users access audit logs for their stores" ON transaction_audit_log;

CREATE POLICY "Users can select audit logs for their stores"
  ON transaction_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_audit_log.store_id
        AND stores.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert audit logs for their stores"
  ON transaction_audit_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_audit_log.store_id
        AND stores.user_id = auth.uid()
    )
    AND user_id = auth.uid()
    AND user_can_write(auth.uid())
  );

CREATE POLICY "Users can update audit logs for their stores"
  ON transaction_audit_log
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_audit_log.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_audit_log.store_id
        AND stores.user_id = auth.uid()
    )
    AND user_id = auth.uid()
    AND user_can_write(auth.uid())
  );

CREATE POLICY "Users can delete audit logs for their stores"
  ON transaction_audit_log
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_audit_log.store_id
        AND stores.user_id = auth.uid()
    )
    AND user_can_write(auth.uid())
  );

-- transaction_pl_links (written when posting/reclassifying transactions to P&L)
DROP POLICY IF EXISTS "Users access pl links for their stores" ON transaction_pl_links;

CREATE POLICY "Users can select pl links for their stores"
  ON transaction_pl_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_pl_links.store_id
        AND stores.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert pl links for their stores"
  ON transaction_pl_links
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_pl_links.store_id
        AND stores.user_id = auth.uid()
    )
    AND user_can_write(auth.uid())
  );

CREATE POLICY "Users can update pl links for their stores"
  ON transaction_pl_links
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_pl_links.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_pl_links.store_id
        AND stores.user_id = auth.uid()
    )
    AND user_can_write(auth.uid())
  );

CREATE POLICY "Users can delete pl links for their stores"
  ON transaction_pl_links
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM stores
      WHERE stores.id = transaction_pl_links.store_id
        AND stores.user_id = auth.uid()
    )
    AND user_can_write(auth.uid())
  );
