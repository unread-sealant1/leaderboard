CREATE TABLE IF NOT EXISTS stream_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES phases(id) ON DELETE CASCADE,
  stream TEXT NOT NULL DEFAULT 'meta',
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  skill_key TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT 'Admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stream_comments_scope
  ON stream_comments(stream, phase_id, team_id, skill_key, created_at DESC);
