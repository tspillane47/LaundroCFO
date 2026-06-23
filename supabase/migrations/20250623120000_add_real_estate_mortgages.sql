-- Store multiple building mortgages as a JSON array on real_estate.
-- Each element: { "lender_name": string, "monthly_payment": number, "balance": number }

ALTER TABLE real_estate
ADD COLUMN IF NOT EXISTS mortgages jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill existing single-mortgage rows into the array column.
UPDATE real_estate
SET mortgages = jsonb_build_array(
  jsonb_build_object(
    'lender_name', COALESCE(mortgage_lender, ''),
    'monthly_payment', COALESCE(monthly_mortgage_payment, 0),
    'balance', COALESCE(current_loan_balance, 0)
  )
)
WHERE mortgages = '[]'::jsonb
  AND (
    mortgage_lender IS NOT NULL
    OR monthly_mortgage_payment IS NOT NULL
    OR current_loan_balance IS NOT NULL
  );
