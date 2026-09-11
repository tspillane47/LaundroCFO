-- Day of month the loan payment actually hits. Already present in production;
-- IF NOT EXISTS keeps local/dev in sync. 31 is clamped to each month's last day in app math.

alter table store_loans
  add column if not exists payment_due_day integer;

alter table store_loans
  drop constraint if exists store_loans_payment_due_day_range;

alter table store_loans
  add constraint store_loans_payment_due_day_range
  check (payment_due_day is null or (payment_due_day >= 1 and payment_due_day <= 31));
