ALTER TABLE tv_settings
ADD COLUMN IF NOT EXISTS loop_seconds INT DEFAULT 12,
ADD COLUMN IF NOT EXISTS screen_mode TEXT DEFAULT 'playlist',
  ADD COLUMN IF NOT EXISTS enabled_screens JSONB DEFAULT '["topic_team_dials","meta_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","comments_screen","notifications_screen","meta_skills_1","meta_skills_2"]'::jsonb,
  ADD COLUMN IF NOT EXISTS screen_order JSONB DEFAULT '["welcome_screen","topic_team_dials","meta_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","comments_screen","notifications_screen","meta_skills_1","meta_skills_2"]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_screen TEXT DEFAULT 'topic_team_dials',
ADD COLUMN IF NOT EXISTS rotation_mode TEXT DEFAULT 'topic',
ADD COLUMN IF NOT EXISTS rotation_order JSONB DEFAULT '["meta","digital","coaching","alerts"]'::jsonb,
ADD COLUMN IF NOT EXISTS enabled_streams JSONB DEFAULT '["digital","meta","coaching","alerts"]'::jsonb,
ADD COLUMN IF NOT EXISTS topic_scope TEXT DEFAULT 'phase';
