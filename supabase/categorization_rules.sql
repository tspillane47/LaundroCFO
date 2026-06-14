-- Run this in the Supabase SQL Editor to enable categorization rules.

create table if not exists categorization_rules (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  vendor_pattern text not null,
  category text not null,
  created_at timestamp default now()
);

-- Amount-based rules (run after initial table creation):
-- alter table categorization_rules add column if not exists rule_type text default 'vendor';
-- alter table categorization_rules add column if not exists amount numeric;
-- alter table categorization_rules add column if not exists amount_tolerance numeric default 0.01;
-- alter table categorization_rules add column if not exists transaction_type text;

alter table categorization_rules enable row level security;

create policy "Users own their rules"
  on categorization_rules
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
