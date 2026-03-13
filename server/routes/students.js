const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");
const { syncStudents } = require("../services/dreamclass-sync");
const { ensureTeamSchema } = require("../services/team-schema");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureTeamSchema();
    if (req.query.sync === "1") {
      try {
        await syncStudents();
      } catch (syncError) {
        console.error("DreamClass student sync-on-read failed:", syncError);
      }
    }

    const includeAll = String(req.query.includeAll || "").trim() === "1";
    const phaseId = String(req.query.phaseId || "").trim() || null;
    const params = [];
    let where = "";
    if (!includeAll) {
      params.push("active");
      where = `WHERE COALESCE(s.status, 'active') = $${params.length}`;
    }

    let sql;
    if (phaseId) {
      params.push(phaseId);
      const phaseParam = `$${params.length}`;
      sql = `
        SELECT
          s.id,
          s.first_name,
          s.last_name,
          s.email,
          s.status,
          s.external_source,
          s.external_id,
          s.last_synced_at,
          s.created_at,
          (
            SELECT tm.id
            FROM team_memberships tms
            JOIN teams tm ON tm.id = tms.team_id
            WHERE tms.student_id = s.id
              AND tm.phase_id = ${phaseParam}
              AND COALESCE(tm.is_archived, FALSE) = FALSE
            ORDER BY tm.name ASC
            LIMIT 1
          ) AS team_id,
          (
            SELECT tm.name
            FROM team_memberships tms
            JOIN teams tm ON tm.id = tms.team_id
            WHERE tms.student_id = s.id
              AND tm.phase_id = ${phaseParam}
              AND COALESCE(tm.is_archived, FALSE) = FALSE
            ORDER BY tm.name ASC
            LIMIT 1
          ) AS team_name
        FROM students s
        ${where}
        ORDER BY s.last_name ASC, s.first_name ASC`;
    } else {
      sql = `
        SELECT s.*, t.name as team_name
        FROM students s
        LEFT JOIN teams t ON t.id = s.team_id
        ${where}
        ORDER BY s.last_name ASC, s.first_name ASC`;
    }

    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (error) {
    console.error("Students list failed:", error);
    res.status(500).json({ message: "Failed to load students" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const { firstName, lastName, email, teamId } = req.body || {};
  if (!firstName || !lastName) return res.status(400).json({ message: "firstName & lastName required" });

  const r = await db.query(
    `INSERT INTO students (first_name, last_name, email, team_id)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [firstName.trim(), lastName.trim(), email?.trim() || null, teamId || null]
  );
  res.json(r.rows[0]);
});

router.put("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, email, teamId, status } = req.body || {};

  const r = await db.query(
    `UPDATE students
     SET first_name=$1, last_name=$2, email=$3, team_id=$4, status=$5
     WHERE id=$6
     `,
    [firstName?.trim(), lastName?.trim(), email?.trim() || null, teamId || null, status || "active", id]
  );
  if (!r.rowCount) return res.status(404).json({ message: "Not found" });

  const row = (await db.query(
    `SELECT s.*, t.name as team_name
     FROM students s
     LEFT JOIN teams t ON t.id = s.team_id
     WHERE s.id=$1`,
    [id]
  )).rows[0];
  res.json(row);
});

router.delete("/:id", requireAuth, async (req, res) => {
  await db.query("DELETE FROM students WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
