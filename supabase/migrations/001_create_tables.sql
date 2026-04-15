-- Enums
CREATE TYPE prohibition_type AS ENUM ('all_day', 'timed');
CREATE TYPE prohibition_status AS ENUM ('active', 'succeeded', 'failed', 'unverified');
CREATE TYPE badge_type AS ENUM ('me_too', 'tomorrow', 'fighting');

-- Users
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_name text NOT NULL,
  anonymous_emoji text NOT NULL DEFAULT '🐼',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own row" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own row" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Prohibitions
CREATE TABLE prohibitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  emoji text NOT NULL DEFAULT '🚫',
  difficulty int NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  type prohibition_type NOT NULL DEFAULT 'all_day',
  start_time time,
  end_time time,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status prohibition_status NOT NULL DEFAULT 'active',
  is_recurring boolean NOT NULL DEFAULT false,
  verify_deadline_hours int NOT NULL DEFAULT 2 CHECK (verify_deadline_hours BETWEEN 0 AND 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prohibitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own prohibitions" ON prohibitions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own prohibitions" ON prohibitions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recent prohibitions" ON prohibitions FOR UPDATE USING (
  auth.uid() = user_id AND date >= CURRENT_DATE - INTERVAL '1 day'
);
CREATE POLICY "Users can delete own prohibitions" ON prohibitions FOR DELETE USING (auth.uid() = user_id);

-- Confessions
CREATE TABLE confessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prohibition_id uuid NOT NULL REFERENCES prohibitions(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 300),
  category text NOT NULL DEFAULT '🚫',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE confessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authed can read confessions" ON confessions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert own confessions" ON confessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Badges
CREATE TABLE badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confession_id uuid NOT NULL REFERENCES confessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type badge_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (confession_id, user_id, type)
);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authed can read badges" ON badges FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert own badges" ON badges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own badges" ON badges FOR DELETE USING (auth.uid() = user_id);

-- Badge counts view
CREATE VIEW confession_badge_counts AS
SELECT
  confession_id,
  COUNT(*) FILTER (WHERE type = 'me_too') AS me_too_count,
  COUNT(*) FILTER (WHERE type = 'tomorrow') AS tomorrow_count,
  COUNT(*) FILTER (WHERE type = 'fighting') AS fighting_count
FROM badges
GROUP BY confession_id;
