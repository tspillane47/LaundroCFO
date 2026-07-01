-- Per-store opt-in for LaundroCFO Network Benchmarking (default: off).

alter table stores
  add column if not exists network_benchmark_opted_in boolean not null default false;

alter table stores
  add column if not exists network_benchmark_opted_in_at timestamptz;

-- Returns only an aggregate count — no store identifiers or financial data.
create or replace function get_network_benchmark_contributor_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from stores
  where network_benchmark_opted_in = true
    and (archived is null or archived = false);
$$;

revoke all on function get_network_benchmark_contributor_count() from public;
grant execute on function get_network_benchmark_contributor_count() to authenticated;
