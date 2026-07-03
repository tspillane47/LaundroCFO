-- Allow success severity for point-in-time positive events in store_alerts.

ALTER TABLE store_alerts
  DROP CONSTRAINT IF EXISTS store_alerts_severity_check;

ALTER TABLE store_alerts
  ADD CONSTRAINT store_alerts_severity_check
  CHECK (severity IN ('danger', 'warning', 'info', 'success'));
