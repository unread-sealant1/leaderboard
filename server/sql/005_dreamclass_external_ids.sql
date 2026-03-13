-- DreamClass sync support columns (Postgres)

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE grades
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_students_external ON students (external_source, external_id);
CREATE INDEX IF NOT EXISTS idx_topics_external ON topics (external_source, external_id);
CREATE INDEX IF NOT EXISTS idx_grades_external ON grades (external_source, external_id);
