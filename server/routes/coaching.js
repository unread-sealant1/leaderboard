const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 42, 120));
  const since = `-${days} days`;

  const summaryRow = (await db.query(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN attended=1 THEN 1 ELSE 0 END) AS attended,
      SUM(CASE WHEN attended=0 THEN 1 ELSE 0 END) AS missed
     FROM coaching_sessions
     WHERE session_date >= date('now', ?)`,
    [since]
  )).rows[0];

  const total = Number(summaryRow?.total || 0);
  const attended = Number(summaryRow?.attended || 0);
  const missed = Number(summaryRow?.missed || 0);
  const missedRate = total ? Math.round((missed / total) * 100) : 0;

  const sessions = (await db.query(
    `SELECT
      c.id,
      c.session_date,
      c.attended,
      s.first_name,
      s.last_name
     FROM coaching_sessions c
     JOIN students s ON s.id = c.student_id
     WHERE c.session_date >= date('now', ?)
     ORDER BY c.session_date DESC, s.last_name ASC`,
    [since]
  )).rows;

  res.json({
    days,
    summary: { total, attended, missed, missedRate },
    sessions: sessions.map(s => ({
      id: s.id,
      date: s.session_date,
      attended: !!s.attended,
      name: `${s.first_name} ${s.last_name}`
    }))
  });
});

module.exports = router;
