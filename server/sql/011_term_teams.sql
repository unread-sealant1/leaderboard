ALTER TABLE teams
ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'teams'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'teams_name_key'
  ) THEN
    ALTER TABLE teams DROP CONSTRAINT teams_name_key;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS team_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(team_id, student_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_phase_name_unique ON teams(phase_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_teams_phase_archived ON teams(phase_id, is_archived, name);
CREATE INDEX IF NOT EXISTS idx_team_memberships_student ON team_memberships(student_id);

WITH default_phase AS (
  SELECT current_phase_id AS phase_id
  FROM tv_settings
  WHERE current_phase_id IS NOT NULL
  LIMIT 1
), fallback_phase AS (
  SELECT id AS phase_id
  FROM phases
  ORDER BY phase_order ASC, created_at ASC
  LIMIT 1
), chosen_phase AS (
  SELECT phase_id FROM default_phase
  UNION ALL
  SELECT phase_id FROM fallback_phase
  LIMIT 1
)
UPDATE teams
SET phase_id = (SELECT phase_id FROM chosen_phase)
WHERE phase_id IS NULL
  AND EXISTS (SELECT 1 FROM chosen_phase);

INSERT INTO team_memberships (team_id, student_id)
SELECT s.team_id, s.id
FROM students s
JOIN teams t ON t.id = s.team_id
WHERE s.team_id IS NOT NULL
ON CONFLICT DO NOTHING;
