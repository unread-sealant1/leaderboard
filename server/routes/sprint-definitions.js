const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, stream, term, sprint_start, sprint_end, topic, created_at
       FROM sprint_definitions
       ORDER BY stream ASC, term ASC`
    );
    res.json({ sprints: rows.rows || [] });
  } catch (error) {
    console.error("Sprint definitions fetch failed:", error);
    res.status(500).json({ message: "Failed to load sprint definitions" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { stream, term, sprint_start, sprint_end, topic } = req.body;
    
    if (!stream || !term || !sprint_start || !sprint_end) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const result = await db.query(
      `INSERT INTO sprint_definitions (stream, term, sprint_start, sprint_end, topic)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [stream, term, sprint_start, sprint_end, topic || null]
    );

    res.json({ sprint: result.rows[0] });
  } catch (error) {
    console.error("Sprint definition creation failed:", error);
    res.status(500).json({ message: "Failed to create sprint definition" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { stream, term, sprint_start, sprint_end, topic } = req.body;

    const result = await db.query(
      `UPDATE sprint_definitions
       SET stream=$1, term=$2, sprint_start=$3, sprint_end=$4, topic=$5
       WHERE id=$6
       RETURNING *`,
      [stream, term, sprint_start, sprint_end, topic || null, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Sprint definition not found" });
    }

    res.json({ sprint: result.rows[0] });
  } catch (error) {
    console.error("Sprint definition update failed:", error);
    res.status(500).json({ message: "Failed to update sprint definition" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM sprint_definitions WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Sprint definition deletion failed:", error);
    res.status(500).json({ message: "Failed to delete sprint definition" });
  }
});

module.exports = router;
