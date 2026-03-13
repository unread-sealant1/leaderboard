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
    end_date: toDateOnly(row.end_date),
    last_synced_at: row.last_synced_at || null
  };
}

router.get("/", requireAuth, async (_req, res) => {
  const result = await db.query(
    `SELECT id, name, start_date, end_date, school_period_id, external_source, external_id, last_synced_at, is_active
     FROM terms
     WHERE COALESCE(is_active, TRUE) = TRUE
     ORDER BY start_date ASC NULLS LAST, created_at ASC`
  );
  res.json(result.rows.map(normalizeRow));
});

module.exports = router;
