-- Tighten feedback INSERT RLS: require auth.uid() = user_id.
-- Production had drifted to WITH CHECK ((auth.uid() = user_id) OR (auth.uid() IS NOT NULL)),
-- which allowed any authenticated user to insert feedback attributed to another user.
-- Application code always sets user_id from the signed-in user (FeedbackModal); no on-behalf-of flow exists.

DROP POLICY IF EXISTS "Users can insert own feedback" ON feedback;

CREATE POLICY "Users can insert own feedback"
  ON feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
