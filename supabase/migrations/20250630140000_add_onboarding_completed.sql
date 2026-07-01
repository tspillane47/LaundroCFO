-- Track whether a user has completed the post-signup onboarding wizard.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Existing users who already created stores should not be sent through onboarding again.
UPDATE profiles
SET onboarding_completed = true
WHERE id IN (SELECT DISTINCT user_id FROM stores WHERE user_id IS NOT NULL);
