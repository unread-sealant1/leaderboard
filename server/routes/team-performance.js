const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");
const { ensureGradebookPhaseColumns } = require("../services/dreamclass-sync");
const { ensureTeamSchema, resolveDefaultPhaseId } = require("../services/team-schema");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureGradebookPhaseColumns();
    await ensureTeamSchema();
    const settings = (await db.query("SELECT * FROM tv_settings LIMIT 1")).rows[0] || null;
    const phaseId = req.query.phaseId || settings?.current_phase_id || await resolveDefaultPhaseId();
    const stream = (req.query.stream || "all").toString().toLowerCase();

    const params = [];
    let gradebookValueJoin = `LEFT JOIN gradebook_values gv
           ON gv.student_id = s.id`;
    if (phaseId) {
      params.push(phaseId);
      gradebookValueJoin += `\n          AND gv.phase_id = $${params.length}`;
    }

    let avgExpression = `AVG(CASE WHEN gb.id IS NOT NULL THEN gv.value END)`;
    if (stream !== "all") {
      params.push(stream);
      avgExpression = `AVG(CASE WHEN gb.stream = $${params.length} THEN gv.value END)`;
    }

    let teamWhere = "WHERE COALESCE(tm.is_archived, FALSE) = FALSE";
    const queryParams = [...params];
    if (phaseId) {
      queryParams.push(phaseId);
      teamWhere += `\n           AND tm.phase_id = $${queryParams.length}`;
    }

    const rows = (
      await db.query(
        `SELECT
           tm.id AS team_id,
           tm.name AS team_name,
           s.id AS student_id,
           s.first_name,
           s.last_name,
           ${avgExpression} AS student_avg
         FROM teams tm
         LEFT JOIN team_memberships tms
           ON tms.team_id = tm.id
         LEFT JOIN students s
           ON s.id = tms.student_id
          AND COALESCE(s.status, 'active') = 'active'
         ${gradebookValueJoin}
         LEFT JOIN gradebooks gb
           ON gb.id = gv.gradebook_id
          AND COALESCE(gb.is_visible, TRUE) = TRUE
         ${teamWhere}
         GROUP BY tm.id, tm.name, s.id, s.first_name, s.last_name
         ORDER BY tm.name ASC, s.last_name ASC, s.first_name ASC`,
        queryParams
      )
    ).rows;

    const byTeam = new Map();
    for (const row of rows) {
      if (!byTeam.has(String(row.team_id))) {
        byTeam.set(String(row.team_id), {
          id: row.team_id,
          team: row.team_name,
          students: [],
          teamAvg: null
        });
      }
      if (!row.student_id) continue;
      const avg = row.student_avg == null ? null : Number(Number(row.student_avg).toFixed(2));
      byTeam.get(String(row.team_id)).students.push({
        id: row.student_id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        avg
      });
    }

    const teams = [...byTeam.values()].map((team) => {
      const values = team.students.map((student) => Number(student.avg)).filter(Number.isFinite);
      return {
        ...team,
        students: team.students.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
        teamAvg: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null
      };
    });

    res.json(teams);
  } catch (error) {
    console.error("Team performance failed:", error);
    res.status(500).json({ message: error.message || "Failed to load team performance" });
  }
});

module.exports = router;
