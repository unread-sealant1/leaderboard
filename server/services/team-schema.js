const db = require("../db-sqlite");

async function resolveDefaultPhaseId() {
  const settings = (await db.query("SELECT current_phase_id FROM tv_settings LIMIT 1")).rows[0] || null;
  if (settings?.current_phase_id) return settings.current_phase_id;
  return (
    await db.query("SELECT id FROM phases ORDER BY phase_order ASC, created_at ASC LIMIT 1")
  ).rows[0]?.id || null;
}

async function backfillLegacyTeams() {
  const phaseId = await resolveDefaultPhaseId();
  if (!phaseId) return;

  await db.query(`UPDATE teams SET phase_id=$1 WHERE phase_id IS NULL`, [phaseId]);

  await db.query(
    `INSERT INTO team_memberships (team_id, student_id)
     SELECT s.team_id, s.id
     FROM students s
     JOIN teams t ON t.id = s.team_id
     WHERE s.team_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM team_memberships tm
         WHERE tm.team_id = s.team_id
           AND tm.student_id = s.id
       )`
    , []
  );
}

async function ensureTeamSchema() {
  if (ensureTeamSchema._done) return;

  if (process.env.DATABASE_URL) {
    await db.query(
      `ALTER TABLE teams
       ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE CASCADE`
    );
    await db.query(
      `CREATE TABLE IF NOT EXISTS team_memberships (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
         student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
         created_at TIMESTAMP NOT NULL DEFAULT now(),
         UNIQUE(team_id, student_id)
       )`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_teams_phase_archived
       ON teams(phase_id, is_archived, name)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_team_memberships_student
       ON team_memberships(student_id)`
    );
    await db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_phase_name_unique
       ON teams(phase_id, lower(name))`
    );
  } else {
    try {
      await db.query(`ALTER TABLE teams ADD COLUMN phase_id TEXT REFERENCES phases(id) ON DELETE CASCADE`);
    } catch {}
    await db.query(
      `CREATE TABLE IF NOT EXISTS team_memberships (
         id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
         team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
         student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         UNIQUE(team_id, student_id)
       )`
    );
    await db.query(`CREATE INDEX IF NOT EXISTS idx_teams_phase_archived ON teams(phase_id, is_archived, name)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_team_memberships_student ON team_memberships(student_id)`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_phase_name_unique ON teams(phase_id, name)`);
  }

  await backfillLegacyTeams();
  ensureTeamSchema._done = true;
}

module.exports = {
  ensureTeamSchema,
  resolveDefaultPhaseId
};
