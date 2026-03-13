ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS school_period_id UUID REFERENCES school_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_attendance_external
  ON attendance(external_source, external_id);

CREATE INDEX IF NOT EXISTS idx_attendance_school_period_date
  ON attendance(school_period_id, attendance_date);
