const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");
const { ensureGradebookPhaseColumns } = require("../services/dreamclass-sync");
const { getGradeDetailData } = require("../services/grade-detail-data");

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

function normalizeSettings(row) {
  if (!row) return null;
  const normalized = { ...row };
  const legacyDefault = ["topic_team_dials", "topic_student_bars", "coaching_team_trends", "alerts_summary"];
  const olderScreenDefault = [
    "welcome_screen",
    "topic_team_dials",
    "topic_student_bars",
    "coaching_team_trends",
    "alerts_summary",
    "meta_skills_1",
    "meta_skills_2"
  ];
  const screenDefault = [
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
  const defaultEnabledScreens = screenDefault.filter((screen) => screen !== "welcome_screen");
  const validScreenSet = new Set(screenDefault);
  const screenListRaw = parseJsonArray(normalized.enabled_screens, defaultEnabledScreens);
  const screenOrderRaw = parseJsonArray(normalized.screen_order, screenDefault);
  const screenList = screenListRaw.filter((s) => validScreenSet.has(s));
  const screenOrder = screenOrderRaw.filter((s) => validScreenSet.has(s));

  const looksLikeOldStreams = screenList.every(s => ["meta", "webdev", "coaching", "alerts"].includes(s));
  const looksLikeLegacy = screenList.length === legacyDefault.length
    && screenList.every(s => legacyDefault.includes(s));
  const looksLikeOlderDefault = screenList.length === olderScreenDefault.length
    && screenList.every((s) => olderScreenDefault.includes(s));
  const enabledBase = looksLikeOldStreams || looksLikeLegacy
    ? defaultEnabledScreens
    : (looksLikeOlderDefault ? defaultEnabledScreens
    : (screenList.length ? screenList : defaultEnabledScreens));
  normalized.enabled_screens = [...new Set(enabledBase)];

  const orderIsLegacy = screenOrder.length === legacyDefault.length
    && screenOrder.every(s => legacyDefault.includes(s));
  const orderIsOlderDefault = screenOrder.length === olderScreenDefault.length
    && screenOrder.every((s) => olderScreenDefault.includes(s));
  const orderBase = orderIsLegacy || orderIsOlderDefault ? screenDefault : screenOrder;
  const orderComplete = [...new Set([...orderBase, ...screenDefault])];
  normalized.screen_order = orderComplete;
  normalized.screen_mode = normalized.screen_mode || "playlist";
  normalized.current_screen = normalized.current_screen
    && validScreenSet.has(normalized.current_screen)
    && normalized.enabled_screens.includes(normalized.current_screen)
    ? normalized.current_screen
    : (normalized.enabled_screens[0] || defaultEnabledScreens[0] || "topic_team_dials");

  normalized.enabled_streams = parseJsonArray(
    normalized.enabled_streams,
    ["webdev", "meta", "coaching", "alerts"]
  );
  normalized.rotation_order = parseJsonArray(
    normalized.rotation_order,
    ["meta", "webdev", "coaching", "alerts"]
  );
  normalized.rotation_mode = normalized.rotation_mode || "topic";
  normalized.topic_scope = normalized.topic_scope || "phase";
  normalized.loop_seconds = normalized.loop_seconds || normalized.slide_seconds || 12;
  return normalized;
}

function toTermLabel(value, fallback = "Term") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

function extractOrderNumber(value) {
  const match = String(value || "").match(/(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function resolvePhaseParam(phaseParam) {
  if (!phaseParam) return null;
  const asNumber = Number(phaseParam);
  if (!Number.isNaN(asNumber)) {
    const row = (await db.query(
      "SELECT id, name FROM phases WHERE phase_order=? ORDER BY created_at ASC LIMIT 1",
      [asNumber]
    )).rows[0];
    return row || null;
  }
  const row = (await db.query(
    "SELECT id, name FROM phases WHERE id=? LIMIT 1",
    [String(phaseParam)]
  )).rows[0];
  return row || null;
}

async function loadCurrentPhaseDetails(phaseId) {
  if (!phaseId) return null;
  return (
    await db.query(
      `SELECT p.id, p.term_id, p.name, p.start_date, p.end_date, p.phase_order, t.name AS period_name
       FROM phases p
       LEFT JOIN terms t ON t.id = p.term_id
       WHERE p.id=$1
       LIMIT 1`,
      [phaseId]
    )
  ).rows[0] || null;
}

function formatSprintLabel(sprintStart, sprintEnd) {
  const start = Number(sprintStart || 0);
  const end = Number(sprintEnd || 0);
  if (!Number.isFinite(start) || start <= 0) return "Current Sprint";
  if (!Number.isFinite(end) || end <= 0 || end === start) return `Sprint ${start}`;
  return `Sprint ${start}-${end}`;
}

async function resolveSprintScopeForTv({ phase, stream }) {
  if (!stream || stream === "alerts") {
    return {
      gradebookIds: [],
      heading: "Current Sprint",
      sprintLabel: "Current Sprint"
    };
  }
  await ensureGradebookPhaseColumns();

  const gradebookParams = [stream];
  let gradebookWhere = `COALESCE(gb.is_visible, TRUE) = TRUE AND gb.stream = $1`;
  if (phase?.id) {
    gradebookParams.push(phase.id);
    gradebookWhere += ` AND gb.phase_id = $${gradebookParams.length}`;
  }
  if (phase?.term_id) {
    gradebookParams.push(phase.term_id);
    gradebookWhere += ` AND gb.term_id = $${gradebookParams.length}`;
  }

  const gradebookRows = (
    await db.query(
      `SELECT gb.id, gb.name, gb.position
       FROM gradebooks gb
       WHERE ${gradebookWhere}
       ORDER BY gb.position ASC, gb.created_at ASC`,
      gradebookParams
    )
  ).rows;

  const countByGradebookId = new Map();
  if (gradebookRows.length) {
    const countParams = gradebookRows.map((row) => row.id);
    const countPlaceholders = gradebookRows.map((_, index) => `$${index + 1}`).join(", ");
    let countWhere = `gv.gradebook_id IN (${countPlaceholders})`;
    if (phase?.id) {
      countParams.push(phase.id);
      countWhere += ` AND gv.phase_id = $${countParams.length}`;
    }
    if (phase?.term_id) {
      countParams.push(phase.term_id);
      countWhere += ` AND gv.term_id = $${countParams.length}`;
    }

    const countRows = (
      await db.query(
        `SELECT gv.gradebook_id, COUNT(*) AS value_count
         FROM gradebook_values gv
         JOIN students s
           ON s.id = gv.student_id
          AND COALESCE(s.status, 'active') = 'active'
         WHERE ${countWhere}
         GROUP BY gv.gradebook_id`,
        countParams
      )
    ).rows;

    countRows.forEach((row) => {
      countByGradebookId.set(String(row.gradebook_id), Number(row.value_count || 0));
    });
  }

  const termNumber = Number(phase?.phase_order || extractOrderNumber(phase?.name));
  const sprintDefinitions = Number.isFinite(termNumber) && termNumber > 0
    ? (
      await db.query(
        `SELECT id, stream, term, sprint_start, sprint_end, topic
         FROM sprint_definitions
         WHERE stream = $1
           AND term = $2
         ORDER BY sprint_start ASC, sprint_end ASC, created_at ASC`,
        [stream, termNumber]
      )
    ).rows
    : [];

  const resolvedDefinitions = sprintDefinitions.map((definition) => {
    const start = Math.max(1, Number(definition.sprint_start || 1));
    const end = Math.max(start, Number(definition.sprint_end || start));
    const gradebookIds = gradebookRows.slice(start - 1, end).map((row) => row.id);
    const valueCount = gradebookIds.reduce(
      (sum, id) => sum + Number(countByGradebookId.get(String(id)) || 0),
      0
    );

    return {
      ...definition,
      sprint_start: start,
      sprint_end: end,
      gradebookIds,
      valueCount
    };
  });

  let selectedSprint = [...resolvedDefinitions].reverse().find((row) => row.valueCount > 0)
    || resolvedDefinitions[0]
    || null;

  if (!selectedSprint) {
    const lastPopulatedIndex = [...gradebookRows]
      .map((row, index) => ({ id: row.id, index, count: Number(countByGradebookId.get(String(row.id)) || 0) }))
      .reverse()
      .find((row) => row.count > 0)?.index;
    const fallbackIndex = Number.isInteger(lastPopulatedIndex)
      ? lastPopulatedIndex
      : (gradebookRows.length ? 0 : null);

    if (fallbackIndex != null) {
      selectedSprint = {
        sprint_start: fallbackIndex + 1,
        sprint_end: fallbackIndex + 1,
        topic: null,
        gradebookIds: gradebookRows[fallbackIndex] ? [gradebookRows[fallbackIndex].id] : [],
        valueCount: Number(countByGradebookId.get(String(gradebookRows[fallbackIndex]?.id || "")) || 0)
      };
    }
  }

  const sprintLabel = formatSprintLabel(selectedSprint?.sprint_start, selectedSprint?.sprint_end);
  const heading = stream === "meta"
    ? (String(selectedSprint?.topic || "").trim() || sprintLabel)
    : sprintLabel;

  return {
    gradebookIds: selectedSprint?.gradebookIds || [],
    heading,
    sprintLabel
  };
}

async function loadTeamScoresForTv({ phaseId, termId, gradebookIds = [] }) {
  if (!phaseId) return [];
  if (!gradebookIds.length) {
    const teamRows = (
      await db.query(
        `SELECT name AS team
         FROM teams
         WHERE COALESCE(is_archived, FALSE) = FALSE
         ORDER BY name ASC`
      )
    ).rows;
    return teamRows.map((row) => ({ team: row.team, score: null }));
  }

  const params = [...gradebookIds];
  const idPlaceholders = gradebookIds.map((_, index) => `$${index + 1}`).join(", ");
  let valueJoin = `LEFT JOIN gradebook_values gv
         ON gv.student_id = s.id
        AND gv.gradebook_id IN (${idPlaceholders})`;
  if (phaseId) {
    params.push(phaseId);
    valueJoin += ` AND gv.phase_id = $${params.length}`;
  }
  if (termId) {
    params.push(termId);
    valueJoin += ` AND gv.term_id = $${params.length}`;
  }

  const rows = (
    await db.query(
      `SELECT
         tm.name AS team,
         AVG(CASE WHEN gv.value BETWEEN 0 AND 5 THEN gv.value END) AS score
       FROM teams tm
       LEFT JOIN students s
         ON s.team_id = tm.id
        AND COALESCE(s.status, 'active') = 'active'
       ${valueJoin}
       WHERE COALESCE(tm.is_archived, FALSE) = FALSE
       GROUP BY tm.name
       ORDER BY tm.name ASC`,
      params
    )
  ).rows;

  return rows.map((row) => ({
    team: row.team,
    score: row.score == null ? null : Number(Number(row.score).toFixed(2))
  }));
}

// Admin can update TV settings
router.get("/settings", requireAuth, async (req, res) => {
  const r = await db.query("SELECT * FROM tv_settings LIMIT 1");
  res.json(normalizeSettings(r.rows[0]) || null);
});

router.put("/settings", requireAuth, async (req, res) => {
  const {
    currentTermId,
    currentPhaseId,
    currentStream,
    currentTopicId,
    slideSeconds,
    enabledScreens,
    loopSeconds,
    rotationMode,
    rotationOrder,
    enabledStreams,
    topicScope,
    screenMode,
    screenOrder,
    currentScreen
  } = req.body || {};

  // ensure row exists
  const existing = await db.query("SELECT * FROM tv_settings LIMIT 1");
  const current = normalizeSettings(existing.rows[0]);

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
  const screens = Array.isArray(enabledScreens)
    ? enabledScreens
    : (current?.enabled_screens || defaultEnabledScreens);
  const orderScreens = Array.isArray(screenOrder)
    ? screenOrder
    : (current?.screen_order || screens);
  const streams = Array.isArray(enabledStreams)
    ? enabledStreams
    : (current?.enabled_streams || ["webdev", "meta", "coaching", "alerts"]);
  const order = Array.isArray(rotationOrder)
    ? rotationOrder
    : (current?.rotation_order || ["meta", "webdev", "coaching", "alerts"]);
  const loopValue = Number(loopSeconds ?? slideSeconds ?? current?.loop_seconds ?? current?.slide_seconds ?? 12) || 12;
  const slideValue = Number(slideSeconds ?? loopSeconds ?? current?.slide_seconds ?? current?.loop_seconds ?? 12) || 12;
  const rotationValue = rotationMode || current?.rotation_mode || "topic";
  const scopeValue = topicScope || current?.topic_scope || "phase";
  const screenModeValue = screenMode || current?.screen_mode || "playlist";
  const requestedCurrentScreen = currentScreen || current?.current_screen || null;
  const currentScreenValue = requestedCurrentScreen && screens.includes(requestedCurrentScreen)
    ? requestedCurrentScreen
    : (screens[0] || defaultEnabledScreens[0] || "topic_team_dials");

  const termValue = typeof currentTermId === "undefined"
    ? (current?.current_term_id || null)
    : (currentTermId || null);
  const phaseValue = typeof currentPhaseId === "undefined"
    ? (current?.current_phase_id || null)
    : (currentPhaseId || null);
  const streamValue = typeof currentStream === "undefined"
    ? (current?.current_stream || "meta")
    : (currentStream || "meta");
  const topicValue = typeof currentTopicId === "undefined"
    ? (current?.current_topic_id || null)
    : (currentTopicId || null);

  if (!existing.rows[0]) {
    await db.query(
      `INSERT INTO tv_settings
        (current_term_id, current_phase_id, current_stream, current_topic_id, loop_seconds, slide_seconds, screen_mode, enabled_screens, screen_order, current_screen, rotation_mode, rotation_order, enabled_streams, topic_scope)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        termValue,
        phaseValue,
        streamValue,
        topicValue,
        loopValue,
        slideValue,
        screenModeValue,
        JSON.stringify(screens),
        JSON.stringify(orderScreens),
        currentScreenValue,
        rotationValue,
        JSON.stringify(order),
        JSON.stringify(streams),
        scopeValue
      ]
    );
  } else {
    await db.query(
      `UPDATE tv_settings
       SET current_term_id=$1,
           current_phase_id=$2,
           current_stream=$3,
           current_topic_id=$4,
           loop_seconds=$5,
           slide_seconds=$6,
           screen_mode=$7,
           enabled_screens=$8,
           screen_order=$9,
           current_screen=$10,
           rotation_mode=$11,
           rotation_order=$12,
           enabled_streams=$13,
           topic_scope=$14,
           updated_at=now()
       WHERE id=$15`,
      [
        termValue,
        phaseValue,
        streamValue,
        topicValue,
        loopValue,
        slideValue,
        screenModeValue,
        JSON.stringify(screens),
        JSON.stringify(orderScreens),
        currentScreenValue,
        rotationValue,
        JSON.stringify(order),
        JSON.stringify(streams),
        scopeValue,
        existing.rows[0].id
      ]
    );
  }

  const r2 = await db.query("SELECT * FROM tv_settings LIMIT 1");
  res.json(normalizeSettings(r2.rows[0]));
});

// Public endpoint: top students by average (for TV)
router.get("/public-student-averages", async (req, res) => {
  await ensureGradebookPhaseColumns();
  const { phaseId, stream, limit } = req.query;
  const maxRows = Math.max(1, Math.min(parseInt(limit, 10) || 10, 20));

  const params = [];
  let valueJoin = `LEFT JOIN gradebook_values gv
                     ON gv.student_id = s.id`;
  if (phaseId) {
    params.push(phaseId);
    valueJoin += ` AND gv.phase_id = $${params.length}`;
  }

  let gradebookJoin = `LEFT JOIN gradebooks gb
                         ON gb.id = gv.gradebook_id
                        AND COALESCE(gb.is_visible, TRUE) = TRUE`;
  if (stream) {
    params.push(String(stream).toLowerCase());
    gradebookJoin += ` AND gb.stream = $${params.length}`;
  }

  const r = await db.query(
    `SELECT
       s.id,
       s.first_name,
       s.last_name,
       AVG(CASE WHEN gb.id IS NOT NULL AND gv.value BETWEEN 0 AND 5 THEN gv.value END) AS avg
     FROM students s
     ${valueJoin}
     ${gradebookJoin}
     WHERE COALESCE(s.status, 'active') = 'active'
     GROUP BY s.id, s.first_name, s.last_name
     ORDER BY s.last_name ASC, s.first_name ASC
     LIMIT ${maxRows}`,
    params
  );

  res.json(r.rows.map((row) => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`.trim(),
    avg: row.avg == null ? null : Number(Number(row.avg).toFixed(2))
  })));
});

// Alerts summary scoped by phase (public)
router.get("/alerts-summary", async (req, res) => {
  try {
    await ensureGradebookPhaseColumns();
    let phaseRow = await resolvePhaseParam(req.query.phase);
    if (!phaseRow) {
      const settings = normalizeSettings((await db.query("SELECT * FROM tv_settings LIMIT 1")).rows[0]);
      if (settings?.current_phase_id) {
        phaseRow = (await db.query("SELECT id, name FROM phases WHERE id=? LIMIT 1", [settings.current_phase_id])).rows[0] || null;
      }
    }

    const phaseId = phaseRow?.id || null;
    const phaseDetails = phaseId ? await loadCurrentPhaseDetails(phaseId) : null;
    const termId = phaseDetails?.term_id || null;
    const phaseName = toTermLabel(phaseRow?.name || (req.query.phase ? `Phase ${req.query.phase}` : "All Phases"), "Term");
    const teamId = req.query.teamId ? String(req.query.teamId) : null;
    const teamRow = teamId
      ? (await db.query("SELECT id, name FROM teams WHERE id=? LIMIT 1", [teamId])).rows[0] || null
      : null;
    const scope = teamRow?.name || "All Teams";
    const windowLabel = "last month";
    const days = 30;

    const cohortWhere = [];
    const cohortParams = [];
    if (phaseId) {
      cohortWhere.push(`s.id IN (
        SELECT DISTINCT gv.student_id
        FROM gradebook_values gv
        JOIN gradebooks gb ON gb.id = gv.gradebook_id
        WHERE COALESCE(gb.is_visible, TRUE) = TRUE
          AND (gv.phase_id = ?${termId ? " OR (gv.phase_id IS NULL AND gb.term_id = ?)" : ""})
      )`);
      cohortParams.push(phaseId);
      if (termId) cohortParams.push(termId);
    }
    if (teamRow?.id) {
      cohortWhere.push("s.team_id = ?");
      cohortParams.push(teamRow.id);
    }

    const studentScopeFilter = cohortWhere.length
      ? ` AND student_id IN (SELECT s.id FROM students s WHERE ${cohortWhere.join(" AND ")})`
      : "";

    const lateAttendance = (await db.query(
      `SELECT COUNT(*) AS c
       FROM attendance
       WHERE status='late'
         AND attendance_date >= date('now', '-${days} days')${studentScopeFilter}`,
      cohortParams
    )).rows[0]?.c || 0;

    const missedDays = (await db.query(
      `SELECT COUNT(*) AS c
       FROM attendance
       WHERE status='absent'
         AND attendance_date >= date('now', '-${days} days')${studentScopeFilter}`,
      cohortParams
    )).rows[0]?.c || 0;

    const lowGradeParams = [];
    const lowGradeWhere = ["gv.value BETWEEN 0 AND 5", "gv.value < 3", "COALESCE(gb.is_visible, TRUE) = TRUE"];
    if (phaseId) {
      if (termId) {
        lowGradeWhere.push("(gv.phase_id = ? OR (gv.phase_id IS NULL AND gb.term_id = ?))");
        lowGradeParams.push(phaseId, termId);
      } else {
        lowGradeWhere.push("gv.phase_id = ?");
        lowGradeParams.push(phaseId);
      }
    }
    if (teamRow?.id) {
      lowGradeWhere.push("s.team_id = ?");
      lowGradeParams.push(teamRow.id);
    }
    const lowGrades = (await db.query(
      `SELECT COUNT(*) AS c
       FROM gradebook_values gv
       JOIN gradebooks gb ON gb.id = gv.gradebook_id
       JOIN students s ON s.id = gv.student_id
       WHERE ${lowGradeWhere.join(" AND ")}`,
      lowGradeParams
    )).rows[0]?.c || 0;

    const coachingMissedMeetings = (await db.query(
      `SELECT COUNT(*) AS c
       FROM coaching_sessions
       WHERE attended=0
         AND session_date >= date('now', '-${days} days')${studentScopeFilter}`,
      cohortParams
    )).rows[0]?.c || 0;

    const alertsTotal = Number(lateAttendance) + Number(missedDays) + Number(lowGrades) + Number(coachingMissedMeetings);

    res.json({
      phaseId: phaseId || null,
      phaseName,
      scope,
      windowLabel,
      lateAttendance: Number(lateAttendance) || 0,
      missedDays: Number(missedDays) || 0,
      lateSubmissions: Number(lowGrades) || 0,
      coachingMissedMeetings: Number(coachingMissedMeetings) || 0,
      alerts: alertsTotal,
      strikes: 0
    });
  } catch (error) {
    console.error("alerts summary error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Public endpoint TV uses to fetch current display config + team scores
router.get("/public", async (req, res) => {
  try {
    const settings = normalizeSettings((await db.query("SELECT * FROM tv_settings LIMIT 1")).rows[0]);
    if (!settings) {
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
      return res.json({
        settings: normalizeSettings({
          current_stream: "webdev",
          current_topic_id: null,
          current_phase_id: null,
          current_screen: defaultEnabledScreens[0] || "topic_team_dials",
          loop_seconds: 20,
          slide_seconds: 20,
          enabled_screens: JSON.stringify(defaultEnabledScreens),
          screen_order: JSON.stringify(defaultScreens),
          enabled_streams: JSON.stringify(["webdev", "meta", "coaching", "alerts"]),
          rotation_order: JSON.stringify(["meta", "webdev", "coaching", "alerts"]),
          rotation_mode: "topic",
          topic_scope: "phase",
          screen_mode: "playlist"
        }),
        currentTermLabel: null,
        topic: null,
        teamScores: [],
        webdevSprintHeading: "Current Sprint",
        webdevSprintLabel: "Current Sprint",
        studentMarks: { rows: [], columns: { meta: [], webdev: [] } },
        coaching: { weeks: [], series: [] },
        metaProjects: { teams: [], rows: [] },
        metaSkills1: { teams: [], rows: [] },
        metaSkills2: { teams: [], rows: [] },
        alertsSummary: { info: 0, warning: 0, critical: 0 },
        metaTeamScores: [],
        metaSprintHeading: "Current Sprint",
        metaSprintLabel: "Current Sprint",
        comments: [],
        notifications: [],
        messages: []
      });
    }

    const enabledScreens = Array.isArray(settings.enabled_screens) ? settings.enabled_screens : [];
    const enabledScreenSet = new Set(enabledScreens);
    const SCREENS_THAT_NEED_TOPIC = new Set(["topic_team_dials", "topic_student_bars"]);
    const needsTopic = SCREENS_THAT_NEED_TOPIC.has(settings.current_screen);

    // Topic IDs are kept internally for compatibility, but topic screens now display per-stream summaries.
    let topicId = settings.current_topic_id;

    if (!topicId && needsTopic && settings.current_phase_id && settings.current_stream !== "alerts") {
      const t = await db.query(
        "SELECT id FROM topics WHERE phase_id=? AND stream=? ORDER BY created_at ASC LIMIT 1",
        [settings.current_phase_id, settings.current_stream]
      );
      topicId = t.rows[0]?.id || null;
    }

    const currentPhase = await loadCurrentPhaseDetails(settings.current_phase_id);
    const currentTermNumber = Number(currentPhase?.phase_order || extractOrderNumber(currentPhase?.name));
    let metaTopicLabel = null;
    if (Number.isFinite(currentTermNumber) && currentTermNumber > 0) {
      metaTopicLabel = (
        await db.query(
          `SELECT topic
           FROM sprint_definitions
           WHERE stream = $1 AND term = $2
           LIMIT 1`,
          ["meta", currentTermNumber]
        )
      ).rows[0]?.topic || null;
    }

    const topic = (needsTopic && topicId)
      ? (await db.query("SELECT * FROM topics WHERE id=?", [topicId])).rows[0]
      : null;

    let teamScores = [];
    let metaTeamScores = [];
    let webdevSprintHeading = "Current Sprint";
    let webdevSprintLabel = "Current Sprint";
    let metaSprintHeading = "Current Sprint";
    let metaSprintLabel = "Current Sprint";
    if (enabledScreenSet.has("topic_team_dials")) {
      const webdevSprintScope = await resolveSprintScopeForTv({
        phase: currentPhase,
        stream: "webdev"
      });
      teamScores = await loadTeamScoresForTv({
        phaseId: settings.current_phase_id,
        termId: currentPhase?.term_id || null,
        gradebookIds: webdevSprintScope.gradebookIds
      });
      webdevSprintHeading = webdevSprintScope.heading || "Current Sprint";
      webdevSprintLabel = webdevSprintScope.sprintLabel || webdevSprintHeading;
    }
    if (enabledScreenSet.has("meta_team_dials")) {
      const metaSprintScope = await resolveSprintScopeForTv({
        phase: currentPhase,
        stream: "meta"
      });
      metaTeamScores = await loadTeamScoresForTv({
        phaseId: settings.current_phase_id,
        termId: currentPhase?.term_id || null,
        gradebookIds: metaSprintScope.gradebookIds
      });
      metaSprintHeading = metaSprintScope.heading || "Current Sprint";
      metaSprintLabel = metaSprintScope.sprintLabel || metaSprintHeading;
    }

    let studentMarks = { rows: [], columns: { meta: [], webdev: [] } };
    if (enabledScreenSet.has("topic_student_bars")) {
      studentMarks = await getGradeDetailData({
        phaseId: settings.current_phase_id,
        termId: currentPhase?.term_id || null
      });
    }

    let coaching = { weeks: [], series: [] };
    if (enabledScreenSet.has("coaching_team_trends")) {
      const rows = (await db.query(
        `SELECT
          tm.name as team,
          strftime('%Y-%W', c.session_date) as week,
          SUM(CASE WHEN c.attended=1 THEN 1 ELSE 0 END) AS attended,
          COUNT(*) as total
        FROM coaching_sessions c
        JOIN students s ON s.id = c.student_id
        JOIN teams tm ON tm.id = s.team_id
        WHERE c.session_date >= date('now', '-42 days')
        GROUP BY tm.name, week
        ORDER BY week ASC, tm.name ASC`
      )).rows;

      const weeks = Array.from(new Set(rows.map(r => r.week))).sort();
      const byTeam = {};
      rows.forEach(r => {
        if (!byTeam[r.team]) byTeam[r.team] = {};
        const total = Number(r.total || 0);
        const attended = Number(r.attended || 0);
        byTeam[r.team][r.week] = total ? Math.round((attended / total) * 100) : 0;
      });

      const series = Object.keys(byTeam).sort().map(team => ({
        team,
        data: weeks.map(w => ({ week: w, value: byTeam[team][w] ?? 0 }))
      }));

      coaching = { weeks, series };
    }

    let metaProjects = null;
    let metaSkills1 = null;
    let metaSkills2 = null;
    const wantsMetaProjects = false;
    const wantsMetaSkills1 = enabledScreenSet.has("meta_skills_1");
    const wantsMetaSkills2 = enabledScreenSet.has("meta_skills_2");

    if (wantsMetaProjects || wantsMetaSkills1 || wantsMetaSkills2) {
      const teamRows = (await db.query("SELECT name FROM teams ORDER BY name ASC")).rows;
      const teamNames = teamRows.map(r => r.name);

      async function teamScoresForTopic(topicId) {
        const rows = (await db.query(
          `SELECT
            tm.name as team,
            COALESCE(ROUND(AVG(g.score)), 0) as score
          FROM teams tm
          LEFT JOIN students s ON s.team_id = tm.id AND s.status='active'
          LEFT JOIN grades g ON g.student_id = s.id AND g.topic_id = ?
          GROUP BY tm.name
          ORDER BY tm.name ASC`,
          [topicId]
        )).rows;
        const map = {};
        rows.forEach(r => { map[r.team] = Number(r.score) || 0; });
        return map;
      }

      async function baseMetaScores(phaseId) {
        const params = [];
        const conds = ["t.stream='meta'"];
        if (phaseId) {
          params.push(phaseId);
          conds.push("t.phase_id = ?");
        }
        const avgExpr = `AVG(CASE WHEN ${conds.join(" AND ")} THEN g.score END)`;
        const rows = (await db.query(
          `SELECT
            tm.name as team,
            COALESCE(ROUND(${avgExpr}), 0) as score
          FROM teams tm
          LEFT JOIN students s ON s.team_id = tm.id AND s.status='active'
          LEFT JOIN grades g ON g.student_id = s.id
          LEFT JOIN topics t ON t.id = g.topic_id
          GROUP BY tm.name
          ORDER BY tm.name ASC`,
          params
        )).rows;
        const map = {};
        rows.forEach(r => { map[r.team] = Number(r.score) || 0; });
        return map;
      }

      if (wantsMetaProjects) {
        const params = [];
        let where = "WHERE stream='webdev'";
        if (settings.current_phase_id) {
          params.push(settings.current_phase_id);
          where += " AND phase_id = ?";
        }
        const topics = (await db.query(
          `SELECT id, title FROM topics ${where} ORDER BY week_number ASC, created_at ASC LIMIT 3`,
          params
        )).rows;

        const rows = [];
        if (topics.length) {
          for (const t of topics) {
            const scores = await teamScoresForTopic(t.id);
            rows.push({
              label: t.title,
              values: teamNames.map(name => scores[name] ?? 0)
            });
          }
        }

        metaProjects = { teams: teamNames, rows };
      }

      if (wantsMetaSkills1 || wantsMetaSkills2) {
        const baseScores = await baseMetaScores(settings.current_phase_id);
        const keywordMap = {
          "Leadership": "leadership",
          "Critical Thinking": "critical",
          "Digital Agility": "digital",
          "Communication": "communication",
          "Interpersonal Skills": "interpersonal",
          "Personal Mastery": "mastery"
        };

        async function scoresForLabel(label) {
          const keyword = keywordMap[label];
          if (!keyword) return baseScores;
          const params = [];
          let where = "WHERE stream='meta' AND LOWER(title) LIKE ?";
          params.push(`%${keyword}%`);
          if (settings.current_phase_id) {
            params.push(settings.current_phase_id);
            where += " AND phase_id = ?";
          }
          const topic = (await db.query(
            `SELECT id FROM topics ${where} ORDER BY created_at ASC LIMIT 1`,
            params
          )).rows[0];
          if (!topic?.id) return baseScores;
          return await teamScoresForTopic(topic.id);
        }

        async function buildSet(labels) {
          const rows = [];
          for (const label of labels) {
            const scores = await scoresForLabel(label);
            rows.push({
              label,
              values: teamNames.map(name => scores[name] ?? baseScores[name] ?? 0)
            });
          }
          return { teams: teamNames, rows };
        }

        if (wantsMetaSkills1) {
          metaSkills1 = await buildSet(["Leadership", "Critical Thinking", "Digital Agility"]);
        }
        if (wantsMetaSkills2) {
          metaSkills2 = await buildSet(["Communication", "Interpersonal Skills", "Personal Mastery"]);
        }
      }
    }

    const messages = (await db.query(
      "SELECT severity, title, body, created_at FROM tv_messages WHERE is_active=1 ORDER BY created_at DESC LIMIT 5"
    )).rows;
    const comments = (
      await db.query(
        `SELECT
           sc.id,
           sc.body,
           sc.author_name,
           sc.created_at,
           sc.updated_at,
           tm.name AS team_name
         FROM stream_comments sc
         LEFT JOIN teams tm ON tm.id = sc.team_id
         WHERE COALESCE(sc.is_active, TRUE) = TRUE
           AND sc.stream = 'meta'
           AND ($1::uuid IS NULL OR sc.phase_id = $1::uuid)
         ORDER BY COALESCE(sc.updated_at, sc.created_at) DESC
         LIMIT 5`,
        [settings.current_phase_id || null]
      )
    ).rows;

    const counts = (await db.query(
      "SELECT severity, COUNT(*) AS c FROM tv_messages WHERE is_active=1 GROUP BY severity"
    )).rows;
    const alertsSummary = { info: 0, warning: 0, critical: 0 };
    counts.forEach(r => {
      const key = r.severity;
      if (alertsSummary[key] !== undefined) alertsSummary[key] = Number(r.c || 0);
    });

    res.json({
      settings,
      currentTermLabel: toTermLabel(currentPhase?.name || ""),
      metaTopicLabel,
      topic,
      teamScores,
      webdevSprintHeading,
      webdevSprintLabel,
      metaTeamScores,
      metaSprintHeading,
      metaSprintLabel,
      studentMarks,
      coaching,
      metaProjects,
      metaSkills1,
      metaSkills2,
      alertsSummary,
      comments,
      notifications: messages,
      messages
    });
  } catch (error) {
    console.error('TV public error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
