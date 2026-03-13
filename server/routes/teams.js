const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");
const { ensureTeamSchema, resolveDefaultPhaseId } = require("../services/team-schema");

const router = express.Router();

function cleanName(value) {
  const next = String(value || "").trim();
  if (!next) return null;
  return next.slice(0, 40);
}

function parseStudentIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))];
}

// LIST (active teams only unless includeArchived=1)
router.get("/", requireAuth, async (req, res) => {
  await ensureTeamSchema();
  const includeArchived = String(req.query.includeArchived || "") === "1";
  const requestedPhaseId = String(req.query.phaseId || "").trim() || await resolveDefaultPhaseId();
  const params = [];
  let where = "";
  if (requestedPhaseId) {
    params.push(requestedPhaseId);
    where = `WHERE phase_id = $${params.length}`;
  }
  if (!includeArchived) {
    where += where ? " AND " : "WHERE ";
    where += "COALESCE(is_archived, FALSE) = FALSE";
  }
  const r = await db.query(`SELECT * FROM teams ${where} ORDER BY name ASC`, params);
  res.json(r.rows);
});

// CREATE
router.post("/", requireAuth, async (req, res) => {
  await ensureTeamSchema();
  const name = cleanName(req.body?.name);
  const phaseId = String(req.body?.phaseId || "").trim() || await resolveDefaultPhaseId();
  if (!name) return res.status(400).json({ message: "name required" });
  if (!phaseId) return res.status(400).json({ message: "phaseId required" });

  try {
    const r = await db.query(
      "INSERT INTO teams (name, phase_id, is_archived) VALUES ($1, $2, FALSE) RETURNING *",
      [name, phaseId]
    );
    res.json(r.rows[0]);
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Team name already exists" });
    }
    return res.status(500).json({ message: "Failed to create team" });
  }
});

// RENAME
router.put("/:id", requireAuth, async (req, res) => {
  await ensureTeamSchema();
  const { id } = req.params;
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ message: "name required" });

  try {
    const update = await db.query("UPDATE teams SET name=$1 WHERE id=$2", [name, id]);
    if (!update.rowCount) return res.status(404).json({ message: "Not found" });

    const row = (await db.query("SELECT * FROM teams WHERE id=$1 LIMIT 1", [id])).rows[0];
    res.json(row);
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Team name already exists" });
    }
    return res.status(500).json({ message: "Failed to update team" });
  }
});

// ADD students to team (moves from existing team if needed)
router.post("/:id/students", requireAuth, async (req, res) => {
  await ensureTeamSchema();
  const { id } = req.params;
  const studentIds = parseStudentIds(req.body?.studentIds);
  if (!studentIds.length) return res.status(400).json({ message: "studentIds required" });

  const team = (await db.query(
    "SELECT id, name, phase_id FROM teams WHERE id=$1 AND COALESCE(is_archived, FALSE)=FALSE LIMIT 1",
    [id]
  )).rows[0];
  if (!team) return res.status(404).json({ message: "Team not found" });

  const placeholders = studentIds.map((_, idx) => `$${idx + 2}`).join(",");
  await db.query(
    `DELETE FROM team_memberships
     WHERE student_id IN (${placeholders})
       AND team_id IN (
         SELECT id
         FROM teams
         WHERE phase_id = $1
       )`,
    [team.phase_id, ...studentIds]
  );

  for (const studentId of studentIds) {
    await db.query(
      `INSERT INTO team_memberships (team_id, student_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [id, studentId]
    );
  }

  res.json({ ok: true, teamId: id, moved: studentIds.length });
});

// REMOVE selected students from team (unassign)
router.delete("/:id/students", requireAuth, async (req, res) => {
  await ensureTeamSchema();
  const { id } = req.params;
  const studentIds = parseStudentIds(req.body?.studentIds);
  if (!studentIds.length) return res.status(400).json({ message: "studentIds required" });

  const placeholders = studentIds.map((_, idx) => `$${idx + 2}`).join(",");
  await db.query(
    `DELETE FROM team_memberships
     WHERE team_id=$1
       AND student_id IN (${placeholders})`,
    [id, ...studentIds]
  );

  res.json({ ok: true, teamId: id, removed: studentIds.length });
});

// ARCHIVE team and unassign all students
router.post("/:id/archive", requireAuth, async (req, res) => {
  await ensureTeamSchema();
  const { id } = req.params;

  await db.query("BEGIN");
  try {
    const team = (await db.query("SELECT * FROM teams WHERE id=$1 LIMIT 1", [id])).rows[0];
    if (!team) {
      await db.query("ROLLBACK");
      return res.status(404).json({ message: "Not found" });
    }

    await db.query("DELETE FROM team_memberships WHERE team_id=$1", [id]);
    await db.query("UPDATE teams SET is_archived=TRUE WHERE id=$1", [id]);

    await db.query("COMMIT");
    return res.json({ ok: true, teamId: id });
  } catch (error) {
    await db.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to archive team" });
  }
});

// DELETE (kept for compatibility)
router.delete("/:id", requireAuth, async (req, res) => {
  await ensureTeamSchema();
  const { id } = req.params;
  await db.query("DELETE FROM team_memberships WHERE team_id=$1", [id]);
  await db.query("DELETE FROM teams WHERE id=$1", [id]);
  res.json({ ok: true });
});

module.exports = router;
