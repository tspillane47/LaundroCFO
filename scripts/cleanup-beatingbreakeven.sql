-- Cleanup erroneous data for beatingbreakeven@yahoo.com
-- User chose onboarding_path = 'join' but received an admin batch trial and created an owned store.
--
-- IDs (verified 2026-08-11):
--   user_id:         072cd1e3-0988-4c83-b071-29f93cbe997e
--   store_id:        82b66d93-128e-4b11-a569-5e2b179e3e61  (name: beatingbreakeven LLC)
--   subscription_id: 720abade-4f2f-4b66-a7f1-e58632204c06  (admin batch trial, no Stripe IDs)

BEGIN;

-- --- Pre-flight verification (expect 1 row each) ---
SELECT id, name, user_id, created_at
FROM stores
WHERE id = '82b66d93-128e-4b11-a569-5e2b179e3e61'
  AND user_id = '072cd1e3-0988-4c83-b071-29f93cbe997e'
  AND name = 'beatingbreakeven LLC';

SELECT id, user_id, status, plan, stripe_subscription_id, trial_ends_at, created_at
FROM subscriptions
WHERE user_id = '072cd1e3-0988-4c83-b071-29f93cbe997e'
  AND id = '720abade-4f2f-4b66-a7f1-e58632204c06'
  AND status = 'trialing'
  AND stripe_subscription_id IS NULL;

SELECT id, onboarding_path, onboarding_completed
FROM profiles
WHERE id = '072cd1e3-0988-4c83-b071-29f93cbe997e';

-- --- Delete store (child rows cascade via ON DELETE CASCADE on store_id FKs) ---
DELETE FROM stores
WHERE id = '82b66d93-128e-4b11-a569-5e2b179e3e61'
  AND user_id = '072cd1e3-0988-4c83-b071-29f93cbe997e'
  AND name = 'beatingbreakeven LLC';

-- --- Remove erroneous admin batch trial (join-path users should have no subscription row) ---
DELETE FROM subscriptions
WHERE user_id = '072cd1e3-0988-4c83-b071-29f93cbe997e'
  AND id = '720abade-4f2f-4b66-a7f1-e58632204c06'
  AND status = 'trialing'
  AND stripe_subscription_id IS NULL;

-- --- Post-flight verification (expect 0 rows) ---
SELECT id, name FROM stores WHERE user_id = '072cd1e3-0988-4c83-b071-29f93cbe997e';
SELECT id, status FROM subscriptions WHERE user_id = '072cd1e3-0988-4c83-b071-29f93cbe997e';

COMMIT;
