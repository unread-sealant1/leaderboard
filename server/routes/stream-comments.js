const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNullableId(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "all" || text === "0" || text === "null") return null;
  return text;
}

function normalizeScope(req, includeInactive = false) {
  const phaseId = normalizeNullableId(req.query.phaseId || req.query.termId);
  const teamId = normalizeNullableId(req.query.teamId);
  const stream = normalizeText(req.query.stream, "meta").toLowerCase();
  const skillKey = normalizeText(req.query.skillKey, "general");
  const limit = Math.max(1, Math.min(Number(req.query.limit || 20) || 20, 50));

  const params = [];
  const where = [];
  if (!includeInactive) where.push("COALESCE(sc.is_active, TRUE) = TRUE");
  if (phaseId) {
    params.push(phaseId);
    where.push(`sc.phase_id = $${params.length}`);
  }
  if (teamId) {
    params.push(teamId);
    where.push(`sc.team_id = $${params.length}`);
  }
  if (stream) {
    params.push(stream);
    where.push(`sc.stream = $${params.length}`);
  }
  if (skillKey) {
    params.push(skillKey);
    where.push(`sc.skill_key = $${params.length}`);
  }

  return {
    phaseId,
    teamId,
    stream,
    skillKey,
    limit,
    params,
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : ""
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const scope = normalizeScope(req, true);
    const rows = (
      await db.query(
        `SELECT
           sc.*,
           p.name AS phase_name,
           tm.name AS team_name
         FROM stream_comments sc
         LEFT JOIN phases p ON p.id = sc.phase_id
         LEFT JOIN teams tm ON tm.id = sc.team_id
         ${scope.whereSql}
         ORDER BY sc.created_at DESC
         LIMIT ${scope.limit}`,
        scope.params
      )
    ).rows;
    res.json(rows);
  } catch (error) {
    console.error("Stream comments list failed:", error);
    res.status(500).json({ message: "Failed to load comments" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const body = normalizeText(req.body?.body);
    if (!body) {
      return res.status(400).json({ message: "Comment body is required" });
    }

    const phaseId = normalizeNullableId(req.body?.phaseId || req.body?.termId);
    const teamId = normalizeNullableId(req.body?.teamId);
    const stream = normalizeText(req.body?.stream, "meta").toLowerCase();
    const skillKey = normalizeText(req.body?.skillKey, "general");
    const authorName = normalizeText(req.body?.authorName, "Admin");

    const row = (
      await db.query(
        `INSERT INTO stream_comments
           (phase_id, stream, team_id, skill_key, body, author_name, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         RETURNING *`,
        [phaseId, stream, teamId, skillKey, body, authorName]
      )
    ).rows[0];

    res.json(row);
  } catch (error) {
    console.error("Stream comments create failed:", error);
    res.status(500).json({ message: "Failed to save comment" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const body = normalizeText(req.body?.body);
    if (!body) {
      return res.status(400).json({ message: "Comment body is required" });
    }

    const teamId = normalizeNullableId(req.body?.teamId);
    const phaseId = normalizeNullableId(req.body?.phaseId || req.body?.termId);
    const stream = normalizeText(req.body?.stream, "meta").toLowerCase();
    const skillKey = normalizeText(req.body?.skillKey, "general");
    const isActive = req.body?.isActive === undefined ? true : Boolean(req.body.isActive);

    const row = (
      await db.query(
        `UPDATE stream_comments
         SET phase_id = $1,
             stream = $2,
             team_id = $3,
             skill_key = $4,
             body = $5,
             is_active = $6,
             updated_at = now()
         WHERE id = $7
         RETURNING *`,
        [phaseId, stream, teamId, skillKey, body, isActive, req.params.id]
      )
    ).rows[0];

    if (!row) return res.status(404).json({ message: "Comment not found" });
    res.json(row);
  } catch (error) {
    console.error("Stream comments update failed:", error);
    res.status(500).json({ message: "Failed to update comment" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM stream_comments WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Stream comments delete failed:", error);
    res.status(500).json({ message: "Failed to delete comment" });
  }
});

router.get("/public", async (req, res) => {
  try {
    const scope = normalizeScope(req, false);
    const rows = (
      await db.query(
        `SELECT
           sc.id,
           sc.phase_id,
           sc.stream,
           sc.team_id,
           sc.skill_key,
           sc.body,
           sc.author_name,
           sc.created_at,
           sc.updated_at,
           p.name AS phase_name,
           tm.name AS team_name
         FROM stream_comments sc
         LEFT JOIN phases p ON p.id = sc.phase_id
         LEFT JOIN teams tm ON tm.id = sc.team_id
         ${scope.whereSql}
         ORDER BY COALESCE(sc.updated_at, sc.created_at) DESC
         LIMIT ${scope.limit}`,
        scope.params
      )
    ).rows;
    res.json(rows);
  } catch (error) {
    console.error("Stream comments public failed:", error);
    res.status(500).json({ message: "Failed to load public comments" });
  }
});

module.exports = router;
