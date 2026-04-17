-- Requires pg_cron extension (enabled in Supabase dashboard)
-- Runs every hour to catch expired verify deadlines
-- Uses KST (Asia/Seoul) for date comparisons
SELECT cron.schedule(
  'mark-unverified',
  '0 * * * *',
  $$
    UPDATE prohibitions
    SET status = 'unverified', updated_at = now()
    WHERE status = 'active'
      AND (
        CASE
          -- timed type: deadline = end_time (+ 1 day if crosses midnight) + verify_deadline_hours
          WHEN type = 'timed' AND end_time IS NOT NULL THEN
            ((date + end_time +
              CASE WHEN start_time IS NOT NULL AND end_time < start_time
                THEN INTERVAL '1 day' ELSE INTERVAL '0' END
              + (verify_deadline_hours * INTERVAL '1 hour')
            ) AT TIME ZONE 'Asia/Seoul') < now()
          -- all_day type: deadline = next midnight KST + verify_deadline_hours
          ELSE
            ((date + INTERVAL '1 day' + (verify_deadline_hours * INTERVAL '1 hour')
            ) AT TIME ZONE 'Asia/Seoul') < now()
        END
      );

    -- Recurring: create today's copy if not exists (KST 기준)
    INSERT INTO prohibitions (user_id, title, emoji, difficulty, type, start_time, end_time, date, is_recurring, verify_deadline_hours)
    SELECT user_id, title, emoji, difficulty, type, start_time, end_time,
           (now() AT TIME ZONE 'Asia/Seoul')::date, true, verify_deadline_hours
    FROM prohibitions
    WHERE is_recurring = true
      AND date = (now() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM prohibitions p2
        WHERE p2.user_id = prohibitions.user_id
          AND p2.title = prohibitions.title
          AND p2.date = (now() AT TIME ZONE 'Asia/Seoul')::date
      );
  $$
);
