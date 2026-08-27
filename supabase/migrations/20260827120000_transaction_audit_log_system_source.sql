-- Allow server-side Plaid duplicate reconciliation to write an audit trail
-- on the surviving transaction without impersonating a user/rule/import action.

ALTER TABLE transaction_audit_log
  DROP CONSTRAINT IF EXISTS transaction_audit_log_change_source_check;

ALTER TABLE transaction_audit_log
  ADD CONSTRAINT transaction_audit_log_change_source_check
  CHECK (change_source IN ('user', 'rule', 'import', 'system'));
