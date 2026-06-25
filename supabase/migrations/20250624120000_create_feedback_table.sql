CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  email text,
  store_id uuid,
  page_url text,
  feedback_type text,
  message text,
  status text DEFAULT 'new',
  priority text DEFAULT 'normal',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own feedback" ON feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all feedback" ON feedback FOR SELECT USING (auth.jwt() ->> 'email' = 'tuckerspillane7@gmail.com');
CREATE POLICY "Admins can update feedback" ON feedback FOR UPDATE USING (auth.jwt() ->> 'email' = 'tuckerspillane7@gmail.com');
