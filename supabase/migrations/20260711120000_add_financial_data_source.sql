-- Track financial data provenance at store and month level.
-- Enables manual-edit protection and source exclusivity for QuickBooks / bank import.

alter table stores
  add column if not exists financial_data_source text not null default 'manual';

alter table stores
  drop constraint if exists stores_financial_data_source_check;

alter table stores
  add constraint stores_financial_data_source_check
  check (financial_data_source in ('manual', 'quickbooks', 'bank_import'));

alter table monthly_financials
  add column if not exists data_source text not null default 'manual';

alter table monthly_financials
  drop constraint if exists monthly_financials_data_source_check;

alter table monthly_financials
  add constraint monthly_financials_data_source_check
  check (data_source in ('manual', 'quickbooks', 'bank_import'));

alter table monthly_financials
  add column if not exists manually_overridden_at timestamptz;

-- Backfill existing rows: treat all prior data as manual (safe default).
update monthly_financials
set data_source = 'manual'
where data_source is distinct from 'manual';
