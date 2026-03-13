const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function toDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeRow(row) {
  return {
    ...row,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date)
  };
}

router.get("/", requireAuth, async (req, res) => {
  const { termId } = req.query;
  if (termId) {
    const r = await db.query(
      "SELECT * FROM phases WHERE term_id=$1 ORDER BY phase_order ASC, start_date ASC NULLS LAST, created_at ASC",
      [termId]
    );
    return res.json(r.rows.map(normalizeRow));
  }
  const r = await db.query(
    "SELECT * FROM phases ORDER BY term_id ASC, phase_order ASC, start_date ASC NULLS LAST, created_at ASC"
  );
  res.json(r.rows.map(normalizeRow));
});

router.post("/", requireAuth, async (req, res) => {
  const { termId, name, startDate, endDate, phaseOrder } = req.body || {};
  if (!termId || !name) return res.status(400).json({ message: "termId and name required" });

  const r = await db.query(
    `INSERT INTO phases (term_id, name, start_date, end_date, phase_order)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [termId, name.trim(), startDate || null, endDate || null, phaseOrder || 1]
  );
  res.json(normalizeRow(r.rows[0]));
});

router.put("/:id", requireAuth, async (req, res) => {
  const { name, startDate, endDate, phaseOrder } = req.body || {};
  const r = await db.query(
    `UPDATE phases
     SET name=$1, start_date=$2, end_date=$3, phase_order=$4
     WHERE id=$5
     RETURNING *`,
    [name?.trim(), startDate || null, endDate || null, phaseOrder || 1, req.params.id]
  );
  if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
  res.json(normalizeRow(r.rows[0]));
});

router.delete("/:id", requireAuth, async (req, res) => {
  await db.query("DELETE FROM phases WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
