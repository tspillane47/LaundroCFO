CREATE TABLE saved_loan_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}',
  outputs jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX saved_loan_calculations_store_id_idx ON saved_loan_calculations(store_id);
CREATE INDEX saved_loan_calculations_user_id_idx ON saved_loan_calculations(user_id);

ALTER TABLE saved_loan_calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved loan calculations"
  ON saved_loan_calculations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved loan calculations"
  ON saved_loan_calculations FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_write(auth.uid()));

CREATE POLICY "Users can delete own saved loan calculations"
  ON saved_loan_calculations FOR DELETE
  USING (auth.uid() = user_id AND user_can_write(auth.uid()));
