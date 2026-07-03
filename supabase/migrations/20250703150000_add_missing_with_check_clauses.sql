-- Add WITH CHECK clauses to RLS policies that only had USING.
-- USING controls read/update/delete visibility; WITH CHECK validates INSERT and UPDATE values.
-- Mirrors the pattern already used on categorization_rules in 20250703140000.

-- stores
DROP POLICY IF EXISTS "Users can only see their own stores" ON stores;

CREATE POLICY "Users can only see their own stores"
  ON stores
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- bank_transactions
DROP POLICY IF EXISTS "Users own their bank transactions" ON bank_transactions;

CREATE POLICY "Users own their bank transactions"
  ON bank_transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- monthly_financials
DROP POLICY IF EXISTS "Users own their monthly financials" ON monthly_financials;

CREATE POLICY "Users own their monthly financials"
  ON monthly_financials
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- monthly_utilities
DROP POLICY IF EXISTS "Users own their utilities" ON monthly_utilities;

CREATE POLICY "Users own their utilities"
  ON monthly_utilities
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- real_estate
DROP POLICY IF EXISTS "Users own their real estate records" ON real_estate;

CREATE POLICY "Users own their real estate records"
  ON real_estate
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- equipment_inventory
DROP POLICY IF EXISTS "Users own their equipment" ON equipment_inventory;

CREATE POLICY "Users own their equipment"
  ON equipment_inventory
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- store_loans
DROP POLICY IF EXISTS "Users own their loans" ON store_loans;

CREATE POLICY "Users own their loans"
  ON store_loans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- insurance_policies
DROP POLICY IF EXISTS "Users own their insurance policies" ON insurance_policies;

CREATE POLICY "Users own their insurance policies"
  ON insurance_policies
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- insurance_claims
DROP POLICY IF EXISTS "Users own their insurance claims" ON insurance_claims;

CREATE POLICY "Users own their insurance claims"
  ON insurance_claims
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- quickbooks_mapping
DROP POLICY IF EXISTS "Users own their QB mappings" ON quickbooks_mapping;

CREATE POLICY "Users own their QB mappings"
  ON quickbooks_mapping
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- shared_reports
DROP POLICY IF EXISTS "Users own their shared reports" ON shared_reports;

CREATE POLICY "Users own their shared reports"
  ON shared_reports
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
