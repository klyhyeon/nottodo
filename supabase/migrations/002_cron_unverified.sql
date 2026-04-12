-- Requires pg_cron extension (enabled in Supabase dashboard)
-- Runs at midnight KST (15:00 UTC previous day)
SELECT cron.schedule(
  'mark-unverified',
  '0 15 * * *',
  $$
    UPDATE prohibitions
    SET status = 'unverified', updated_at = now()
    WHERE status = 'active' AND date < CURRENT_DATE;

    INSERT INTO prohibitions (user_id, title, emoji, difficulty, type, start_time, end_time, date, is_recurring)
    SELECT user_id, title, emoji, difficulty, type, start_time, end_time, CURRENT_DATE, true
    FROM prohibitions
    WHERE is_recurring = true
      AND date = CURRENT_DATE - INTERVAL '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM prohibitions p2
        WHERE p2.user_id = prohibitions.user_id
          AND p2.title = prohibitions.title
          AND p2.date = CURRENT_DATE
      );
  $$
);
