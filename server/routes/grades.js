const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");
const { ensureGradebookPhaseColumns, syncGrades } = require("../services/dreamclass-sync");
const { ensureTeamSchema } = require("../services/team-schema");

const router = express.Router();

const STREAMS = ["meta", "webdev", "coaching", "portfolio"];

function sortName(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function normalizeTermRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    streamScores: {
      meta: row.meta_avg == null ? null : Number(Number(row.meta_avg).toFixed(2)),
      webdev: row.webdev_avg == null ? null : Number(Number(row.webdev_avg).toFixed(2)),
      coaching: row.coaching_avg == null ? null : Number(Number(row.coaching_avg).toFixed(2)),
      portfolio: row.portfolio_avg == null ? null : Number(Number(row.portfolio_avg).toFixed(2))
    },
    avg: row.overall_avg == null ? null : Number(Number(row.overall_avg).toFixed(2))
  }));
}

router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureGradebookPhaseColumns();
    await ensureTeamSchema();
    const settings = (await db.query("SELECT * FROM tv_settings LIMIT 1")).rows[0] || null;
    const phaseId = req.query.phaseId || settings?.current_phase_id || null;
    let termId = req.query.termId || settings?.current_term_id || null;

    if (!termId && phaseId) {
      termId = (
        await db.query(`SELECT term_id FROM phases WHERE id=$1 LIMIT 1`, [phaseId])
      ).rows[0]?.term_id || null;
    }

    if (req.query.sync === "1") {
      try {
        await syncGrades({
          termId,
          phaseId,
          stream: "all",
          createMissingTopics: true
        });
      } catch (syncError) {
        console.error("DreamClass grades sync-on-read failed:", syncError);
      }
    }

    if (!termId) {
      return res.json({ termId: null, rows: [], streams: STREAMS });
    }

    const rows = (
      await db.query(
        `SELECT
           s.id,
           s.first_name,
           s.last_name,
           s.email,
           s.status,
           (
             SELECT tm.name
             FROM team_memberships tms
             JOIN teams tm ON tm.id = tms.team_id
             WHERE tms.student_id = s.id
               AND tm.phase_id = $1
               AND COALESCE(tm.is_archived, FALSE) = FALSE
             ORDER BY tm.name ASC
             LIMIT 1
           ) AS team_name,
           AVG(CASE WHEN gb.stream='meta' THEN gv.value END) AS meta_avg,
           AVG(CASE WHEN gb.stream='webdev' THEN gv.value END) AS webdev_avg,
           AVG(CASE WHEN gb.stream='coaching' THEN gv.value END) AS coaching_avg,
           AVG(CASE WHEN gb.stream='portfolio' THEN gv.value END) AS portfolio_avg,
           AVG(gv.value) AS overall_avg
         FROM students s
         LEFT JOIN teams tm ON tm.id = s.team_id
         LEFT JOIN gradebook_values gv ON gv.student_id = s.id AND gv.phase_id = $1
         LEFT JOIN gradebooks gb ON gb.id = gv.gradebook_id AND COALESCE(gb.is_visible, TRUE) = TRUE
         WHERE COALESCE(s.status, 'active') = 'active'
         GROUP BY s.id, tm.name
         ORDER BY s.last_name ASC, s.first_name ASC`,
        [phaseId]
      )
    ).rows;

    const normalized = normalizeTermRows(rows)
      .map((row) => ({
        id: row.id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        email: row.email || null,
        teamName: row.team_name || null,
        status: row.status || "active",
        streamScores: row.streamScores,
        avg: row.avg
      }))
      .sort((a, b) => sortName(a.name, b.name));

    res.json({
      phaseId: phaseId || null,
      termId,
      streams: STREAMS,
      rows: normalized
    });
  } catch (error) {
    console.error("Grades list failed:", error);
    res.status(500).json({ message: "Failed to load grades" });
  }
});

module.exports = router;
