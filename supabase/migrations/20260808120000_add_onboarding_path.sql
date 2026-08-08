-- Track how the user completed onboarding: created their own store vs. joining someone else's.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_path text
  CHECK (onboarding_path IS NULL OR onboarding_path IN ('own', 'join'));

-- Existing completed users created a store through the wizard.
UPDATE profiles
SET onboarding_path = 'own'
WHERE onboarding_completed = true
  AND onboarding_path IS NULL;
