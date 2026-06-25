DROP POLICY IF EXISTS "Admins can view all feedback" ON feedback;
DROP POLICY IF EXISTS "Admins can update feedback" ON feedback;

CREATE POLICY "Admins can view all feedback" ON feedback FOR SELECT USING (auth.jwt() ->> 'email' = 'tuckerspillane7@gmail.com');
CREATE POLICY "Admins can update feedback" ON feedback FOR UPDATE USING (auth.jwt() ->> 'email' = 'tuckerspillane7@gmail.com');
