-- Stage 2E: Co-owner read access on integration connection tables.
-- plaid_connections and quickbooks_connections were created with SELECT-only RLS
-- scoped to auth.uid() = user_id (connecting owner). Writes remain server-side
-- only via service role (no INSERT/UPDATE/DELETE policies on these tables).

-- ---------------------------------------------------------------------------
-- plaid_connections
-- Before: "Users can read own Plaid connections" — auth.uid() = user_id
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read accessible Plaid connections" ON plaid_connections;
DROP POLICY IF EXISTS "Users can read own Plaid connections" ON plaid_connections;

CREATE POLICY "Users can read accessible Plaid connections"
  ON plaid_connections
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

-- ---------------------------------------------------------------------------
-- quickbooks_connections
-- Before: "Users can read own QB connections" — auth.uid() = user_id
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read accessible QB connections" ON quickbooks_connections;
DROP POLICY IF EXISTS "Users can read own QB connections" ON quickbooks_connections;

CREATE POLICY "Users can read accessible QB connections"
  ON quickbooks_connections
  FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));
