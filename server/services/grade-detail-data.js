const db = require("../db-sqlite");
const { ensureGradebookPhaseColumns } = require("./dreamclass-sync");
const { ensureTeamSchema } = require("./team-schema");

function safeLabel(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

async function resolveSelection({ phaseId, termId }) {
  const settings = (await db.query("SELECT current_phase_id, current_term_id FROM tv_settings LIMIT 1")).rows[0] || {};

  const requestedPhaseId = String(phaseId || settings.current_phase_id || "").trim() || null;
  if (requestedPhaseId) {
    const phase = (
      await db.query(
        `SELECT p.id, p.term_id, p.name, t.name AS period_name
         FROM phases p
         LEFT JOIN terms t ON t.id = p.term_id
         WHERE p.id = $1
         LIMIT 1`,
        [requestedPhaseId]
      )
    ).rows[0];
    if (phase) {
      return {
        phaseId: phase.id,
        termId: phase.term_id || null,
        phaseName: phase.name || null,
        periodName: phase.period_name || null
      };
    }
  }

  const requestedTermId = String(termId || settings.current_term_id || "").trim() || null;
  if (requestedTermId) {
    const phase = (
      await db.query(
        `SELECT p.id, p.term_id, p.name, t.name AS period_name
         FROM phases p
         LEFT JOIN terms t ON t.id = p.term_id
         WHERE p.term_id = $1
         ORDER BY p.phase_order ASC, p.created_at ASC
         LIMIT 1`,
        [requestedTermId]
      )
    ).rows[0];
    if (phase) {
      return {
        phaseId: phase.id,
        termId: phase.term_id || null,
        phaseName: phase.name || null,
        periodName: phase.period_name || null
      };
    }
  }

  const fallback = (
    await db.query(
      `SELECT p.id, p.term_id, p.name, t.name AS period_name
       FROM phases p
       LEFT JOIN terms t ON t.id = p.term_id
       ORDER BY p.phase_order ASC, p.created_at ASC
       LIMIT 1`
    )
  ).rows[0];

  return {
    phaseId: fallback?.id || null,
    termId: fallback?.term_id || null,
    phaseName: fallback?.name || null,
    periodName: fallback?.period_name || null
  };
}

function sortByPositionAndName(a, b) {
  const posDiff = Number(a.position || 0) - Number(b.position || 0);
  if (posDiff !== 0) return posDiff;
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
}

function createColumnDefs(rows = [], stream) {
  return [...rows]
    .sort(sortByPositionAndName)
    .map((row, index) => ({
      id: row.id,
      externalId: row.external_id || null,
      stream,
      order: index + 1,
      key: `${stream}_${row.id}`,
      label: `Week ${index + 1}`,
      sourceLabel: row.name || null,
      position: row.position == null ? null : Number(row.position)
    }));
}

async function getGradeDetailData({ phaseId, termId } = {}) {
  await ensureGradebookPhaseColumns();
  await ensureTeamSchema();
  const selection = await resolveSelection({ phaseId, termId });

  const filterParams = [];
  const gradebookParams = [];
  let valueFilterSql = "";
  let gradebookFilterSql = "COALESCE(gb.is_visible, TRUE) = TRUE";

  if (selection.phaseId) {
    filterParams.push(selection.phaseId);
    valueFilterSql += ` AND gv.phase_id = $${filterParams.length}`;
    gradebookParams.push(selection.phaseId);
    gradebookFilterSql += ` AND gb.phase_id = $${gradebookParams.length}`;
  }
  if (selection.termId) {
    filterParams.push(selection.termId);
    valueFilterSql += ` AND gv.term_id = $${filterParams.length}`;
    gradebookParams.push(selection.termId);
    gradebookFilterSql += ` AND gb.term_id = $${gradebookParams.length}`;
  }

  const gradebookRows = (
    await db.query(
      `SELECT gb.id, gb.external_id, gb.name, gb.stream, gb.position
       FROM gradebooks gb
       WHERE ${gradebookFilterSql}
         AND gb.stream IN ('meta', 'webdev')
       ORDER BY gb.stream ASC, gb.position ASC, gb.created_at ASC`,
      gradebookParams
    )
  ).rows;

  const columns = {
    meta: createColumnDefs(gradebookRows.filter((row) => row.stream === "meta"), "meta"),
    webdev: createColumnDefs(gradebookRows.filter((row) => row.stream === "webdev"), "webdev")
  };

  const averageParams = [...filterParams];
  const teamPhaseParamIndex = averageParams.push(selection.phaseId || null);

  const averageRows = (
    await db.query(
      `SELECT
         s.id,
         COALESCE(NULLIF(TRIM(CONCAT(s.first_name, ' ', s.last_name)), ''), 'Student') AS student_name,
         (
           SELECT tm.name
           FROM team_memberships tms
           JOIN teams tm ON tm.id = tms.team_id
           WHERE tms.student_id = s.id
             AND tm.phase_id = $${teamPhaseParamIndex}
             AND COALESCE(tm.is_archived, FALSE) = FALSE
           ORDER BY tm.name ASC
           LIMIT 1
         ) AS team_name,
         ROUND(AVG(CASE WHEN gb.stream = 'meta' THEN gv.value END)::numeric, 2) AS meta_avg,
         ROUND(AVG(CASE WHEN gb.stream = 'webdev' THEN gv.value END)::numeric, 2) AS webdev_avg,
         ROUND(AVG(CASE WHEN gb.stream IN ('meta', 'webdev') THEN gv.value END)::numeric, 2) AS program_avg
       FROM students s
       LEFT JOIN gradebook_values gv
         ON gv.student_id = s.id
         ${valueFilterSql}
       LEFT JOIN gradebooks gb
         ON gb.id = gv.gradebook_id
        AND COALESCE(gb.is_visible, TRUE) = TRUE
        AND gb.stream IN ('meta', 'webdev')
       WHERE COALESCE(s.status, 'active') = 'active'
       GROUP BY s.id, student_name
       ORDER BY student_name ASC`,
      averageParams
    )
  ).rows;

  const valueRows = (
    await db.query(
      `SELECT
         s.id AS student_id,
         gb.id AS gradebook_id,
         gb.stream,
         ROUND(AVG(gv.value)::numeric, 2) AS score
       FROM students s
       JOIN gradebook_values gv
         ON gv.student_id = s.id
         ${valueFilterSql}
       JOIN gradebooks gb
         ON gb.id = gv.gradebook_id
        AND COALESCE(gb.is_visible, TRUE) = TRUE
        AND gb.stream IN ('meta', 'webdev')
       WHERE COALESCE(s.status, 'active') = 'active'
       GROUP BY s.id, gb.id, gb.stream
       ORDER BY s.id ASC, gb.stream ASC, gb.id ASC`,
      filterParams
    )
  ).rows;

  const rowsByStudent = new Map();
  for (const row of averageRows) {
    rowsByStudent.set(String(row.id), {
      id: row.id,
      name: row.student_name,
      team: row.team_name || null,
      metaWeeks: {},
      webdevWeeks: {},
      metaAvg: row.meta_avg == null ? null : Number(row.meta_avg),
      webdevAvg: row.webdev_avg == null ? null : Number(row.webdev_avg),
      programAvg: row.program_avg == null ? null : Number(row.program_avg)
    });
  }

  const columnKeyMap = new Map();
  [...columns.meta, ...columns.webdev].forEach((column) => {
    columnKeyMap.set(String(column.id), column.key);
  });

  for (const row of valueRows) {
    const student = rowsByStudent.get(String(row.student_id));
    const key = columnKeyMap.get(String(row.gradebook_id));
    if (!student || !key) continue;
    if (row.stream === "meta") {
      student.metaWeeks[key] = row.score == null ? null : Number(row.score);
    } else if (row.stream === "webdev") {
      student.webdevWeeks[key] = row.score == null ? null : Number(row.score);
    }
  }

  return {
    periodName: safeLabel(selection.periodName, "Current Period"),
    phaseId: selection.phaseId,
    termId: selection.termId,
    termName: safeLabel(selection.phaseName, "Current Term"),
    columns,
    rows: [...rowsByStudent.values()].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
    )
  };
}

module.exports = {
  getGradeDetailData,
  resolveGradeDetailSelection: resolveSelection
};
