const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { phaseId, stream } = req.query;
  let q = "SELECT * FROM topics WHERE 1=1";
  const p = [];
  if (phaseId) { p.push(phaseId); q += ` AND phase_id=$${p.length}`; }
  if (stream) { p.push(stream); q += ` AND stream=$${p.length}`; }
  q += " ORDER BY created_at ASC";
  const r = await db.query(q, p);
  res.json(r.rows);
});

router.post("/", requireAuth, async (req, res) => {
  const { phaseId, stream, title, weekNumber } = req.body || {};
  if (!phaseId || !stream || !title) {
    return res.status(400).json({ message: "phaseId, stream, title required" });
  }
  if (!["meta","webdev","coaching"].includes(stream)) {
    return res.status(400).json({ message: "stream must be meta|webdev|coaching" });
  }

  const r = await db.query(
    `INSERT INTO topics (phase_id, stream, title, week_number)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [phaseId, stream, title.trim(), weekNumber || null]
  );
  res.json(r.rows[0]);
});

router.put("/:id", requireAuth, async (req, res) => {
  const { title, weekNumber } = req.body || {};
  const r = await db.query(
    `UPDATE topics SET title=$1, week_number=$2 WHERE id=$3 RETURNING *`,
    [title?.trim(), weekNumber || null, req.params.id]
  );
  if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requireAuth, async (req, res) => {
  await db.query("DELETE FROM topics WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;