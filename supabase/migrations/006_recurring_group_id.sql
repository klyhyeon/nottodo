-- Use a stable recurring group id instead of title-based grouping.
ALTER TABLE prohibitions
  ADD COLUMN IF NOT EXISTS recurring_group_id uuid;

-- Backfill recurring_group_id by legacy title groups (per user).
WITH recurring_group_seed AS (
  SELECT user_id, title, (MIN(id::text))::uuid AS group_id
  FROM prohibitions
  WHERE is_recurring = true
  GROUP BY user_id, title
)
UPDATE prohibitions p
SET recurring_group_id = s.group_id
FROM recurring_group_seed s
WHERE p.is_recurring = true
  AND p.user_id = s.user_id
  AND p.title = s.title
  AND p.recurring_group_id IS NULL;

-- Keep group id stable for recurring rows on insert/update.
CREATE OR REPLACE FUNCTION set_recurring_group_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_recurring = true THEN
    IF NEW.recurring_group_id IS NULL THEN
      NEW.recurring_group_id = NEW.id;
    END IF;
  ELSE
    NEW.recurring_group_id = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prohibitions_set_recurring_group_id ON prohibitions;
CREATE TRIGGER prohibitions_set_recurring_group_id
  BEFORE INSERT OR UPDATE ON prohibitions
  FOR EACH ROW
  EXECUTE FUNCTION set_recurring_group_id();

-- Recurring rows must be unique by (user, recurring_group, date).
CREATE UNIQUE INDEX IF NOT EXISTS idx_prohibitions_user_recurring_group_date_unique
ON prohibitions (user_id, recurring_group_id, date)
WHERE recurring_group_id IS NOT NULL AND deleted_at IS NULL;

-- Recreate cron job so recurring copy generation uses recurring_group_id.
DO $$
DECLARE
  mark_unverified_job_id integer;
BEGIN
  SELECT jobid
    INTO mark_unverified_job_id
  FROM cron.job
  WHERE jobname = 'mark-unverified'
  LIMIT 1;

  IF mark_unverified_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(mark_unverified_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'mark-unverified',
  '0 * * * *',
  $$
    UPDATE prohibitions
    SET status = 'unverified', updated_at = now()
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND (
        CASE
          WHEN type = 'timed' AND end_time IS NOT NULL THEN
            ((date + end_time +
              CASE WHEN start_time IS NOT NULL AND end_time < start_time
                THEN INTERVAL '1 day' ELSE INTERVAL '0' END
              + (verify_deadline_hours * INTERVAL '1 hour')
            ) AT TIME ZONE 'Asia/Seoul') < now()
          ELSE
            ((date + INTERVAL '1 day' + (verify_deadline_hours * INTERVAL '1 hour')
            ) AT TIME ZONE 'Asia/Seoul') < now()
        END
      );

    INSERT INTO prohibitions (
      user_id, recurring_group_id, title, emoji, difficulty, type, start_time, end_time, date, is_recurring, verify_deadline_hours
    )
    SELECT
      p.user_id,
      p.recurring_group_id,
      p.title,
      p.emoji,
      p.difficulty,
      p.type,
      p.start_time,
      p.end_time,
      (now() AT TIME ZONE 'Asia/Seoul')::date,
      true,
      p.verify_deadline_hours
    FROM prohibitions p
    WHERE p.is_recurring = true
      AND p.deleted_at IS NULL
      AND p.date = (now() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day'
      AND NOT EXISTS (
        SELECT 1
        FROM prohibitions p2
        WHERE p2.user_id = p.user_id
          AND p2.recurring_group_id = p.recurring_group_id
          AND p2.date = (now() AT TIME ZONE 'Asia/Seoul')::date
          AND p2.deleted_at IS NULL
      );
  $$
);
