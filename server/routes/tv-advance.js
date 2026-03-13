const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function parseJsonArray(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      return fallback;
    }
  }
  return fallback;
}

function nextInArray(arr, current) {
  if (!arr.length) return null;
  const idx = arr.indexOf(current);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % arr.length;
  return arr[nextIdx];
}

async function loadTopics(phaseId, stream, scope) {
  if (!stream || stream === "alerts") return [];
  if (scope === "all") {
    const r = await db.query(
      "SELECT id FROM topics WHERE stream=$1 ORDER BY week_number ASC, created_at ASC",
      [stream]
    );
    return r.rows.map(x => x.id);
  }
  if (!phaseId) return [];
  const r = await db.query(
    "SELECT id FROM topics WHERE phase_id=$1 AND stream=$2 ORDER BY week_number ASC, created_at ASC",
    [phaseId, stream]
  );
  return r.rows.map(x => x.id);
}

/**
 * Advances the TV state according to rotation_mode.
 * This keeps control centralized in DB and consistent for all displays.
 */
router.post("/advance", requireAuth, async (req, res) => {
  await db.query("BEGIN");
  try {
    const s = (await db.query("SELECT * FROM tv_settings LIMIT 1")).rows[0];
    if (!s) {
      await db.query("ROLLBACK");
      return res.status(404).json({ message: "tv_settings not found" });
    }

    const SCREENS_THAT_NEED_TOPIC = new Set(["topic_team_dials", "topic_student_bars"]);
    const legacyDefaultScreens = ["topic_team_dials", "topic_student_bars", "coaching_team_trends", "alerts_summary"];
    const olderDefaultScreens = [
      "welcome_screen",
      "topic_team_dials",
      "topic_student_bars",
      "coaching_team_trends",
      "alerts_summary",
      "meta_skills_1",
      "meta_skills_2"
    ];
    const defaultScreens = [
      "welcome_screen",
      "topic_team_dials",
      "meta_team_dials",
      "topic_student_bars",
      "coaching_team_trends",
      "alerts_summary",
      "comments_screen",
      "notifications_screen",
      "meta_skills_1",
      "meta_skills_2"
    ];
    const defaultEnabledScreens = defaultScreens.filter((screen) => screen !== "welcome_screen");
    const validSet = new Set(defaultScreens);
    const enabledScreens = parseJsonArray(s.enabled_screens, defaultEnabledScreens).filter((x) => validSet.has(x));
    const screenOrder = parseJsonArray(s.screen_order, defaultScreens).filter((x) => validSet.has(x));
    const looksLikeOldStreams = enabledScreens.every(x => ["meta", "webdev", "coaching", "alerts"].includes(x));
    const looksLikeLegacy = enabledScreens.length === legacyDefaultScreens.length
      && enabledScreens.every(x => legacyDefaultScreens.includes(x));
    const looksLikeOlderDefault = enabledScreens.length === olderDefaultScreens.length
      && enabledScreens.every((x) => olderDefaultScreens.includes(x));
    const screenListBase = looksLikeOldStreams || looksLikeLegacy
      ? defaultEnabledScreens
      : (looksLikeOlderDefault ? defaultEnabledScreens : (enabledScreens.length ? enabledScreens : defaultEnabledScreens));
    const screenList = [...new Set(screenListBase)];
    const orderLooksLegacy = screenOrder.length === legacyDefaultScreens.length
      && screenOrder.every(x => legacyDefaultScreens.includes(x));
    const orderLooksOlderDefault = screenOrder.length === olderDefaultScreens.length
      && screenOrder.every((x) => olderDefaultScreens.includes(x));
    const screenOrderList = orderLooksLegacy || orderLooksOlderDefault
      ? defaultScreens
      : [...new Set([...screenOrder, ...defaultScreens])];
    const playlist = screenOrderList.filter(x => screenList.includes(x));

    const topicScope = s.topic_scope || "phase";
    const currentPhaseId = s.current_phase_id;
    const currentStream = s.current_stream || "webdev";
    const currentTopicId = s.current_topic_id;
    const currentScreen = s.current_screen && playlist.includes(s.current_screen)
      ? s.current_screen
      : (playlist[0] || defaultEnabledScreens[0] || defaultScreens[0]);
    const nextScreen = nextInArray(playlist.length ? playlist : defaultEnabledScreens, currentScreen) || currentScreen;

    let nextStream = currentStream;
    let nextTopicId = currentTopicId;

    // If we are moving FROM topic_student_bars -> next topic (completed both topic screens)
    if (currentScreen === "topic_student_bars") {
      const topics = await loadTopics(currentPhaseId, nextStream, topicScope);
      if (topics.length) {
        const idx = topics.indexOf(currentTopicId);
        const nextIdx = idx === -1 ? 0 : (idx + 1) % topics.length;
        nextTopicId = topics[nextIdx];
      }
    }

    // Ensure topic exists for screens that require it
    if (SCREENS_THAT_NEED_TOPIC.has(nextScreen)) {
      const topics = await loadTopics(currentPhaseId, nextStream, topicScope);
      if (!topics.length) nextTopicId = null;
      else if (!topics.includes(nextTopicId)) nextTopicId = topics[0];
    } else {
      nextTopicId = null;
    }

    await db.query(
      `UPDATE tv_settings
       SET current_screen=$1, current_stream=$2, current_topic_id=$3, updated_at=now()
       WHERE id=$4`,
      [nextScreen, nextStream, nextTopicId, s.id]
    );

    const updated = await db.query("SELECT * FROM tv_settings WHERE id=$1", [s.id]);

    await db.query("COMMIT");
    res.json(updated.rows[0] || {});
  } catch (e) {
    await db.query("ROLLBACK");
    res.status(500).json({ message: "advance failed" });
  }
});

module.exports = router;
