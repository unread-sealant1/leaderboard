const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");
const { ensureAttendanceSyncColumns } = require("../services/dreamclass-sync");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  await ensureAttendanceSyncColumns();
  const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 14, 60));
  const since = `-${days} days`;

  const summaryRow = (await db.query(
    `SELECT
     SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
     SUM(CASE WHEN status='late' THEN 1 ELSE 0 END) AS late,
     SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) AS absent
     FROM attendance
     WHERE external_source = 'dreamclass'
       AND attendance_date >= date('now', ?)`,
    [since]
  )).rows[0];

  const present = Number(summaryRow?.present || 0);
  const late = Number(summaryRow?.late || 0);
  const absent = Number(summaryRow?.absent || 0);
  const total = present + late + absent;
  const rate = total ? Math.round((present / total) * 100) : 0;

  const students = (await db.query(
    `SELECT
      s.id,
      s.first_name,
      s.last_name,
      SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late,
      SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent
     FROM students s
     LEFT JOIN attendance a
       ON a.student_id = s.id
      AND a.external_source = 'dreamclass'
      AND a.attendance_date >= date('now', ?)
     WHERE s.status='active'
     GROUP BY s.id
     ORDER BY s.last_name ASC, s.first_name ASC`,
    [since]
  )).rows;

  const rows = students.map(s => {
    const p = Number(s.present || 0);
    const l = Number(s.late || 0);
    const a = Number(s.absent || 0);
    const t = p + l + a;
    return {
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      present: p,
      late: l,
      absent: a,
      rate: t ? Math.round((p / t) * 100) : 0
    };
  });

  res.json({
    days,
    summary: { present, late, absent, rate },
    students: rows
  });
});

module.exports = router;


