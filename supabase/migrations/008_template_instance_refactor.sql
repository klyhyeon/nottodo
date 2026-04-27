-- supabase/migrations/008_template_instance_refactor.sql

-- 1. Create prohibition_templates table
CREATE TABLE prohibition_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  emoji text NOT NULL DEFAULT '🚫',
  difficulty int NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  type prohibition_type NOT NULL DEFAULT 'all_day',
  start_time time,
  end_time time,
  verify_deadline_hours int NOT NULL DEFAULT 2 CHECK (verify_deadline_hours BETWEEN 0 AND 12),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prohibition_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own templates" ON prohibition_templates
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON prohibition_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON prohibition_templates
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON prohibition_templates
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_templates_user_active ON prohibition_templates (user_id) WHERE active = true;

-- updated_at trigger (reuse existing function from migration 004)
CREATE TRIGGER templates_set_updated_at
  BEFORE UPDATE ON prohibition_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Unique: one active template per user per title
CREATE UNIQUE INDEX idx_templates_user_title_active
  ON prohibition_templates (user_id, title)
  WHERE active = true;

-- 2. Add template_id to prohibitions
ALTER TABLE prohibitions
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES prohibition_templates(id) ON DELETE SET NULL;

-- 3. Migrate: create templates from existing recurring groups
INSERT INTO prohibition_templates (id, user_id, title, emoji, difficulty, type, start_time, end_time, verify_deadline_hours, active, created_at)
SELECT DISTINCT ON (recurring_group_id)
  recurring_group_id,
  user_id,
  title,
  emoji,
  difficulty,
  type,
  start_time,
  end_time,
  verify_deadline_hours,
  (deleted_at IS NULL),  -- if all in group are deleted, template is inactive
  MIN(created_at) OVER (PARTITION BY recurring_group_id)
FROM prohibitions
WHERE is_recurring = true
  AND recurring_group_id IS NOT NULL
ORDER BY recurring_group_id, date DESC;

-- For deleted groups: mark template inactive
UPDATE prohibition_templates t
SET active = false
WHERE NOT EXISTS (
  SELECT 1 FROM prohibitions p
  WHERE p.recurring_group_id = t.id
    AND p.deleted_at IS NULL
);

-- 4. Backfill template_id on existing recurring instances
UPDATE prohibitions
SET template_id = recurring_group_id
WHERE is_recurring = true
  AND recurring_group_id IS NOT NULL;

-- 5. Index for template_id lookups
CREATE INDEX idx_prohibitions_template_date ON prohibitions (template_id, date)
  WHERE template_id IS NOT NULL AND deleted_at IS NULL;

-- 6. Replace cron job — only mark unverified, NO row copying
DO $$
DECLARE
  old_job_id integer;
BEGIN
  SELECT jobid INTO old_job_id
  FROM cron.job WHERE jobname = 'mark-unverified' LIMIT 1;
  IF old_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(old_job_id);
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
  $$
);

-- 7. Drop unused RPCs and triggers
DROP FUNCTION IF EXISTS delete_recurring_group(uuid);
DROP TRIGGER IF EXISTS prohibitions_set_recurring_group_id ON prohibitions;
DROP FUNCTION IF EXISTS set_recurring_group_id();
