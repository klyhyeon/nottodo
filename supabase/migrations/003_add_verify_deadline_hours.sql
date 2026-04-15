-- Add verify_deadline_hours column to existing prohibitions table
ALTER TABLE prohibitions
  ADD COLUMN IF NOT EXISTS verify_deadline_hours int NOT NULL DEFAULT 2
  CHECK (verify_deadline_hours BETWEEN 0 AND 12);

-- Allow updating yesterday's prohibitions (for cross-midnight deadline handling)
DROP POLICY IF EXISTS "Users can update own recent prohibitions" ON prohibitions;
CREATE POLICY "Users can update own recent prohibitions" ON prohibitions FOR UPDATE USING (
  auth.uid() = user_id AND date >= CURRENT_DATE - INTERVAL '1 day'
);
