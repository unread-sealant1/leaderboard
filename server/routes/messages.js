const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Admin list
router.get("/", requireAuth, async (req, res) => {
  const r = await db.query("SELECT * FROM tv_messages ORDER BY created_at DESC");
  res.json(r.rows);
});

// Admin create
router.post("/", requireAuth, async (req, res) => {
  const { severity, title, body } = req.body || {};
  if (!title || !body) return res.status(400).json({ message: "title and body required" });

  const sev = ["info", "warning", "critical"].includes(severity) ? severity : "info";
  const r = await db.query(
    "INSERT INTO tv_messages (severity, title, body) VALUES ($1,$2,$3) RETURNING *",
    [sev, title.trim(), body.trim()]
  );
  res.json(r.rows[0]);
});

// Toggle active
router.put("/:id/toggle", requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.query(
    "UPDATE tv_messages SET is_active = CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE id=$1",
    [id]
  );
  const r = await db.query("SELECT * FROM tv_messages WHERE id=$1", [id]);
  if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
  res.json(r.rows[0]);
});

// Delete
router.delete("/:id", requireAuth, async (req, res) => {
  await db.query("DELETE FROM tv_messages WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// Public for TV
router.get("/public", async (req, res) => {
  const r = await db.query(
    "SELECT severity, title, body, created_at FROM tv_messages WHERE is_active=1 ORDER BY created_at DESC LIMIT 5"
  );
  res.json(r.rows);
});

module.exports = router;
