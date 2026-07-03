-- Backfill RLS policies that exist in production but were never versioned in migrations.
-- Source: live pg_policies export (2026-07-03). Documents existing security posture only.

-- stores (root ownership table)
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their own stores" ON stores;

CREATE POLICY "Users can only see their own stores"
  ON stores
  FOR ALL
  USING (auth.uid() = user_id);

-- bank_transactions
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their bank transactions" ON bank_transactions;

CREATE POLICY "Users own their bank transactions"
  ON bank_transactions
  FOR ALL
  USING (auth.uid() = user_id);

-- monthly_financials
ALTER TABLE monthly_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their monthly financials" ON monthly_financials;

CREATE POLICY "Users own their monthly financials"
  ON monthly_financials
  FOR ALL
  USING (auth.uid() = user_id);

-- monthly_utilities
ALTER TABLE monthly_utilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their utilities" ON monthly_utilities;

CREATE POLICY "Users own their utilities"
  ON monthly_utilities
  FOR ALL
  USING (auth.uid() = user_id);

-- real_estate
ALTER TABLE real_estate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their real estate records" ON real_estate;

CREATE POLICY "Users own their real estate records"
  ON real_estate
  FOR ALL
  USING (auth.uid() = user_id);

-- leases
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can delete own leases" ON leases;
DROP POLICY IF EXISTS "Users can insert own leases" ON leases;
DROP POLICY IF EXISTS "Users can select own leases" ON leases;
DROP POLICY IF EXISTS "Users can update own leases" ON leases;

CREATE POLICY "Users can delete own leases"
  ON leases
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own leases"
  ON leases
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own leases"
  ON leases
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own leases"
  ON leases
  FOR UPDATE
  USING (auth.uid() = user_id);

-- lease_options
ALTER TABLE lease_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can delete own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can insert own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can select own lease options" ON lease_options;
DROP POLICY IF EXISTS "Users can update own lease options" ON lease_options;

CREATE POLICY "Users can delete own lease options"
  ON lease_options
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lease options"
  ON lease_options
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own lease options"
  ON lease_options
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own lease options"
  ON lease_options
  FOR UPDATE
  USING (auth.uid() = user_id);

-- equipment_inventory
ALTER TABLE equipment_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their equipment" ON equipment_inventory;

CREATE POLICY "Users own their equipment"
  ON equipment_inventory
  FOR ALL
  USING (auth.uid() = user_id);

-- store_loans
ALTER TABLE store_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their loans" ON store_loans;

CREATE POLICY "Users own their loans"
  ON store_loans
  FOR ALL
  USING (auth.uid() = user_id);

-- insurance_policies
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their insurance policies" ON insurance_policies;

CREATE POLICY "Users own their insurance policies"
  ON insurance_policies
  FOR ALL
  USING (auth.uid() = user_id);

-- insurance_claims
ALTER TABLE insurance_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their insurance claims" ON insurance_claims;

CREATE POLICY "Users own their insurance claims"
  ON insurance_claims
  FOR ALL
  USING (auth.uid() = user_id);

-- quickbooks_mapping
ALTER TABLE quickbooks_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their QB mappings" ON quickbooks_mapping;

CREATE POLICY "Users own their QB mappings"
  ON quickbooks_mapping
  FOR ALL
  USING (auth.uid() = user_id);

-- shared_reports
ALTER TABLE shared_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their shared reports" ON shared_reports;

CREATE POLICY "Users own their shared reports"
  ON shared_reports
  FOR ALL
  USING (auth.uid() = user_id);

-- categorization_rules
ALTER TABLE categorization_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their rules" ON categorization_rules;

CREATE POLICY "Users own their rules"
  ON categorization_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- transaction_audit_log
ALTER TABLE transaction_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access audit logs for their stores" ON transaction_audit_log;

CREATE POLICY "Users access audit logs for their stores"
  ON transaction_audit_log
  FOR ALL
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
  );

-- transaction_pl_links
ALTER TABLE transaction_pl_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access pl links for their stores" ON transaction_pl_links;

CREATE POLICY "Users access pl links for their stores"
  ON transaction_pl_links
  FOR ALL
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
  );
