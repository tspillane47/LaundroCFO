-- Stage 2B: Co-owner access on 12 store-scoped tables (direct store_id + user_id pattern).
-- Uses user_can_access_store / user_can_write_store from Stage 1.
-- Does NOT touch stores (Stage 2A) or join-based tables (Stage 2C).

-- ---------------------------------------------------------------------------
-- bank_transactions
-- Before: auth.uid() = user_id (+ user_can_write on writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select own bank transactions" ON bank_transactions;
DROP POLICY IF EXISTS "Users can insert own bank transactions" ON bank_transactions;
DROP POLICY IF EXISTS "Users can update own bank transactions" ON bank_transactions;
DROP POLICY IF EXISTS "Users can delete own bank transactions" ON bank_transactions;

CREATE POLICY "Users can select accessible bank transactions"
  ON bank_transactions
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible bank transactions"
  ON bank_transactions
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible bank transactions"
  ON bank_transactions
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible bank transactions"
  ON bank_transactions
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- monthly_financials
-- Before: auth.uid() = user_id (+ user_can_write on writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select own monthly financials" ON monthly_financials;
DROP POLICY IF EXISTS "Users can insert own monthly financials" ON monthly_financials;
DROP POLICY IF EXISTS "Users can update own monthly financials" ON monthly_financials;
DROP POLICY IF EXISTS "Users can delete own monthly financials" ON monthly_financials;

CREATE POLICY "Users can select accessible monthly financials"
  ON monthly_financials
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible monthly financials"
  ON monthly_financials
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible monthly financials"
  ON monthly_financials
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible monthly financials"
  ON monthly_financials
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- monthly_utilities
-- Before: auth.uid() = user_id (+ user_can_write on writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select own utilities" ON monthly_utilities;
DROP POLICY IF EXISTS "Users can insert own utilities" ON monthly_utilities;
DROP POLICY IF EXISTS "Users can update own utilities" ON monthly_utilities;
DROP POLICY IF EXISTS "Users can delete own utilities" ON monthly_utilities;

CREATE POLICY "Users can select accessible utilities"
  ON monthly_utilities
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible utilities"
  ON monthly_utilities
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible utilities"
  ON monthly_utilities
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible utilities"
  ON monthly_utilities
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- equipment_inventory
-- Before: auth.uid() = user_id (+ user_can_write on writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select own equipment" ON equipment_inventory;
DROP POLICY IF EXISTS "Users can insert own equipment" ON equipment_inventory;
DROP POLICY IF EXISTS "Users can update own equipment" ON equipment_inventory;
DROP POLICY IF EXISTS "Users can delete own equipment" ON equipment_inventory;

CREATE POLICY "Users can select accessible equipment"
  ON equipment_inventory
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible equipment"
  ON equipment_inventory
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible equipment"
  ON equipment_inventory
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible equipment"
  ON equipment_inventory
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- store_loans
-- Before: auth.uid() = user_id (+ user_can_write on writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select own loans" ON store_loans;
DROP POLICY IF EXISTS "Users can insert own loans" ON store_loans;
DROP POLICY IF EXISTS "Users can update own loans" ON store_loans;
DROP POLICY IF EXISTS "Users can delete own loans" ON store_loans;

CREATE POLICY "Users can select accessible loans"
  ON store_loans
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible loans"
  ON store_loans
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible loans"
  ON store_loans
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible loans"
  ON store_loans
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- insurance_policies
-- Before: auth.uid() = user_id (+ user_can_write on writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select own insurance policies" ON insurance_policies;
DROP POLICY IF EXISTS "Users can insert own insurance policies" ON insurance_policies;
DROP POLICY IF EXISTS "Users can update own insurance policies" ON insurance_policies;
DROP POLICY IF EXISTS "Users can delete own insurance policies" ON insurance_policies;

CREATE POLICY "Users can select accessible insurance policies"
  ON insurance_policies
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible insurance policies"
  ON insurance_policies
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible insurance policies"
  ON insurance_policies
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible insurance policies"
  ON insurance_policies
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- leases
-- Before: auth.uid() = user_id (+ user_can_write on writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select own leases" ON leases;
DROP POLICY IF EXISTS "Users can insert own leases" ON leases;
DROP POLICY IF EXISTS "Users can update own leases" ON leases;
DROP POLICY IF EXISTS "Users can delete own leases" ON leases;

CREATE POLICY "Users can select accessible leases"
  ON leases
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible leases"
  ON leases
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible leases"
  ON leases
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible leases"
  ON leases
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- lease_options
-- Before: auth.uid() = user_id (+ user_can_write on writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can insert own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can update own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can delete own lease options" ON lease_options;

CREATE POLICY "Users can select accessible lease options"
  ON lease_options
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible lease options"
  ON lease_options
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible lease options"
  ON lease_options
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible lease options"
  ON lease_options
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- real_estate
-- Before: auth.uid() = user_id (+ user_can_write on writes)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can select own real estate" ON real_estate;
DROP POLICY IF EXISTS "Users can insert own real estate" ON real_estate;
DROP POLICY IF EXISTS "Users can update own real estate" ON real_estate;
DROP POLICY IF EXISTS "Users can delete own real estate" ON real_estate;

CREATE POLICY "Users can select accessible real estate"
  ON real_estate
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible real estate"
  ON real_estate
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible real estate"
  ON real_estate
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible real estate"
  ON real_estate
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- saved_scenarios
-- Before: SELECT auth.uid() = user_id; INSERT/DELETE with user_can_write
-- No UPDATE policy today — intentionally not adding one.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own saved scenarios" ON saved_scenarios;
DROP POLICY IF EXISTS "Users can insert own saved scenarios" ON saved_scenarios;
DROP POLICY IF EXISTS "Users can delete own saved scenarios" ON saved_scenarios;

CREATE POLICY "Users can view accessible saved scenarios"
  ON saved_scenarios
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible saved scenarios"
  ON saved_scenarios
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible saved scenarios"
  ON saved_scenarios
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- saved_loan_calculations
-- Before: SELECT auth.uid() = user_id; INSERT/DELETE with user_can_write
-- No UPDATE policy today — intentionally not adding one.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own saved loan calculations" ON saved_loan_calculations;
DROP POLICY IF EXISTS "Users can insert own saved loan calculations" ON saved_loan_calculations;
DROP POLICY IF EXISTS "Users can delete own saved loan calculations" ON saved_loan_calculations;

CREATE POLICY "Users can view accessible saved loan calculations"
  ON saved_loan_calculations
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible saved loan calculations"
  ON saved_loan_calculations
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible saved loan calculations"
  ON saved_loan_calculations
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- quickbooks_mapping
-- Before: single FOR ALL, auth.uid() = user_id, no user_can_write gate
-- Split into per-operation policies (FOR ALL cannot gate DELETE on write access).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users own their QB mappings" ON quickbooks_mapping;

CREATE POLICY "Users can select accessible QB mappings"
  ON quickbooks_mapping
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users can insert accessible QB mappings"
  ON quickbooks_mapping
  FOR INSERT
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can update accessible QB mappings"
  ON quickbooks_mapping
  FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id))
  WITH CHECK (public.user_can_write_store(auth.uid(), store_id));

CREATE POLICY "Users can delete accessible QB mappings"
  ON quickbooks_mapping
  FOR DELETE
  USING (public.user_can_write_store(auth.uid(), store_id));
