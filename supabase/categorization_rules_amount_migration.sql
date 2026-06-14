-- Run this in the Supabase SQL Editor to add amount-based categorization rules.

alter table categorization_rules add column if not exists rule_type text default 'vendor';
alter table categorization_rules add column if not exists amount numeric;
alter table categorization_rules add column if not exists amount_tolerance numeric default 0.01;
alter table categorization_rules add column if not exists transaction_type text;
