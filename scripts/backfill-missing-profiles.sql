-- One-time backfill: 4 auth.users created before on_auth_user_created existed
-- (2026-06-07..06-23). Do NOT re-run after review unless the 4 IDs still
-- have no profiles row.
--
-- Onboarding:
--   Store owners → completed + path 'own' (same rule as
--   20250630140000_add_onboarding_completed / 20260808120000_add_onboarding_path).
--   skiersblow25 has zero stores → leave incomplete so /onboarding still runs.
--
-- created_at is copied from auth.users so admin 7d/30d signup counts stay honest.
-- terms_accepted_at is NULL — no historical acceptance timestamp exists.

INSERT INTO public.profiles (id, terms_accepted_at, onboarding_completed, onboarding_path, created_at)
VALUES
  -- tuckerspillane7@gmail.com — owns "7 cool road LLC"
  (
    '70469175-36a7-4e3f-bfbb-2ba719cc8567',
    NULL,
    true,
    'own',
    '2026-06-07T15:52:51.10287Z'
  ),
  -- khspillane@gmail.com — owns Maple St Laundry, Church St Laundry
  (
    '62ec4ed1-0961-4a07-a55c-99fe6d966ca7',
    NULL,
    true,
    'own',
    '2026-06-11T00:54:01.597497Z'
  ),
  -- giles.crellybyers@gmail.com — owns Sunnyside Suds and Buds
  (
    'c004513d-069b-43d5-814f-9fb7d7e0ddeb',
    NULL,
    true,
    'own',
    '2026-06-14T11:40:08.576493Z'
  ),
  -- skiersblow25@aol.com — no stores
  (
    '5304219c-2629-465f-bb60-d4e85f290275',
    NULL,
    false,
    NULL,
    '2026-06-23T12:56:29.681936Z'
  )
ON CONFLICT (id) DO NOTHING;
