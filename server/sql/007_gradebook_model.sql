CREATE TABLE IF NOT EXISTS school_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  external_source TEXT,
  external_id TEXT UNIQUE,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE terms
  ADD COLUMN IF NOT EXISTS school_period_id UUID REFERENCES school_periods(id) ON DELETE SET NULL;
ALTER TABLE terms
  ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE terms
  ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE terms
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_terms_external
  ON terms(external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,
  stream TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  external_source TEXT,
  external_id TEXT UNIQUE,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grade_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_source TEXT,
  external_id TEXT UNIQUE,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gradebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  term_id UUID REFERENCES terms(id) ON DELETE CASCADE,
  school_period_id UUID REFERENCES school_periods(id) ON DELETE SET NULL,
  class_course_external_id TEXT,
  name TEXT NOT NULL,
  stream TEXT,
  grade_mapping_id UUID REFERENCES grade_mappings(id) ON DELETE SET NULL,
  parent_gradebook_id UUID REFERENCES gradebooks(id) ON DELETE SET NULL,
  external_source TEXT,
  external_id TEXT UNIQUE,
  grade_type INT,
  position INT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gradebook_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID REFERENCES terms(id) ON DELETE CASCADE,
  school_period_id UUID REFERENCES school_periods(id) ON DELETE SET NULL,
  gradebook_id UUID NOT NULL REFERENCES gradebooks(id) ON DELETE CASCADE,
  value NUMERIC(10,2) NOT NULL,
  external_source TEXT,
  external_id TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(student_id, term_id, gradebook_id)
);

CREATE INDEX IF NOT EXISTS idx_gradebooks_term_stream
  ON gradebooks(term_id, stream);
CREATE INDEX IF NOT EXISTS idx_gradebook_values_student_term
  ON gradebook_values(student_id, term_id);
