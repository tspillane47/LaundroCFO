-- Defense-in-depth CHECK constraints for non-negative financial values.
-- Production data was audited with scripts/audit-negative-financial-values.ts (0 violations).
-- Apply manually in Supabase SQL Editor after review.

-- monthly_financials (all numeric P&L columns are NOT NULL with default 0)
alter table monthly_financials
  drop constraint if exists monthly_financials_revenue_non_negative;

alter table monthly_financials
  add constraint monthly_financials_revenue_non_negative
  check (revenue >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_self_service_revenue_non_negative;

alter table monthly_financials
  add constraint monthly_financials_self_service_revenue_non_negative
  check (self_service_revenue >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_wdf_revenue_non_negative;

alter table monthly_financials
  add constraint monthly_financials_wdf_revenue_non_negative
  check (wdf_revenue >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_commercial_revenue_non_negative;

alter table monthly_financials
  add constraint monthly_financials_commercial_revenue_non_negative
  check (commercial_revenue >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_vending_revenue_non_negative;

alter table monthly_financials
  add constraint monthly_financials_vending_revenue_non_negative
  check (vending_revenue >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_other_revenue_non_negative;

alter table monthly_financials
  add constraint monthly_financials_other_revenue_non_negative
  check (other_revenue >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_utilities_non_negative;

alter table monthly_financials
  add constraint monthly_financials_utilities_non_negative
  check (utilities >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_rent_non_negative;

alter table monthly_financials
  add constraint monthly_financials_rent_non_negative
  check (rent >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_payroll_non_negative;

alter table monthly_financials
  add constraint monthly_financials_payroll_non_negative
  check (payroll >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_repairs_maintenance_non_negative;

alter table monthly_financials
  add constraint monthly_financials_repairs_maintenance_non_negative
  check (repairs_maintenance >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_insurance_expense_non_negative;

alter table monthly_financials
  add constraint monthly_financials_insurance_expense_non_negative
  check (insurance_expense >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_supplies_non_negative;

alter table monthly_financials
  add constraint monthly_financials_supplies_non_negative
  check (supplies >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_marketing_non_negative;

alter table monthly_financials
  add constraint monthly_financials_marketing_non_negative
  check (marketing >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_professional_fees_non_negative;

alter table monthly_financials
  add constraint monthly_financials_professional_fees_non_negative
  check (professional_fees >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_software_subscriptions_non_negative;

alter table monthly_financials
  add constraint monthly_financials_software_subscriptions_non_negative
  check (software_subscriptions >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_cc_processing_fees_non_negative;

alter table monthly_financials
  add constraint monthly_financials_cc_processing_fees_non_negative
  check (cc_processing_fees >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_bank_charges_non_negative;

alter table monthly_financials
  add constraint monthly_financials_bank_charges_non_negative
  check (bank_charges >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_other_expenses_non_negative;

alter table monthly_financials
  add constraint monthly_financials_other_expenses_non_negative
  check (other_expenses >= 0);

alter table monthly_financials
  drop constraint if exists monthly_financials_debt_service_non_negative;

alter table monthly_financials
  add constraint monthly_financials_debt_service_non_negative
  check (debt_service >= 0);

-- monthly_utilities
alter table monthly_utilities
  drop constraint if exists monthly_utilities_water_non_negative;

alter table monthly_utilities
  add constraint monthly_utilities_water_non_negative
  check (water >= 0);

alter table monthly_utilities
  drop constraint if exists monthly_utilities_gas_non_negative;

alter table monthly_utilities
  add constraint monthly_utilities_gas_non_negative
  check (gas >= 0);

alter table monthly_utilities
  drop constraint if exists monthly_utilities_electric_non_negative;

alter table monthly_utilities
  add constraint monthly_utilities_electric_non_negative
  check (electric >= 0);

alter table monthly_utilities
  drop constraint if exists monthly_utilities_sewer_non_negative;

alter table monthly_utilities
  add constraint monthly_utilities_sewer_non_negative
  check (sewer >= 0);

alter table monthly_utilities
  drop constraint if exists monthly_utilities_trash_non_negative;

alter table monthly_utilities
  add constraint monthly_utilities_trash_non_negative
  check (trash >= 0);

alter table monthly_utilities
  drop constraint if exists monthly_utilities_internet_non_negative;

alter table monthly_utilities
  add constraint monthly_utilities_internet_non_negative
  check (internet >= 0);

-- store_loans (nullable balance/rate fields)
alter table store_loans
  drop constraint if exists store_loans_original_balance_non_negative;

alter table store_loans
  add constraint store_loans_original_balance_non_negative
  check (original_balance is null or original_balance >= 0);

alter table store_loans
  drop constraint if exists store_loans_current_balance_non_negative;

alter table store_loans
  add constraint store_loans_current_balance_non_negative
  check (current_balance is null or current_balance >= 0);

alter table store_loans
  drop constraint if exists store_loans_interest_rate_non_negative;

alter table store_loans
  add constraint store_loans_interest_rate_non_negative
  check (interest_rate is null or interest_rate >= 0);

alter table store_loans
  drop constraint if exists store_loans_monthly_payment_non_negative;

alter table store_loans
  add constraint store_loans_monthly_payment_non_negative
  check (monthly_payment is null or monthly_payment >= 0);

alter table store_loans
  drop constraint if exists store_loans_balloon_amount_non_negative;

alter table store_loans
  add constraint store_loans_balloon_amount_non_negative
  check (balloon_amount is null or balloon_amount >= 0);
