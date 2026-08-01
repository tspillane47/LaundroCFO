-- Notification preferences referenced by the app; digest cursor for daily alert emails.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_summary boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS monthly_report boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS rent_escalation_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_alert_digest_sent_at timestamptz;
