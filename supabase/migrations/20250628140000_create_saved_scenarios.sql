CREATE TABLE saved_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_name text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}',
  outputs jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX saved_scenarios_store_id_idx ON saved_scenarios(store_id);
CREATE INDEX saved_scenarios_user_id_idx ON saved_scenarios(user_id);

ALTER TABLE saved_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved scenarios"
  ON saved_scenarios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved scenarios"
  ON saved_scenarios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved scenarios"
  ON saved_scenarios FOR DELETE
  USING (auth.uid() = user_id);
