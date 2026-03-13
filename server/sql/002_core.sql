-- 002_core.sql

-- Terms (Term 1, Term 2)
CREATE TABLE IF NOT EXISTS terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  school_period_id UUID,
  external_source TEXT,
  external_id TEXT,
  last_synced_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Phases belong to a term (Phase 1..5)
CREATE TABLE IF NOT EXISTS phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  phase_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Teams (Team 1..4)
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phase_id UUID REFERENCES phases(id) ON DELETE CASCADE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE CASCADE;

-- Students (Web Dev cohort)
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|inactive|deactivated|archived|deleted
  external_source TEXT,
  external_id TEXT,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(team_id, student_id)
);

-- Topics belong to a phase and a stream
-- stream: meta|digital|coaching
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  stream TEXT NOT NULL,
  title TEXT NOT NULL,
  week_number INT,
  max_score INT NOT NULL DEFAULT 100,
  external_source TEXT,
  external_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Grades for a student per topic
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  external_source TEXT,
  external_id TEXT,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(student_id, topic_id)
);

-- Attendance per day
-- status: present|late|absent
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(student_id, attendance_date)
);

-- Coaching sessions (attended true/false)
CREATE TABLE IF NOT EXISTS coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  attended BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- TV settings (single row)
CREATE TABLE IF NOT EXISTS tv_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  current_term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
  current_phase_id UUID REFERENCES phases(id) ON DELETE SET NULL,
  current_stream TEXT NOT NULL DEFAULT 'meta',
  current_topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  loop_seconds INT NOT NULL DEFAULT 12,
  slide_seconds INT NOT NULL DEFAULT 12,
  screen_mode TEXT NOT NULL DEFAULT 'playlist',
  enabled_screens JSONB NOT NULL DEFAULT '["topic_team_dials","meta_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","comments_screen","notifications_screen","meta_skills_1","meta_skills_2"]'::jsonb,
  screen_order JSONB NOT NULL DEFAULT '["welcome_screen","topic_team_dials","meta_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","comments_screen","notifications_screen","meta_skills_1","meta_skills_2"]'::jsonb,
  current_screen TEXT NOT NULL DEFAULT 'topic_team_dials',
  rotation_mode TEXT NOT NULL DEFAULT 'topic',
  rotation_order JSONB NOT NULL DEFAULT '["meta","digital","coaching","alerts"]'::jsonb,
  enabled_streams JSONB NOT NULL DEFAULT '["digital","meta","coaching","alerts"]'::jsonb,
  topic_scope TEXT NOT NULL DEFAULT 'phase',
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- TV messages/alerts ticker
CREATE TABLE IF NOT EXISTS tv_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_phase_name_unique ON teams(phase_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_teams_phase_archived ON teams(phase_id, is_archived, name);
CREATE INDEX IF NOT EXISTS idx_team_memberships_student ON team_memberships(student_id);
