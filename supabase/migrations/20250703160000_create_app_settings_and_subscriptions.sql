-- App-wide settings (beta_mode) and per-user subscription tracking for Stripe (Phase 2+).

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value)
VALUES ('beta_mode', to_jsonb(true))
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('starter', 'pro', 'growth')),
  status text NOT NULL CHECK (
    status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete')
  ),
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON subscriptions (user_id);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- beta_mode is public UI state (marketing pages read it without auth).
DROP POLICY IF EXISTS "Anyone can read app settings" ON app_settings;
CREATE POLICY "Anyone can read app settings"
  ON app_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can update app settings" ON app_settings;
CREATE POLICY "Admins can update app settings"
  ON app_settings
  FOR UPDATE
  USING (auth.jwt() ->> 'email' = 'tuckerspillane7@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'tuckerspillane7@gmail.com');

DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;
CREATE POLICY "Users can read own subscription"
  ON subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);
