CREATE TABLE IF NOT EXISTS sprint_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream TEXT NOT NULL CHECK (stream IN ('meta', 'webdev')),
  term INT NOT NULL CHECK (term >= 1 AND term <= 5),
  sprint_start INT NOT NULL CHECK (sprint_start >= 1),
  sprint_end INT NOT NULL CHECK (sprint_end >= sprint_start),
  topic TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(stream, term)
);

CREATE INDEX IF NOT EXISTS idx_sprint_definitions_stream_term
  ON sprint_definitions(stream, term);
