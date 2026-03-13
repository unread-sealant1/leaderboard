const db = require("../db-sqlite");
const dreamclassClient = require("./dreamclass-client");
const {
  pick,
  normalizeStudentRecord,
  normalizeTopicTitle,
  normalizeStream,
  scoreToPercent
} = require("./dreamclass-mappers");

const SOURCE = "dreamclass";
const TERM_DATE_OVERRIDES = {
  2026: [
    { name: "Term 1", startDate: "2026-03-23", endDate: "2026-05-01", phaseOrder: 1 },
    { name: "Term 2", startDate: "2026-05-04", endDate: "2026-06-05", phaseOrder: 2 },
    { name: "Term 3", startDate: "2026-06-08", endDate: "2026-07-10", phaseOrder: 3 },
    { name: "Term 4", startDate: "2026-07-13", endDate: "2026-08-14", phaseOrder: 4 },
    { name: "Term 5", startDate: "2026-08-17", endDate: "2026-09-24", phaseOrder: 5 }
  ]
};

function norm(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toInt(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseOrderFromName(name, fallback = 1) {
  const match = String(name || "").match(/(\d+)/);
  return match ? Math.max(1, Number(match[1])) : fallback;
}

function normalizeSchoolPeriodRecord(record, levelsById = new Map()) {
  const externalId = String(pick(record, ["id", "schoolPeriodId", "school_period_id", "uuid"]) || "").trim() || null;
  const name = String(pick(record, ["name", "title", "periodName", "schoolPeriodName"]) || "").trim();
  if (!name) return { ok: false, reason: "missing_name", raw: record };

  const levelId = String(
    pick(record, ["level.id", "levelId", "schoolPeriodLevel.id", "schoolPeriodLevelId", "curriculumLevel.id"]) || ""
  ).trim() || null;
  const levelName = levelId ? (levelsById.get(levelId) || "") : "";
  const parentExternalId = String(
    pick(record, ["parent.id", "parentId", "parentSchoolPeriod.id", "parentSchoolPeriodId"]) || ""
  ).trim() || null;

  const startDate = toDateOnly(
    pick(record, ["startDate", "start_date", "dateFrom", "from", "startsAt", "start"])
  );
  const endDate = toDateOnly(
    pick(record, ["endDate", "end_date", "dateTo", "to", "endsAt", "end"])
  );
  const explicitOrder = toInt(
    pick(record, ["phaseOrder", "phase_order", "order", "position", "sortOrder", "sequence"]),
    null
  );

  const hint = `${levelName} ${name}`.toLowerCase();
  let kind = null;
  if (hint.includes("term")) kind = "term";
  else if (hint.includes("phase")) kind = "phase";
  else if (/^\s*term\b/i.test(name)) kind = "term";
  else if (/^\s*phase\b/i.test(name)) kind = "phase";

  return {
    ok: true,
    externalId,
    parentExternalId,
    name,
    kind,
    levelId,
    levelName: levelName || null,
    startDate,
    endDate,
    phaseOrder: explicitOrder ?? parseOrderFromName(name, 1),
    raw: record
  };
}

function dateWithinRange(targetStart, targetEnd, containerStart, containerEnd) {
  if (!targetStart && !targetEnd) return false;
  const ts = targetStart ? Date.parse(targetStart) : null;
  const te = targetEnd ? Date.parse(targetEnd) : null;
  const cs = containerStart ? Date.parse(containerStart) : null;
  const ce = containerEnd ? Date.parse(containerEnd) : null;
  if (Number.isNaN(ts) && Number.isNaN(te)) return false;
  if (cs == null || ce == null || Number.isNaN(cs) || Number.isNaN(ce)) return false;
  const startOk = ts == null || ts >= cs;
  const endOk = te == null || te <= ce;
  return startOk && endOk;
}

function inferStreamFromCourse(course) {
  const name = String(pick(course, ["name", "title"]) || "").trim();
  const code = String(pick(course, ["code", "shortCode"]) || "").trim();
  const combined = `${name} ${code}`.trim();
  if (/portfolio/i.test(combined)) return "portfolio";
  const stream = normalizeStream(combined);
  if (stream) return stream;
  return null;
}

function pickLatestByDate(records = []) {
  const list = [...records];
  list.sort((a, b) => {
    const ad = Date.parse(a.startDate || a.start_date || a.endDate || a.end_date || 0) || 0;
    const bd = Date.parse(b.startDate || b.start_date || b.endDate || b.end_date || 0) || 0;
    if (bd !== ad) return bd - ad;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  return list[0] || null;
}

function toDayMs(value) {
  if (!value) return null;
  const text =
    value instanceof Date && !Number.isNaN(value.getTime())
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function toIsoDate(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function buildDerivedTermWindows(startDate, endDate, count) {
  if (!Number.isFinite(count) || count <= 0) return [];
  const startMs = toDayMs(startDate);
  const endMs = toDayMs(endDate);
  if (startMs == null || endMs == null || endMs < startMs) {
    return Array.from({ length: count }, () => ({ startDate: null, endDate: null }));
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const totalDays = Math.floor((endMs - startMs) / DAY_MS) + 1;
  const baseDays = Math.floor(totalDays / count);
  const remainder = totalDays % count;
  let cursor = startMs;

  return Array.from({ length: count }, (_, index) => {
    const span = Math.max(1, baseDays + (index < remainder ? 1 : 0));
    const segmentEnd = cursor + ((span - 1) * DAY_MS);
    const window = {
      startDate: toIsoDate(cursor),
      endDate: toIsoDate(segmentEnd)
    };
    cursor = segmentEnd + DAY_MS;
    return window;
  });
}

function extractAcademicYear(record) {
  if (!record) return null;
  const fromDate = toDateOnly(record.start_date || record.startDate || record.end_date || record.endDate);
  if (fromDate) {
    const year = Number(String(fromDate).slice(0, 4));
    if (Number.isFinite(year) && year > 2000) return year;
  }
  const text = String(record.name || "").trim();
  const match = text.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function applyConfiguredTermWindows(schoolPeriod, records = []) {
  const year = extractAcademicYear(schoolPeriod);
  const overrides = year ? TERM_DATE_OVERRIDES[year] : null;
  if (!overrides?.length) return null;

  const overrideByName = new Map(
    overrides.map((item) => [norm(normalizeTermLabel(item.name, item.phaseOrder).name), item])
  );

  let matched = 0;
  const patched = records.map((item, index) => {
    const normalizedName = normalizeTermLabel(item.name, index + 1).name;
    const override = overrideByName.get(norm(normalizedName));
    if (!override) return item;
    matched += 1;
    return {
      ...item,
      name: override.name,
      startDate: override.startDate,
      endDate: override.endDate,
      phaseOrder: override.phaseOrder
    };
  });

  if (!records.length) {
    return overrides.map((item) => ({
      ok: true,
      name: item.name,
      kind: "phase",
      parentExternalId: null,
      startDate: item.startDate,
      endDate: item.endDate,
      phaseOrder: item.phaseOrder
    }));
  }

  return matched ? patched : null;
}

function normalizeAttendanceStatus(raw) {
  const value = String(raw || "").trim().toUpperCase();
  if (!value) return null;
  if (["PRESENT", "ATTENDED", "ON_TIME"].includes(value)) return "present";
  if (["TARDY", "LATE"].includes(value)) return "late";
  if (["UNEXCUSED", "EXCUSED", "ABSENT", "EXPELLED", "MISSED"].includes(value)) return "absent";
  return null;
}

function attendanceSeverityRank(status) {
  if (status === "absent") return 3;
  if (status === "late") return 2;
  if (status === "present") return 1;
  return 0;
}

function pickLatestDreamClassYear(records = []) {
  const years = Array.from(new Set(records.map((r) => extractRecordYear(r.raw || r)).filter((y) => Number.isFinite(y))));
  return years.length ? Math.max(...years) : null;
}

function normalizeTermLabel(name, fallbackOrder = 1) {
  const order = parseOrderFromName(name, fallbackOrder);
  return {
    name: `Term ${order}`,
    phaseOrder: order
  };
}

function looksLikeDreamClassTermName(value) {
  return /^\s*(term|phase)\b/i.test(String(value || ""));
}

function normalizeDreamClassTermRecord(record, fallbackOrder = 1) {
  const rawName = String(
    pick(record, [
      "name",
      "title",
      "termName",
      "term.name",
      "gradingTermName",
      "gradingPeriodName"
    ]) || ""
  ).trim();
  if (!rawName) {
    return { ok: false, reason: "missing_name", raw: record };
  }
  if (!looksLikeDreamClassTermName(rawName)) {
    return { ok: false, reason: "not_term", raw: record };
  }

  const normalized = normalizeTermLabel(rawName, fallbackOrder);
  const rawOrder = toInt(
    pick(record, [
      "phaseOrder",
      "phase_order",
      "order",
      "position",
      "sortOrder",
      "sequence"
    ]),
    null
  );
  const safeOrder = Number.isFinite(rawOrder) && rawOrder > 0 && rawOrder < 100
    ? rawOrder
    : normalized.phaseOrder;
  return {
    ok: true,
    name: normalized.name,
    phaseOrder: safeOrder,
    startDate: toDateOnly(
      pick(record, [
        "startDate",
        "start_date",
        "dateFrom",
        "from",
        "startsAt",
        "start",
        "termStartDate"
      ])
    ),
    endDate: toDateOnly(
      pick(record, [
        "endDate",
        "end_date",
        "dateTo",
        "to",
        "endsAt",
        "end",
        "termEndDate"
      ])
    ),
    externalId: String(
      pick(record, ["id", "termId", "gradingTermId", "gradingPeriodId", "uuid"]) || ""
    ).trim() || null,
    raw: record
  };
}

function mergeNumberMap(target = {}, source = {}) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = Number(target[key] || 0) + Number(value || 0);
  }
  return target;
}

function summarizeGradeRuns(runs = []) {
  const safeRuns = runs.filter(Boolean);
  if (safeRuns.length === 1) return safeRuns[0];

  const summary = {
    ok: safeRuns.every((run) => run.ok !== false),
    configured: safeRuns.every((run) => run.configured !== false),
    mode: "all-phases",
    phasesSynced: safeRuns.length,
    created: 0,
    updated: 0,
    fetched: 0,
    schemaColumnsFetched: 0,
    topicsCreated: 0,
    gradebookValuesRequests: 0,
    studentsAttemptedForValues: 0,
    studentsWithMarks: 0,
    skipped: 0,
    errors: 0,
    skippedReasons: {},
    runs: safeRuns,
    samples: {
      skipped: [],
      errors: []
    }
  };

  for (const run of safeRuns) {
    summary.created += Number(run.created || 0);
    summary.updated += Number(run.updated || 0);
    summary.fetched += Number(run.fetched || 0);
    summary.schemaColumnsFetched += Number(run.schemaColumnsFetched || 0);
    summary.topicsCreated += Number(run.topicsCreated || 0);
    summary.gradebookValuesRequests += Number(run.gradebookValuesRequests || 0);
    summary.studentsAttemptedForValues += Number(run.studentsAttemptedForValues || 0);
    summary.studentsWithMarks += Number(run.studentsWithMarks || 0);
    summary.skipped += Number(run.skipped || 0);
    summary.errors += Number(run.errors || 0);
    mergeNumberMap(summary.skippedReasons, run.skippedReasons);
    for (const sample of run.samples?.skipped || []) {
      if (summary.samples.skipped.length >= 8) break;
      summary.samples.skipped.push(sample);
    }
    for (const sample of run.samples?.errors || []) {
      if (summary.samples.errors.length >= 8) break;
      summary.samples.errors.push(sample);
    }
  }

  return summary;
}

async function reconcileTvSettingsSelection({ preferredPeriodName = null, preferredPhaseName = null } = {}) {
  const settings = (await db.query("SELECT * FROM tv_settings LIMIT 1")).rows[0] || null;
  if (!settings) return null;

  const periods = (
    await db.query(
      `SELECT id, name, start_date, end_date
       FROM terms
       WHERE COALESCE(is_active, TRUE) = TRUE
       ORDER BY start_date ASC NULLS LAST, created_at ASC`
    )
  ).rows;
  if (!periods.length) return null;

  const today = toDateOnly(new Date());

  let selectedPeriod =
    (preferredPeriodName && periods.find((row) => norm(row.name) === norm(preferredPeriodName))) ||
    periods.find((row) => String(row.id) === String(settings.current_term_id)) ||
    periods.find((row) => row.start_date && row.end_date && today >= String(row.start_date).slice(0, 10) && today <= String(row.end_date).slice(0, 10)) ||
    periods[0];

  const phases = (
    await db.query(
      `SELECT id, name, start_date, end_date, phase_order
       FROM phases
       WHERE term_id = $1
       ORDER BY phase_order ASC, created_at ASC`,
      [selectedPeriod.id]
    )
  ).rows;

  let selectedPhase =
    (preferredPhaseName && phases.find((row) => norm(row.name) === norm(preferredPhaseName))) ||
    phases.find((row) => String(row.id) === String(settings.current_phase_id)) ||
    phases.find((row) => row.start_date && row.end_date && today >= String(row.start_date).slice(0, 10) && today <= String(row.end_date).slice(0, 10)) ||
    phases[0] ||
    null;

  await db.query(
    `UPDATE tv_settings
     SET current_term_id = $1,
         current_phase_id = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [selectedPeriod.id, selectedPhase?.id || null, settings.id]
  );

  return {
    currentTermId: selectedPeriod.id,
    currentPhaseId: selectedPhase?.id || null
  };
}

async function loadDreamClassTermsForPeriod(schoolPeriodId) {
  const discovered = new Map();
  if (!schoolPeriodId) {
    return { records: [], source: "missing-school-period", endpoint: null };
  }

  try {
    const explicitTermsResp = await dreamclassClient.fetchSchoolPeriodTerms({ schoolPeriodId });
    if (explicitTermsResp?.configured && Array.isArray(explicitTermsResp.records) && explicitTermsResp.records.length) {
      for (const [index, record] of explicitTermsResp.records.entries()) {
        const normalized = normalizeDreamClassTermRecord(record, index + 1);
        if (!normalized.ok) continue;
        const key = norm(normalized.name);
        const existing = discovered.get(key) || null;
        discovered.set(key, {
          ...normalized,
          startDate: normalized.startDate || existing?.startDate || null,
          endDate: normalized.endDate || existing?.endDate || null
        });
      }

      return {
        records: [...discovered.values()].sort((a, b) => a.phaseOrder - b.phaseOrder),
        source: "dreamclass-term-endpoint",
        endpoint: explicitTermsResp.endpoint || null
      };
    }
  } catch {
    // Fall back to gradebook headers when no explicit term endpoint is available.
  }

  let classCoursesResp;
  try {
    classCoursesResp = await dreamclassClient.fetchSchoolPeriodClassCourses({ schoolPeriodId });
  } catch {
    return { records: [], source: "classcourses-unavailable", endpoint: null };
  }

  const classCourses = Array.isArray(classCoursesResp.records) ? classCoursesResp.records : [];
  for (const row of classCourses) {
    const classCourseId = pick(row, ["id", "classCourseId", "class_course_id"]);
    if (!classCourseId) continue;

    try {
      const schemaResp = await dreamclassClient.fetchGrades({ classCourseId: String(classCourseId) });
      const schemaColumns = Array.isArray(schemaResp?.raw?.grades)
        ? schemaResp.raw.grades
        : (Array.isArray(schemaResp?.records) ? schemaResp.records : []);

      for (const column of schemaColumns) {
        const type = Number(column?.type);
        if (type !== 4) continue;
        const normalized = normalizeDreamClassTermRecord(column, discovered.size + 1);
        if (!normalized.ok) continue;
        const key = norm(normalized.name);
        const existing = discovered.get(key) || null;
        discovered.set(key, {
          ...normalized,
          externalId: null,
          startDate: normalized.startDate || existing?.startDate || null,
          endDate: normalized.endDate || existing?.endDate || null
        });
      }
    } catch {
      // Ignore single gradebook failures; other class courses may still expose term headers.
    }
  }

  return {
    records: [...discovered.values()].sort((a, b) => a.phaseOrder - b.phaseOrder),
    source: "gradebook-headers",
    endpoint: classCoursesResp.endpoint || null
  };
}

function extractRecordYear(record) {
  const fromDate = toDateOnly(
    pick(record, ["startDate", "start_date", "endDate", "end_date", "dateFrom", "dateTo"])
  );
  if (fromDate) {
    const y = Number(String(fromDate).slice(0, 4));
    if (Number.isFinite(y) && y > 2000) return y;
  }
  const name = String(pick(record, ["name", "title"]) || "");
  const match = name.match(/\b(20\d{2})\b/);
  if (match) return Number(match[1]);
  return null;
}

function shouldSyncGradebookColumn(col) {
  const type = Number(col?.type);
  if (!Number.isFinite(type)) return true;
  // DreamClass payloads shared so far:
  // 4 = grouping header ("Term 1"), 6 = assessment/topic, 7 = final summary.
  if (type === 4) return false;
  return type === 6 || type === 7;
}

function selectedTermLabel(name) {
  if (!name) return null;
  return normalizeTermLabel(name).name;
}

function buildSelectedTermColumnSet(schemaColumns = [], selectedPhaseName) {
  const targetLabel = selectedTermLabel(selectedPhaseName);
  if (!targetLabel) return null;

  const headers = schemaColumns.filter((col) => Number(col?.type) === 4);
  if (!headers.length) return null;

  const matchingHeader = headers.find((col) => {
    const title = normalizeTopicTitle(pick(col, ["name", "title"])) || "";
    return norm(title) === norm(targetLabel);
  });

  if (!matchingHeader) return new Set();

  const childrenByParent = new Map();
  for (const col of schemaColumns) {
    const parentId = pick(col, ["parentSimpleGradeId", "parent_grade_id"]);
    if (parentId == null) continue;
    const key = String(parentId);
    const list = childrenByParent.get(key) || [];
    list.push(col);
    childrenByParent.set(key, list);
  }

  const allowed = new Set();
  const stack = [String(pick(matchingHeader, ["id", "gradeId", "grade_id"]))];
  while (stack.length) {
    const parentId = stack.pop();
    const children = childrenByParent.get(String(parentId)) || [];
    for (const child of children) {
      const childId = pick(child, ["id", "gradeId", "grade_id"]);
      if (childId == null) continue;
      const key = String(childId);
      if (allowed.has(key)) continue;
      allowed.add(key);
      stack.push(key);
    }
  }

  return allowed;
}

function topicExternalIdFromGradeColumn(classCourseId, gradeColumnId) {
  return `${classCourseId}:${gradeColumnId}`;
}

function parseGradebookValueCells(payload) {
  const candidates = [];
  if (Array.isArray(payload)) candidates.push(payload);
  if (Array.isArray(payload?.values)) candidates.push(payload.values);
  if (Array.isArray(payload?.data?.values)) candidates.push(payload.data.values);
  if (Array.isArray(payload?.gradeValues)) candidates.push(payload.gradeValues);
  if (Array.isArray(payload?.data?.gradeValues)) candidates.push(payload.data.gradeValues);
  if (Array.isArray(payload?.grades)) candidates.push(payload.grades);
  if (Array.isArray(payload?.data?.grades)) candidates.push(payload.data.grades);

  for (const rows of candidates) {
    const parsed = rows
      .map((row) => {
        const gradeId = pick(row, ["gradeId", "grade_id", "simpleGradeId", "simple_grade_id", "id", "grade.id"]);
        const rawValue = pick(row, [
          "value",
          "score",
          "grade",
          "percentage",
          "percent",
          "points",
          "pointsEarned",
          "points_earned"
        ]);
        const rawMax = pick(row, ["max", "maxScore", "max_score", "pointsPossible", "points_possible"]);
        const score = scoreToPercent(rawValue, rawMax);
        if (gradeId == null || score == null) return null;
        return {
          gradeId: String(gradeId),
          score,
          externalId:
            String(pick(row, ["id", "valueId", "value_id", "gradeValueId", "grade_value_id"]) || "").trim() || null,
          raw: row
        };
      })
      .filter(Boolean);

    if (parsed.length) return parsed;
  }

  const objectCandidates = [
    payload?.values,
    payload?.data?.values,
    payload?.gradeValues,
    payload?.data?.gradeValues
  ].filter((v) => v && typeof v === "object" && !Array.isArray(v));

  for (const obj of objectCandidates) {
    const parsed = Object.entries(obj)
      .map(([key, value]) => {
        const score = scoreToPercent(
          typeof value === "object" ? pick(value, ["value", "score", "grade", "percentage", "percent"]) : value,
          typeof value === "object" ? pick(value, ["max", "maxScore", "max_score"]) : null
        );
        if (score == null) return null;
        return {
          gradeId: String(key),
          score,
          externalId:
            typeof value === "object"
              ? String(pick(value, ["id", "valueId", "value_id"]) || "").trim() || null
              : null,
          raw: value
        };
      })
      .filter(Boolean);
    if (parsed.length) return parsed;
  }

  return [];
}

function isEmptyGradebookValuesPayload(payload) {
  if (Array.isArray(payload)) return payload.length === 0;
  if (!payload || typeof payload !== "object") return false;
  if (Array.isArray(payload.values)) return payload.values.length === 0;
  if (Array.isArray(payload.data?.values)) return payload.data.values.length === 0;
  if (Array.isArray(payload.gradeValues)) return payload.gradeValues.length === 0;
  if (Array.isArray(payload.data?.gradeValues)) return payload.data.gradeValues.length === 0;
  if (Array.isArray(payload.grades)) return payload.grades.length === 0;
  if (Array.isArray(payload.data?.grades)) return payload.data.grades.length === 0;
  return false;
}

async function resolveDreamClassClassCoursesForSync({ context, stream, schoolPeriodId, classCourseId }) {
  if (classCourseId) {
    return {
      schoolPeriodId: schoolPeriodId || null,
      schoolPeriodLocalId: null,
      entries: [
        {
          classCourseId: String(classCourseId),
          classId: null,
          courseId: null,
          courseName: null,
          stream: stream || context.stream || "webdev",
          schoolPeriodLocalId: null
        }
      ]
    };
  }

  const cfg = dreamclassClient.getConfig();
  if (cfg.classCourseId) {
    return {
      schoolPeriodId: schoolPeriodId || null,
      schoolPeriodLocalId: null,
      entries: [
        {
          classCourseId: String(cfg.classCourseId),
          classId: null,
          courseId: null,
          courseName: null,
          stream: stream || context.stream || "webdev",
          schoolPeriodLocalId: null
        }
      ]
    };
  }

  const [periodsResp, coursesResp] = await Promise.all([
    dreamclassClient.fetchSchoolPeriods(),
    dreamclassClient.fetchCourses()
  ]);

  const periods = Array.isArray(periodsResp.records) ? periodsResp.records : [];
  let selectedPeriod = null;

  if (schoolPeriodId) {
    selectedPeriod = periods.find((p) => String(p.id) === String(schoolPeriodId)) || null;
  }

  if (!selectedPeriod && context.phase?.term_id) {
    const term = (
      await db.query(`SELECT id, name, start_date, end_date FROM terms WHERE id=$1 LIMIT 1`, [context.phase.term_id])
    ).rows[0] || null;
    if (term) {
      selectedPeriod =
        periods.find((p) => norm(p.name) === norm(term.name)) ||
        periods.find((p) =>
          dateWithinRange(
            String(context.phase.start_date || "").slice(0, 10) || null,
            String(context.phase.end_date || "").slice(0, 10) || null,
            toDateOnly(p.startDate),
            toDateOnly(p.endDate)
          )
        ) ||
        null;
    }
  }

  if (!selectedPeriod) selectedPeriod = pickLatestByDate(periods);
  if (!selectedPeriod) {
    const err = new Error("DreamClass returned no school periods; cannot resolve class courses for grade sync.");
    err.statusCode = 400;
    throw err;
  }

  const classCoursesResp = await dreamclassClient.fetchSchoolPeriodClassCourses({ schoolPeriodId: selectedPeriod.id });
  const classCourses = Array.isArray(classCoursesResp.records) ? classCoursesResp.records : [];
  const coursesById = new Map((coursesResp.records || []).map((c) => [String(c.id), c]));
  const localSchoolPeriodId = (
    await db.query(
      `SELECT id FROM school_periods WHERE external_source=$1 AND external_id=$2 LIMIT 1`,
      [SOURCE, String(selectedPeriod.id)]
    )
  ).rows[0]?.id || null;

  const desiredStream = (stream || context.stream || "webdev").toString().toLowerCase();
  let entries = classCourses.map((row) => {
    const course = coursesById.get(String(row.courseId)) || null;
    const inferredStream = inferStreamFromCourse(course) || desiredStream;
    return {
      classCourseId: String(row.id),
      classId: row.classId == null ? null : String(row.classId),
      courseId: row.courseId == null ? null : String(row.courseId),
      courseName: course ? String(course.name || "").trim() : null,
      stream: inferredStream,
      schoolPeriodLocalId: localSchoolPeriodId
    };
  });

  if (desiredStream !== "all") {
    const filtered = entries.filter((e) => e.stream === desiredStream);
    if (filtered.length) entries = filtered;
    else if (entries.some((e) => e.stream)) entries = [];
  }

  return {
    schoolPeriodId: String(selectedPeriod.id),
    schoolPeriodLocalId: localSchoolPeriodId,
    schoolPeriodName: String(selectedPeriod.name || "").trim() || null,
    entries
  };
}

async function resolveSyncContext({ phaseId, termId, stream } = {}) {
  const settings = (await db.query("SELECT * FROM tv_settings LIMIT 1")).rows[0] || null;

  let resolvedPhaseId = phaseId || null;
  let resolvedTermId = termId || settings?.current_term_id || null;

  if (!resolvedPhaseId && resolvedTermId) {
    resolvedPhaseId = (
      await db.query(
        "SELECT id FROM phases WHERE term_id=$1 ORDER BY phase_order ASC, created_at ASC LIMIT 1",
        [resolvedTermId]
      )
    ).rows[0]?.id || null;
  }

  if (!resolvedPhaseId && settings?.current_phase_id) {
    resolvedPhaseId = settings.current_phase_id;
  }
  if (!resolvedPhaseId) {
    resolvedPhaseId = (
      await db.query("SELECT id FROM phases ORDER BY phase_order DESC, created_at DESC LIMIT 1")
    ).rows[0]?.id || null;
  }

  let phase = null;
  if (resolvedPhaseId) {
    phase = (await db.query("SELECT * FROM phases WHERE id=$1 LIMIT 1", [resolvedPhaseId])).rows[0] || null;
  }

  if (phase?.term_id) resolvedTermId = phase.term_id;

  const resolvedStream = (stream || settings?.current_stream || "webdev").toString();

  return {
    settings,
    phase,
    phaseId: phase?.id || resolvedPhaseId || null,
    phaseName: phase?.name || null,
    termId: resolvedTermId || null,
    stream: resolvedStream
  };
}

async function ensureGradebookPhaseColumns() {
  if (ensureGradebookPhaseColumns._done) return;

  if (process.env.DATABASE_URL) {
    await db.query(
      `ALTER TABLE gradebooks
       ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE SET NULL`
    );
    await db.query(
      `ALTER TABLE gradebook_values
       ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE SET NULL`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_gradebooks_phase_stream
       ON gradebooks(phase_id, stream)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_gradebook_values_student_phase
       ON gradebook_values(student_id, phase_id)`
    );
  } else {
    try {
      await db.query(`ALTER TABLE gradebooks ADD COLUMN phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE gradebook_values ADD COLUMN phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL`);
    } catch {}
  }

  ensureGradebookPhaseColumns._done = true;
}

async function ensureAttendanceSyncColumns() {
  if (ensureAttendanceSyncColumns._done) return;

  if (process.env.DATABASE_URL) {
    await db.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS school_period_id UUID REFERENCES school_periods(id) ON DELETE SET NULL`);
    await db.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS external_source TEXT`);
    await db.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS external_id TEXT`);
    await db.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS raw JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await db.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_attendance_external ON attendance(external_source, external_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_attendance_school_period_date ON attendance(school_period_id, attendance_date)`);
  } else {
    try {
      await db.query(`ALTER TABLE attendance ADD COLUMN school_period_id TEXT REFERENCES school_periods(id) ON DELETE SET NULL`);
    } catch {}
    try {
      await db.query(`ALTER TABLE attendance ADD COLUMN external_source TEXT`);
    } catch {}
    try {
      await db.query(`ALTER TABLE attendance ADD COLUMN external_id TEXT`);
    } catch {}
    try {
      await db.query(`ALTER TABLE attendance ADD COLUMN raw TEXT NOT NULL DEFAULT '{}'`);
    } catch {}
    try {
      await db.query(`ALTER TABLE attendance ADD COLUMN last_synced_at DATETIME`);
    } catch {}
  }

  ensureAttendanceSyncColumns._done = true;
}

async function purgeDreamClassPhaseGradeData(phaseId, { dryRun = false } = {}) {
  if (!phaseId) return;
  if (dryRun) return;

  await ensureGradebookPhaseColumns();

  await db.query(`DELETE FROM gradebook_values WHERE phase_id=$1`, [phaseId]);
  await db.query(`DELETE FROM gradebooks WHERE phase_id=$1 AND external_source=$2`, [phaseId, SOURCE]);
  await db.query(
    `DELETE FROM grades
     WHERE topic_id IN (
       SELECT id FROM topics WHERE phase_id=$1 AND external_source=$2
     )`,
    [phaseId, SOURCE]
  );
  await db.query(`DELETE FROM topics WHERE phase_id=$1 AND external_source=$2`, [phaseId, SOURCE]);
}

async function loadStudentMaps() {
  const rows = (
    await db.query(
      `SELECT id, first_name, last_name, email, status, team_id, external_source, external_id
       FROM students`
    )
  ).rows;

  const byExternal = new Map();
  const byEmail = new Map();
  const byName = new Map();

  for (const row of rows) {
    if (row.external_source === SOURCE && row.external_id) {
      byExternal.set(String(row.external_id), row);
    }
    if (row.email) byEmail.set(String(row.email).trim().toLowerCase(), row);
    byName.set(`${norm(row.first_name)}|${norm(row.last_name)}`, row);
  }

  return { rows, byExternal, byEmail, byName };
}

function buildRemoteStudentLookup(remoteRecords = []) {
  const byEmail = new Map();
  const byName = new Map();
  for (const rec of remoteRecords) {
    const email = String(pick(rec, ["email", "email_address", "emailAddress"]) || "").trim().toLowerCase();
    if (email) byEmail.set(email, rec);
    const first = String(pick(rec, ["first_name", "firstName", "firstname", "given_name", "givenName"]) || "").trim();
    const last = String(pick(rec, ["last_name", "lastName", "lastname", "surname", "family_name", "familyName"]) || "").trim();
    if (first || last) byName.set(`${norm(first)}|${norm(last)}`, rec);
    const fullName = String(pick(rec, ["name", "full_name", "fullName"]) || "").trim();
    if (fullName && !byName.has(fullName)) {
      const parts = fullName.split(/\s+/);
      if (parts.length >= 2) {
        byName.set(`${norm(parts.slice(0, -1).join(" "))}|${norm(parts[parts.length - 1])}`, rec);
      }
    }
  }
  return { byEmail, byName };
}

function candidatePeriodStudentIdsForLocalStudent(localStudent, remoteStudent, schoolPeriodId) {
  const ids = [];
  const push = (v) => {
    const x = String(v || "").trim();
    if (!x || ids.includes(x)) return;
    ids.push(x);
  };

  push(localStudent.external_id);

  if (remoteStudent) {
    push(pick(remoteStudent, ["periodStudentId", "period_student_id"]));
    push(pick(remoteStudent, ["id", "studentId", "student_id"]));

    const schoolPeriods = Array.isArray(remoteStudent.schoolPeriods) ? remoteStudent.schoolPeriods : [];
    for (const sp of schoolPeriods) {
      const spId = pick(sp, ["schoolPeriod.id", "schoolPeriodId", "school_period_id"]);
      const periodStudentId = pick(sp, ["id", "periodStudentId", "period_student_id"]);
      if (schoolPeriodId && String(spId) === String(schoolPeriodId)) push(periodStudentId);
    }
    for (const sp of schoolPeriods) {
      push(pick(sp, ["id", "periodStudentId", "period_student_id"]));
    }
  }

  return ids;
}

async function purgeAcademicStructure({ dryRun = false } = {}) {
  const summary = {
    purgedGradebookValues: 0,
    purgedGradebooks: 0,
    purgedTopics: 0,
    purgedPhases: 0,
    purgedTerms: 0,
    purgedSchoolPeriods: 0
  };
  if (dryRun) return summary;

  const delGradebookValues = await db.query("DELETE FROM gradebook_values");
  const delGradebooks = await db.query("DELETE FROM gradebooks");
  const delTopics = await db.query("DELETE FROM topics");
  const delPhases = await db.query("DELETE FROM phases");
  const delTerms = await db.query("DELETE FROM terms");
  const delSchoolPeriods = await db.query("DELETE FROM school_periods");

  summary.purgedGradebookValues = Number(delGradebookValues?.rowCount || 0);
  summary.purgedGradebooks = Number(delGradebooks?.rowCount || 0);
  summary.purgedTopics = Number(delTopics?.rowCount || 0);
  summary.purgedPhases = Number(delPhases?.rowCount || 0);
  summary.purgedTerms = Number(delTerms?.rowCount || 0);
  summary.purgedSchoolPeriods = Number(delSchoolPeriods?.rowCount || 0);
  return summary;
}

async function syncTermsAndPhases({ dryRun = false, replaceLocalAcademic = false } = {}) {
  if (!dreamclassClient.isConfigured()) {
    return {
      ok: true,
      configured: false,
      skipped: true,
      reason: "DreamClass not configured"
    };
  }

  const currentTvSelection = dryRun
    ? null
    : (
        await db.query(
          `SELECT
             ts.id,
             ts.current_term_id,
             ts.current_phase_id,
             t.name AS current_term_name,
             p.name AS current_phase_name
           FROM tv_settings ts
           LEFT JOIN terms t ON t.id = ts.current_term_id
           LEFT JOIN phases p ON p.id = ts.current_phase_id
           LIMIT 1`
        )
      ).rows[0] || null;

  const [periodsResp, levelsResp] = await Promise.all([
    dreamclassClient.fetchSchoolPeriods(),
    dreamclassClient.fetchLevels().catch(() => ({ records: [] }))
  ]);

  const levelsById = new Map();
  for (const lvl of (levelsResp.records || [])) {
    const id = String(pick(lvl, ["id", "levelId"]) || "").trim();
    const name = String(pick(lvl, ["name", "title"]) || "").trim();
    if (id && name) levelsById.set(id, name);
  }

  const parsed = (periodsResp.records || []).map((r) => normalizeSchoolPeriodRecord(r, levelsById));
  let valid = parsed.filter((r) => r.ok);

  const years = Array.from(new Set(valid.map((r) => extractRecordYear(r.raw)).filter((y) => Number.isFinite(y))));
  const currentYear = years.length ? Math.max(...years) : null;
  if (currentYear) {
    valid = valid.filter((r) => {
      const y = extractRecordYear(r.raw);
      return y == null || y === currentYear;
    });
  }

  const summary = {
    ok: true,
    configured: true,
    source: SOURCE,
    endpoint: periodsResp.endpoint,
    fetched: (periodsResp.records || []).length,
    parsed: valid.length,
    currentYear,
    termsCreated: 0,
    termsUpdated: 0,
    phasesCreated: 0,
    phasesUpdated: 0,
    skipped: 0,
    errors: 0,
    skippedReasons: {},
    samples: {
      skipped: [],
      errors: []
    },
    purged: null
  };

  if (replaceLocalAcademic) {
    summary.purged = await purgeAcademicStructure({ dryRun });
  }

  const localSchoolPeriods = (
    await db.query(
      `SELECT id, name, start_date, end_date, external_source, external_id
       FROM school_periods
       ORDER BY created_at ASC`
    )
  ).rows;
  const schoolPeriodByExternal = new Map(
    localSchoolPeriods
      .filter((row) => row.external_source === SOURCE && row.external_id)
      .map((row) => [String(row.external_id), row])
  );
  const schoolPeriodByName = new Map(localSchoolPeriods.map((row) => [norm(row.name), row]));

  const localTerms = (
    await db.query(
      `SELECT id, name, start_date, end_date, school_period_id, external_source, external_id, created_at
       FROM terms
       ORDER BY created_at ASC`
    )
  ).rows;
  const localPhases = (await db.query(`SELECT id, term_id, name, start_date, end_date, phase_order, created_at FROM phases ORDER BY created_at ASC`)).rows;

  const localTermByName = new Map(localTerms.map((t) => [norm(t.name), t]));
  const localPhasesByTerm = new Map();
  for (const ph of localPhases) {
    const key = `${ph.term_id}|${norm(ph.name)}`;
    localPhasesByTerm.set(key, ph);
  }

  const periodCandidates = [...valid];

  const termByExternalId = new Map();
  const termList = [...localTerms];
  const syncedTerms = [];

  for (const period of periodCandidates) {
    try {
      let schoolPeriod = null;
      if (period.externalId && schoolPeriodByExternal.has(period.externalId)) {
        schoolPeriod = schoolPeriodByExternal.get(period.externalId);
      } else if (schoolPeriodByName.has(norm(period.name))) {
        schoolPeriod = schoolPeriodByName.get(norm(period.name));
      } else if (!dryRun) {
        schoolPeriod = (
          await db.query(
            `INSERT INTO school_periods (name, start_date, end_date, external_source, external_id, last_synced_at)
             VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
             RETURNING *`,
            [period.name, period.startDate, period.endDate, SOURCE, period.externalId || null]
          )
        ).rows[0] || null;
        if (schoolPeriod) {
          schoolPeriodByName.set(norm(schoolPeriod.name), schoolPeriod);
          if (schoolPeriod.external_id) schoolPeriodByExternal.set(String(schoolPeriod.external_id), schoolPeriod);
        }
      } else {
        schoolPeriod = {
          id: `dry-school-period-${summary.termsCreated + summary.termsUpdated + 1}`,
          name: period.name,
          start_date: period.startDate,
          end_date: period.endDate,
          external_source: SOURCE,
          external_id: period.externalId || null
        };
      }

      let existing = localTermByName.get(norm(period.name)) || null;
      if (!existing && period.startDate && period.endDate) {
        existing = termList.find((t) =>
          t.start_date && t.end_date &&
          String(t.start_date).slice(0, 10) === period.startDate &&
          String(t.end_date).slice(0, 10) === period.endDate
        ) || null;
      }

      if (existing) {
        if (!dryRun) {
          await db.query(
            `UPDATE terms
             SET name=$1, start_date=$2, end_date=$3, school_period_id=$4, external_source=$5, external_id=$6, last_synced_at=CURRENT_TIMESTAMP
             WHERE id=$7`,
            [period.name, period.startDate, period.endDate, schoolPeriod?.id || null, SOURCE, period.externalId || null, existing.id]
          );
        }
        existing.name = period.name;
        existing.start_date = period.startDate;
        existing.end_date = period.endDate;
        existing.school_period_id = schoolPeriod?.id || null;
        existing.external_source = SOURCE;
        existing.external_id = period.externalId || null;
        summary.termsUpdated += 1;
      } else {
        let inserted = null;
        if (!dryRun) {
          inserted = (await db.query(
            `INSERT INTO terms (name, start_date, end_date, school_period_id, external_source, external_id, last_synced_at, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,TRUE)
             RETURNING id, name, start_date, end_date, school_period_id, created_at`,
            [period.name, period.startDate, period.endDate, schoolPeriod?.id || null, SOURCE, period.externalId || null]
          )).rows[0] || null;
        } else {
          inserted = {
            id: `dry-term-${summary.termsCreated + 1}`,
            name: period.name,
            start_date: period.startDate,
            end_date: period.endDate,
            school_period_id: schoolPeriod?.id || null,
            created_at: new Date().toISOString()
          };
        }
        if (inserted) {
          termList.push(inserted);
          localTermByName.set(norm(inserted.name), inserted);
          existing = inserted;
        }
        summary.termsCreated += 1;
      }

      if (existing) {
        syncedTerms.push(existing);
      }
      if (period.externalId && existing) termByExternalId.set(period.externalId, existing);
    } catch (error) {
      summary.errors += 1;
      if (summary.samples.errors.length < 8) {
        summary.samples.errors.push({ message: error.message, kind: "period", name: period.name });
      }
    }
  }

  const sortedTerms = [...new Map(syncedTerms.map((row) => [String(row.id), row])).values()].sort((a, b) => {
    const aStart = Date.parse(a.start_date || 0) || 0;
    const bStart = Date.parse(b.start_date || 0) || 0;
    if (aStart !== bStart) return aStart - bStart;
    return norm(a.name).localeCompare(norm(b.name));
  });

  const phaseCandidates = [];
  for (const term of sortedTerms) {
    const relatedExternalId =
      [...termByExternalId.entries()].find(([, localTerm]) => String(localTerm?.id) === String(term.id))?.[0] ||
      null;

    const remoteTerms = await loadDreamClassTermsForPeriod(relatedExternalId);
    const configuredRecords = applyConfiguredTermWindows(term, remoteTerms.records);
    const remoteTermRecords = configuredRecords || remoteTerms.records;

    if (!remoteTermRecords.length) {
      summary.skipped += 1;
      summary.skippedReasons.missing_dreamclass_terms = (summary.skippedReasons.missing_dreamclass_terms || 0) + 1;
      if (summary.samples.skipped.length < 8) {
        summary.samples.skipped.push({
          reason: "missing_dreamclass_terms",
          period: term.name,
          schoolPeriodExternalId: relatedExternalId || null,
          source: remoteTerms.source
        });
      }
      continue;
    }

    if (
      remoteTermRecords.length &&
      term.start_date &&
      term.end_date &&
      remoteTermRecords.every((item) => !item.startDate && !item.endDate)
    ) {
      const orderedRecords = [...remoteTermRecords].sort((a, b) => a.phaseOrder - b.phaseOrder);
      const windows = buildDerivedTermWindows(term.start_date, term.end_date, orderedRecords.length);
      orderedRecords.forEach((item, index) => {
        item.startDate = windows[index]?.startDate || null;
        item.endDate = windows[index]?.endDate || null;
      });
    }

    for (const item of remoteTermRecords) {
      phaseCandidates.push({
        ok: true,
        name: item.name,
        kind: "phase",
        parentExternalId: relatedExternalId,
        startDate: item.startDate || null,
        endDate: item.endDate || null,
        phaseOrder: item.phaseOrder
      });
    }
  }

  for (const phase of phaseCandidates) {
    let term = null;
    if (phase.parentExternalId && termByExternalId.has(phase.parentExternalId)) {
      term = termByExternalId.get(phase.parentExternalId);
    } else if (sortedTerms.length === 1) {
      term = sortedTerms[0];
    } else if (sortedTerms.length > 1) {
      term = sortedTerms.find((t) =>
        dateWithinRange(phase.startDate, phase.endDate, t.start_date, t.end_date)
      ) || null;
    }

    if (!term) {
      summary.skipped += 1;
      summary.skippedReasons.unmapped_phase_term = (summary.skippedReasons.unmapped_phase_term || 0) + 1;
      if (summary.samples.skipped.length < 8) {
        summary.samples.skipped.push({
          reason: "unmapped_phase_term",
          phase: phase.name,
          parentExternalId: phase.parentExternalId || null
        });
      }
      continue;
    }

    try {
      const phaseKey = `${term.id}|${norm(phase.name)}`;
      let existing = localPhasesByTerm.get(phaseKey) || null;

      if (existing) {
        if (!dryRun) {
          await db.query(
            `UPDATE phases
             SET name=$1, start_date=$2, end_date=$3, phase_order=$4
             WHERE id=$5`,
            [phase.name, phase.startDate, phase.endDate, phase.phaseOrder || 1, existing.id]
          );
        }
        summary.phasesUpdated += 1;
      } else {
        let inserted = null;
        if (!dryRun) {
          inserted = (await db.query(
            `INSERT INTO phases (term_id, name, start_date, end_date, phase_order)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING id, term_id, name, start_date, end_date, phase_order, created_at`,
            [term.id, phase.name, phase.startDate, phase.endDate, phase.phaseOrder || 1]
          )).rows[0] || null;
        } else {
          inserted = {
            id: `dry-phase-${summary.phasesCreated + 1}`,
            term_id: term.id,
            name: phase.name,
            start_date: phase.startDate,
            end_date: phase.endDate,
            phase_order: phase.phaseOrder || 1
          };
        }
        if (inserted) {
          localPhasesByTerm.set(phaseKey, inserted);
        }
        summary.phasesCreated += 1;
      }
    } catch (error) {
      summary.errors += 1;
      if (summary.samples.errors.length < 8) {
        summary.samples.errors.push({ message: error.message, kind: "phase", name: phase.name, termId: term.id });
      }
    }
  }

  if (!dryRun) {
    const tvSelection = await reconcileTvSettingsSelection({
      preferredPeriodName: currentTvSelection?.current_term_name || null,
      preferredPhaseName: currentTvSelection?.current_phase_name || null
    });
    summary.currentTermId = tvSelection?.currentTermId || null;
    summary.currentPhaseId = tvSelection?.currentPhaseId || null;
  }

  return summary;
}

function buildPeriodStudentLookup(remoteRecords = []) {
  const byStudentId = new Map();
  const byPeriodStudentId = new Map();
  const byEmail = new Map();
  const byName = new Map();

  for (const record of remoteRecords) {
    const periodStudentId = String(pick(record, ["id", "periodStudentId", "period_student_id"]) || "").trim();
    const studentId = String(pick(record, ["student.id", "studentId", "student_id"]) || "").trim();
    const email = String(pick(record, ["student.email", "email"]) || "").trim().toLowerCase();
    const firstName = String(pick(record, ["student.firstname", "student.firstName", "firstname", "firstName"]) || "").trim();
    const lastName = String(pick(record, ["student.lastname", "student.lastName", "lastname", "lastName"]) || "").trim();
    const nameKey = `${norm(firstName)}|${norm(lastName)}`;
    const mapped = { periodStudentId: periodStudentId || null, studentId: studentId || null, email: email || null, firstName, lastName, raw: record };
    if (studentId) byStudentId.set(studentId, mapped);
    if (periodStudentId) byPeriodStudentId.set(periodStudentId, mapped);
    if (email) byEmail.set(email, mapped);
    if (firstName || lastName) byName.set(nameKey, mapped);
  }

  return { byStudentId, byPeriodStudentId, byEmail, byName };
}

function resolveLocalStudentForAttendance(localStudents, remotePeriodStudent) {
  if (!remotePeriodStudent) return null;

  if (remotePeriodStudent.periodStudentId && localStudents.byExternal.has(remotePeriodStudent.periodStudentId)) {
    return localStudents.byExternal.get(remotePeriodStudent.periodStudentId);
  }
  if (remotePeriodStudent.studentId && localStudents.byExternal.has(remotePeriodStudent.studentId)) {
    return localStudents.byExternal.get(remotePeriodStudent.studentId);
  }
  if (remotePeriodStudent.email && localStudents.byEmail.has(remotePeriodStudent.email)) {
    return localStudents.byEmail.get(remotePeriodStudent.email);
  }
  const nameKey = `${norm(remotePeriodStudent.firstName)}|${norm(remotePeriodStudent.lastName)}`;
  if (localStudents.byName.has(nameKey)) {
    return localStudents.byName.get(nameKey);
  }
  return null;
}

function normalizeDailyAttendanceRows(rows = []) {
  return rows
    .map((row) => {
      const studentId = String(pick(row, ["studentId", "student_id", "student.id"]) || "").trim();
      const date = toDateOnly(pick(row, ["date", "attendanceDate", "attendance_date"]));
      const status = normalizeAttendanceStatus(pick(row, ["attendanceStatus", "status"]));
      if (!studentId || !date || !status) return null;
      return {
        studentId,
        date,
        status,
        raw: row,
        externalId: `daily:${studentId}:${date}`
      };
    })
    .filter(Boolean);
}

function normalizeLessonAttendanceRows(rows = []) {
  const byStudentDate = new Map();

  for (const row of rows) {
    const studentId = String(pick(row, ["studentId", "student_id", "student.id"]) || "").trim();
    const date = toDateOnly(pick(row, ["date", "attendanceDate", "attendance_date"]));
    const status = normalizeAttendanceStatus(pick(row, ["attendanceStatus", "status"]));
    if (!studentId || !date || !status) continue;

    const key = `${studentId}|${date}`;
    const current = byStudentDate.get(key);
    if (!current || attendanceSeverityRank(status) > attendanceSeverityRank(current.status)) {
      byStudentDate.set(key, {
        studentId,
        date,
        status,
        raw: [row],
        externalId: `lesson:${studentId}:${date}`
      });
    } else {
      current.raw.push(row);
    }
  }

  return [...byStudentDate.values()];
}

async function syncAttendance({
  schoolPeriodId,
  dryRun = false,
  query,
  replaceLocalAcademic = false,
  skipFoundationSync = false
} = {}) {
  if (!dreamclassClient.isConfigured()) {
    return {
      ok: true,
      configured: false,
      skipped: true,
      reason: "DreamClass not configured"
    };
  }

  await ensureAttendanceSyncColumns();

  if (!skipFoundationSync) {
    await syncTermsAndPhases({ dryRun, replaceLocalAcademic });
    await syncStudents({ dryRun, query }).catch(() => null);
  }

  const [periodsResp, statusesResp] = await Promise.all([
    dreamclassClient.fetchSchoolPeriods(),
    dreamclassClient.fetchAttendanceStatuses().catch(() => ({ records: [] }))
  ]);
  const availableStatuses = (
    Array.isArray(statusesResp.raw)
      ? statusesResp.raw
      : (Array.isArray(statusesResp.records) ? statusesResp.records : [])
  )
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean);
  const statusesQuery = availableStatuses.length
    ? availableStatuses.join(",")
    : "PRESENT,TARDY,UNEXCUSED,EXCUSED,EXPELLED";
  const parsed = (periodsResp.records || []).map((r) => normalizeSchoolPeriodRecord(r));
  let validPeriods = parsed.filter((r) => r.ok);
  const currentYear = pickLatestDreamClassYear(validPeriods);
  if (currentYear) {
    validPeriods = validPeriods.filter((r) => {
      const y = extractRecordYear(r.raw);
      return y == null || y === currentYear;
    });
  }
  if (schoolPeriodId) {
    validPeriods = validPeriods.filter((r) => String(r.externalId || "") === String(schoolPeriodId));
  }

  const summary = {
    ok: true,
    configured: true,
    source: SOURCE,
    endpoint: periodsResp.endpoint,
    fetchedPeriods: validPeriods.length,
    currentYear,
    fetchedRecords: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    syncedPeriods: [],
    attendanceStatuses: Array.isArray(statusesResp.records) ? statusesResp.records : [],
    skippedReasons: {},
    samples: {
      skipped: [],
      errors: []
    }
  };

  const localStudents = await loadStudentMaps();
  const localSchoolPeriods = (
    await db.query(
      `SELECT id, name, start_date, end_date, external_id
       FROM school_periods
       WHERE external_source = $1
       ORDER BY created_at ASC`,
      [SOURCE]
    )
  ).rows;
  const schoolPeriodByExternal = new Map(
    localSchoolPeriods.filter((row) => row.external_id).map((row) => [String(row.external_id), row])
  );

  for (const period of validPeriods) {
    const localSchoolPeriod = schoolPeriodByExternal.get(String(period.externalId || "")) || null;
    const fromDate = period.startDate || null;
    const toDate = period.endDate || null;
    if (!period.externalId || !fromDate || !toDate) {
      summary.skipped += 1;
      summary.skippedReasons.invalid_period_window = (summary.skippedReasons.invalid_period_window || 0) + 1;
      continue;
    }

    try {
      const periodStudentsResp = await dreamclassClient.fetchSchoolPeriodStudents({
        schoolPeriodId: period.externalId,
        query
      });
      const periodStudentLookup = buildPeriodStudentLookup(periodStudentsResp.records || []);

        const [dailyResp, lessonResp] = await Promise.all([
          dreamclassClient.fetchDailyAttendance({
            periodId: period.externalId,
            fromDate,
            toDate,
            statuses: statusesQuery,
            query
          }).catch(() => ({ records: [] })),
          dreamclassClient.fetchLessonAttendance({
            periodId: period.externalId,
            fromDate,
            toDate,
            statuses: statusesQuery,
            query
          }).catch(() => ({ records: [] }))
        ]);

      const dailyRows = normalizeDailyAttendanceRows(dailyResp.records || []);
      const lessonRows = normalizeLessonAttendanceRows(lessonResp.records || []);
      const attendanceRows = dailyRows.length ? dailyRows : lessonRows;
      const mode = dailyRows.length ? "daily" : (lessonRows.length ? "lesson" : "empty");

      if (!dryRun && localSchoolPeriod?.id) {
        await db.query(
          `DELETE FROM attendance
           WHERE external_source = $1
             AND school_period_id = $2`,
          [SOURCE, localSchoolPeriod.id]
        );
      }

      let mappedRows = 0;
      for (const row of attendanceRows) {
        summary.fetchedRecords += 1;
        const remotePeriodStudent =
          periodStudentLookup.byStudentId.get(String(row.studentId)) ||
          periodStudentLookup.byPeriodStudentId.get(String(row.studentId)) ||
          null;
        const localStudent = resolveLocalStudentForAttendance(localStudents, remotePeriodStudent);
        if (!localStudent || localStudent.status !== "active") {
          summary.skipped += 1;
          summary.skippedReasons.unmapped_attendance_student = (summary.skippedReasons.unmapped_attendance_student || 0) + 1;
          continue;
        }

        mappedRows += 1;
        if (dryRun) {
          summary.created += 1;
          continue;
        }

        const existing = (
          await db.query(
            `SELECT id
             FROM attendance
             WHERE student_id = $1
               AND attendance_date = $2
             LIMIT 1`,
            [localStudent.id, row.date]
          )
        ).rows[0] || null;

        if (existing) {
          await db.query(
            `UPDATE attendance
             SET status = $1,
                 school_period_id = $2,
                 external_source = $3,
                 external_id = $4,
                 raw = $5,
                 last_synced_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [
              row.status,
              localSchoolPeriod?.id || null,
              SOURCE,
              `${period.externalId}:${row.externalId}`,
              JSON.stringify(row.raw || null),
              existing.id
            ]
          );
          summary.updated += 1;
        } else {
          await db.query(
            `INSERT INTO attendance (
               student_id, attendance_date, status, school_period_id, external_source, external_id, raw, last_synced_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
            [
              localStudent.id,
              row.date,
              row.status,
              localSchoolPeriod?.id || null,
              SOURCE,
              `${period.externalId}:${row.externalId}`,
              JSON.stringify(row.raw || null)
            ]
          );
          summary.created += 1;
        }
      }

      summary.syncedPeriods.push({
        schoolPeriodId: period.externalId,
        schoolPeriodName: period.name,
        mode,
        rowsFetched: attendanceRows.length,
        rowsMapped: mappedRows,
        fromDate,
        toDate
      });
    } catch (error) {
      summary.errors += 1;
      if (summary.samples.errors.length < 8) {
        summary.samples.errors.push({
          message: error.message,
          schoolPeriodId: period.externalId,
          schoolPeriodName: period.name
        });
      }
    }
  }

  return summary;
}

async function syncStudents({ dryRun = false, query } = {}) {
  if (!dreamclassClient.isConfigured()) {
    return {
      ok: true,
      configured: false,
      skipped: true,
      reason: "DreamClass not configured"
    };
  }

  const fetched = await dreamclassClient.fetchStudents({ query });
  const remoteRecords = Array.isArray(fetched.records) ? fetched.records : [];
  const local = await loadStudentMaps();

  const summary = {
    ok: true,
    configured: true,
    source: SOURCE,
    endpoint: fetched.endpoint,
    fetched: remoteRecords.length,
    created: 0,
    updated: 0,
    active: 0,
    deactivated: 0,
    inactive: 0,
    dropped_out: 0,
    archived: 0,
    deleted: 0,
    skipped: 0,
    errors: 0,
    skippedReasons: {},
    samples: {
      skipped: [],
      errors: []
    }
  };
  const seenLocalIds = new Set();

  for (const raw of remoteRecords) {
    const mapped = normalizeStudentRecord(raw);
    if (!mapped.ok) {
      summary.skipped += 1;
      summary.skippedReasons[mapped.reason] = (summary.skippedReasons[mapped.reason] || 0) + 1;
      if (summary.samples.skipped.length < 5) {
        summary.samples.skipped.push({ reason: mapped.reason, raw });
      }
      continue;
    }

    let existing = null;
    if (mapped.externalId && local.byExternal.has(mapped.externalId)) {
      existing = local.byExternal.get(mapped.externalId);
    } else if (mapped.email && local.byEmail.has(mapped.email.toLowerCase())) {
      existing = local.byEmail.get(mapped.email.toLowerCase());
    } else {
      const nameKey = `${norm(mapped.firstName)}|${norm(mapped.lastName)}`;
      existing = local.byName.get(nameKey) || null;
    }

    try {
      summary[mapped.status] = Number(summary[mapped.status] || 0) + 1;
      if (existing) {
        seenLocalIds.add(String(existing.id));
        const nextExternalId = mapped.externalId || existing.external_id || null;
        if (!dryRun) {
          await db.query(
            `UPDATE students
             SET first_name=$1,
                 last_name=$2,
                 email=$3,
                 status=$4,
                 external_source=$5,
                 external_id=$6,
                 last_synced_at=CURRENT_TIMESTAMP
             WHERE id=$7`,
            [
              mapped.firstName,
              mapped.lastName,
              mapped.email,
              mapped.status,
              nextExternalId ? SOURCE : (existing.external_source || null),
              nextExternalId,
              existing.id
            ]
          );
        }
        summary.updated += 1;
      } else {
        if (!dryRun) {
          await db.query(
            `INSERT INTO students (
               first_name, last_name, email, team_id, status, external_source, external_id, last_synced_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
            [
              mapped.firstName,
              mapped.lastName,
              mapped.email,
              null,
              mapped.status,
              SOURCE,
              mapped.externalId
            ]
          );
        }
        summary.created += 1;
      }
    } catch (error) {
      summary.errors += 1;
      if (summary.samples.errors.length < 5) {
        summary.samples.errors.push({
          message: error.message,
          student: `${mapped.firstName} ${mapped.lastName}`,
          externalId: mapped.externalId || null
        });
      }
    }
  }

  const missingRemote = local.rows.filter(
    (row) => row.external_source === SOURCE && !seenLocalIds.has(String(row.id))
  );
  for (const row of missingRemote) {
    if (!dryRun) {
      await db.query(
        `UPDATE students
         SET status='deleted',
             last_synced_at=CURRENT_TIMESTAMP
         WHERE id=$1`,
        [row.id]
      );
    }
  }
  if (missingRemote.length) {
    summary.deleted += missingRemote.length;
  }

  return summary;
}

async function loadTopicsForPhase(phaseId) {
  const rows = (
    await db.query(
      `SELECT id, phase_id, stream, title, external_source, external_id
       FROM topics
       WHERE phase_id=$1
       ORDER BY created_at ASC`,
      [phaseId]
    )
  ).rows;

  const byExternal = new Map();
  const byStreamTitle = new Map();

  for (const row of rows) {
    if (row.external_source === SOURCE && row.external_id) {
      byExternal.set(String(row.external_id), row);
    }
    byStreamTitle.set(`${row.stream}|${norm(row.title)}`, row);
  }

  return { rows, byExternal, byStreamTitle };
}

async function ensureTopic({ phaseId, stream, topicTitle, topicExternalId, createMissingTopics, topicsCache }) {
  if (topicExternalId && topicsCache.byExternal.has(topicExternalId)) {
    const existing = topicsCache.byExternal.get(topicExternalId);
    const nextTitle = topicTitle ? normalizeTopicTitle(topicTitle) : existing.title;
    const needsUpdate = (
      (stream && existing.stream !== stream) ||
      (nextTitle && existing.title !== nextTitle) ||
      existing.external_source !== SOURCE
    );
    if (needsUpdate) {
      await db.query(
        `UPDATE topics
         SET stream=$1, title=$2, external_source=$3, external_id=$4
         WHERE id=$5`,
        [stream || existing.stream, nextTitle || existing.title, SOURCE, topicExternalId, existing.id]
      );
      existing.stream = stream || existing.stream;
      existing.title = nextTitle || existing.title;
      existing.external_source = SOURCE;
      existing.external_id = topicExternalId;
      topicsCache.byStreamTitle.set(`${existing.stream}|${norm(existing.title)}`, existing);
    }
    return { topic: existing, created: false };
  }

  const titleKey = topicTitle ? `${stream}|${norm(topicTitle)}` : null;
  if (titleKey && topicsCache.byStreamTitle.has(titleKey)) {
    const existing = topicsCache.byStreamTitle.get(titleKey);
    if (topicExternalId && (!existing.external_id || existing.external_source !== SOURCE)) {
      await db.query(
        `UPDATE topics
         SET external_source=$1, external_id=$2
         WHERE id=$3`,
        [SOURCE, topicExternalId, existing.id]
      );
      existing.external_source = SOURCE;
      existing.external_id = topicExternalId;
    }
    return { topic: existing, created: false };
  }

  if (!createMissingTopics || !topicTitle) return { topic: null, created: false };

  await db.query(
    `INSERT INTO topics (phase_id, stream, title, week_number, external_source, external_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [phaseId, stream, normalizeTopicTitle(topicTitle), null, SOURCE, topicExternalId || null]
  );

  const inserted = (
    await db.query(
      `SELECT id, phase_id, stream, title, external_source, external_id
       FROM topics
       WHERE phase_id=$1 AND stream=$2 AND title=$3
       ORDER BY created_at DESC
       LIMIT 1`,
      [phaseId, stream, normalizeTopicTitle(topicTitle)]
    )
  ).rows[0];

  if (inserted) {
    if (inserted.external_source === SOURCE && inserted.external_id) {
      topicsCache.byExternal.set(String(inserted.external_id), inserted);
    } else if (topicExternalId) {
      topicsCache.byExternal.set(String(topicExternalId), inserted);
    }
    topicsCache.byStreamTitle.set(`${inserted.stream}|${norm(inserted.title)}`, inserted);
    topicsCache.rows.push(inserted);
  }

  return { topic: inserted || null, created: Boolean(inserted) };
}

async function syncCourses() {
  const fetched = await dreamclassClient.fetchCourses();
  const summary = { fetched: (fetched.records || []).length, created: 0, updated: 0 };
  for (const course of fetched.records || []) {
    const externalId = String(pick(course, ["id", "courseId"]) || "").trim();
    const name = String(pick(course, ["name", "title"]) || "").trim();
    if (!externalId || !name) continue;
    const code = String(pick(course, ["code", "shortCode"]) || "").trim() || null;
    const stream = inferStreamFromCourse(course) || "webdev";
    const existing = (
      await db.query(`SELECT id FROM courses WHERE external_source=$1 AND external_id=$2 LIMIT 1`, [SOURCE, externalId])
    ).rows[0];
    if (existing) {
      await db.query(
        `UPDATE courses
         SET name=$1, code=$2, stream=$3, is_active=TRUE, last_synced_at=CURRENT_TIMESTAMP
         WHERE id=$4`,
        [name, code, stream, existing.id]
      );
      summary.updated += 1;
    } else {
      await db.query(
        `INSERT INTO courses (name, code, stream, is_active, external_source, external_id, last_synced_at)
         VALUES ($1,$2,$3,TRUE,$4,$5,CURRENT_TIMESTAMP)`,
        [name, code, stream, SOURCE, externalId]
      );
      summary.created += 1;
    }
  }
  return summary;
}

async function syncGradeMappings() {
  const fetched = await dreamclassClient.fetchGradeMapping();
  const summary = { fetched: (fetched.records || []).length, created: 0, updated: 0 };
  for (const mapping of fetched.records || []) {
    const externalId = String(pick(mapping, ["id", "gradeMappingId"]) || "").trim();
    const name = String(pick(mapping, ["name", "title"]) || "").trim();
    if (!externalId || !name) continue;
    const existing = (
      await db.query(`SELECT id FROM grade_mappings WHERE external_source=$1 AND external_id=$2 LIMIT 1`, [SOURCE, externalId])
    ).rows[0];
    if (existing) {
      await db.query(
        `UPDATE grade_mappings
         SET name=$1, raw=$2, last_synced_at=CURRENT_TIMESTAMP
         WHERE id=$3`,
        [name, JSON.stringify(mapping), existing.id]
      );
      summary.updated += 1;
    } else {
      await db.query(
        `INSERT INTO grade_mappings (name, raw, external_source, external_id, last_synced_at)
         VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)`,
        [name, JSON.stringify(mapping), SOURCE, externalId]
      );
      summary.created += 1;
    }
  }
  return summary;
}

async function ensureGradebookDefinition({ classCourse, context, column, dryRun }) {
  const courseExternalId = String(classCourse.courseId || "").trim() || null;
  let courseId = null;
  if (courseExternalId) {
    courseId = (
      await db.query(`SELECT id FROM courses WHERE external_source=$1 AND external_id=$2 LIMIT 1`, [SOURCE, courseExternalId])
    ).rows[0]?.id || null;
  }

  const mappingExternalId = String(pick(column, ["gradeMappingId", "grade_mapping_id"]) || "").trim() || null;
  let mappingId = null;
  if (mappingExternalId) {
    mappingId = (
      await db.query(`SELECT id FROM grade_mappings WHERE external_source=$1 AND external_id=$2 LIMIT 1`, [SOURCE, mappingExternalId])
    ).rows[0]?.id || null;
  }

  const externalId = `${classCourse.classCourseId}:${pick(column, ["id", "gradeId", "grade_id"])}`;
  const name = normalizeTopicTitle(pick(column, ["name", "title"])) || "Gradebook";
  const parentExternalGradeId = pick(column, ["parentSimpleGradeId", "parent_grade_id"]);
  const parentExternalId = parentExternalGradeId ? `${classCourse.classCourseId}:${parentExternalGradeId}` : null;
  const existing = (
    await db.query(`SELECT id FROM gradebooks WHERE external_source=$1 AND external_id=$2 LIMIT 1`, [SOURCE, externalId])
  ).rows[0];

  if (dryRun) {
    return { id: existing?.id || `dry-gradebook-${externalId}`, externalId };
  }

  let parentId = null;
  if (parentExternalId) {
    parentId = (
      await db.query(`SELECT id FROM gradebooks WHERE external_source=$1 AND external_id=$2 LIMIT 1`, [SOURCE, parentExternalId])
    ).rows[0]?.id || null;
  }

  if (existing) {
    await db.query(
      `UPDATE gradebooks
       SET course_id=$1, term_id=$2, phase_id=$3, school_period_id=$4, class_course_external_id=$5, name=$6, stream=$7,
           grade_mapping_id=$8, parent_gradebook_id=$9, grade_type=$10, position=$11, is_active=TRUE, last_synced_at=CURRENT_TIMESTAMP
       WHERE id=$12`,
      [
        courseId,
        context.termId || null,
        context.phaseId || null,
        classCourse.schoolPeriodLocalId || null,
        String(classCourse.classCourseId),
        name,
        classCourse.stream || context.stream || "webdev",
        mappingId,
        parentId,
        Number(column.type || 0) || null,
        Number(column.position || 0) || null,
        existing.id
      ]
    );
    return { id: existing.id, externalId };
  }

  const inserted = (
    await db.query(
      `INSERT INTO gradebooks (
         course_id, term_id, phase_id, school_period_id, class_course_external_id, name, stream, grade_mapping_id,
         parent_gradebook_id, external_source, external_id, grade_type, position, is_active, is_visible, last_synced_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,TRUE,CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        courseId,
        context.termId || null,
        context.phaseId || null,
        classCourse.schoolPeriodLocalId || null,
        String(classCourse.classCourseId),
        name,
        classCourse.stream || context.stream || "webdev",
        mappingId,
        parentId,
        SOURCE,
        externalId,
        Number(column.type || 0) || null,
        Number(column.position || 0) || null
      ]
    )
  ).rows[0];
  return { id: inserted?.id || null, externalId };
}

async function syncGradebookTopicsForClassCourse({
  classCourse,
  schemaResponse,
  context,
  topicsCache,
  allowCreate,
  dryRun,
  summary
}) {
  const schemaColumns = Array.isArray(schemaResponse?.raw?.grades)
    ? schemaResponse.raw.grades
    : (Array.isArray(schemaResponse?.records) ? schemaResponse.records : []);
  const allowedGradeIds = buildSelectedTermColumnSet(schemaColumns, context.phase?.name || context.phaseName);

  const mappingByGradeId = new Map();
  const rowStream = (classCourse.stream || context.stream || "webdev").toString();

  for (const col of schemaColumns) {
    summary.schemaColumnsFetched = (summary.schemaColumnsFetched || 0) + 1;

    const gradeColumnId = pick(col, ["id", "gradeId", "grade_id"]);
    const title = normalizeTopicTitle(pick(col, ["name", "title"])) || null;
    if (!gradeColumnId || !title) {
      summary.skipped += 1;
      summary.skippedReasons.missing_gradebook_column_fields =
        (summary.skippedReasons.missing_gradebook_column_fields || 0) + 1;
      continue;
    }

    if (!shouldSyncGradebookColumn(col)) {
      summary.skipped += 1;
      summary.skippedReasons.unsupported_gradebook_column_type =
        (summary.skippedReasons.unsupported_gradebook_column_type || 0) + 1;
      continue;
    }
    if (allowedGradeIds && !allowedGradeIds.has(String(gradeColumnId))) {
      summary.skipped += 1;
      summary.skippedReasons.not_selected_term_gradebook_column =
        (summary.skippedReasons.not_selected_term_gradebook_column || 0) + 1;
      continue;
    }

    const topicExternalId = topicExternalIdFromGradeColumn(classCourse.classCourseId, gradeColumnId);
    try {
      const gradebookDef = await ensureGradebookDefinition({
        classCourse,
        context,
        column: col,
        dryRun
      });
      const topicResult = await ensureTopic({
        phaseId: context.phaseId,
        stream: rowStream,
        topicTitle: title,
        topicExternalId,
        createMissingTopics: allowCreate && !dryRun,
        topicsCache
      });

      if (topicResult.created) summary.topicsCreated += 1;
      if (topicResult.topic || gradebookDef?.id) {
        mappingByGradeId.set(String(gradeColumnId), {
          topic: topicResult.topic || null,
          gradebookId: gradebookDef?.id || null,
          gradebookExternalId: gradebookDef?.externalId || null,
          stream: rowStream,
          title
        });
      } else {
        summary.skipped += 1;
        summary.skippedReasons.missing_local_topic = (summary.skippedReasons.missing_local_topic || 0) + 1;
      }
    } catch (error) {
      summary.errors += 1;
      if (summary.samples.errors.length < 8) {
        summary.samples.errors.push({
          message: error.message,
          classCourseId: classCourse.classCourseId,
          column: title
        });
      }
    }
  }

  return mappingByGradeId;
}

async function syncGradebookValuesForClassCourse({
  classCourse,
  students,
  gradebookColumnMap,
  context,
  remoteStudentLookup,
  schoolPeriodId,
  dryRun,
  query,
  summary
}) {
  if (!gradebookColumnMap.size) return;

  const candidates = students.rows.filter(
    (s) => s.external_source === SOURCE && s.external_id
  );
  if (!candidates.length) {
    summary.skippedReasons.no_synced_students = (summary.skippedReasons.no_synced_students || 0) + 1;
    return;
  }

  let valueCallsAttempted = 0;
  let unsupportedPayloadDetected = false;

  for (const localStudent of candidates) {
    let valuesResp;
    const remoteStudent = (() => {
      const email = String(localStudent.email || "").trim().toLowerCase();
      if (email && remoteStudentLookup?.byEmail?.has(email)) return remoteStudentLookup.byEmail.get(email);
      const key = `${norm(localStudent.first_name)}|${norm(localStudent.last_name)}`;
      return remoteStudentLookup?.byName?.get(key) || null;
    })();
    const periodStudentCandidates = candidatePeriodStudentIdsForLocalStudent(localStudent, remoteStudent, schoolPeriodId);
    const debugEntry = {
      classCourseId: classCourse.classCourseId,
      studentId: localStudent.id,
      studentName: `${localStudent.first_name || ""} ${localStudent.last_name || ""}`.trim(),
      externalId: localStudent.external_id || null,
      candidateIds: periodStudentCandidates.slice(0, 6),
      result: "unknown",
      valuesCount: 0,
      mappedCount: 0
    };
    let cells = [];
    let lastRequestError = null;
    let sawUnparsedPayload = null;
    let sawEmpty = false;
    let usedCandidateId = null;
    for (const candidateId of periodStudentCandidates) {
      try {
        valueCallsAttempted += 1;
        valuesResp = await dreamclassClient.fetchGradebookValues({
          classCourseId: classCourse.classCourseId,
          periodStudentId: candidateId,
          query
        });
      } catch (error) {
        lastRequestError = error;
        continue;
      }

      cells = parseGradebookValueCells(valuesResp.raw);
      if (cells.length) {
        usedCandidateId = String(candidateId);
        break;
      }
      if (isEmptyGradebookValuesPayload(valuesResp.raw)) {
        sawEmpty = true;
        continue;
      }
      sawUnparsedPayload = valuesResp.raw;
    }

    if (!cells.length) {
      if (lastRequestError && !sawEmpty && !sawUnparsedPayload) {
        summary.skipped += 1;
        summary.skippedReasons.gradebook_values_request_failed =
          (summary.skippedReasons.gradebook_values_request_failed || 0) + 1;
        if (summary.samples.skipped.length < 8) {
          summary.samples.skipped.push({
            reason: "gradebook_values_request_failed",
            classCourseId: classCourse.classCourseId,
            studentExternalId: localStudent.external_id,
            message: lastRequestError.message
          });
        }
        debugEntry.result = "request_failed";
        debugEntry.error = lastRequestError.message;
      } else if (sawUnparsedPayload) {
        summary.skipped += 1;
        summary.skippedReasons.unparsed_gradebook_values_payload =
          (summary.skippedReasons.unparsed_gradebook_values_payload || 0) + 1;
        if (!unsupportedPayloadDetected && summary.samples.skipped.length < 8) {
          summary.samples.skipped.push({
            reason: "unparsed_gradebook_values_payload",
            classCourseId: classCourse.classCourseId,
            sampleKeys: sawUnparsedPayload && typeof sawUnparsedPayload === "object" ? Object.keys(sawUnparsedPayload).slice(0, 12) : []
          });
        }
        unsupportedPayloadDetected = true;
        debugEntry.result = "unparsed_payload";
        debugEntry.sampleKeys = sawUnparsedPayload && typeof sawUnparsedPayload === "object"
          ? Object.keys(sawUnparsedPayload).slice(0, 12)
          : [];
      } else {
        summary.skipped += 1;
        summary.skippedReasons.no_gradebook_values_for_student =
          (summary.skippedReasons.no_gradebook_values_for_student || 0) + 1;
        debugEntry.result = "empty_values";
      }
      if ((summary.studentValueDiagnostics || []).length < 120) {
        summary.studentValueDiagnostics.push(debugEntry);
      }
      continue;
    }

    debugEntry.valuesCount = cells.length;
    debugEntry.usedCandidateId = usedCandidateId;
    let mappedCount = 0;
    for (const cell of cells) {
      summary.fetched += 1;
      const mappedColumn = gradebookColumnMap.get(String(cell.gradeId));
      if (!mappedColumn) continue;
      mappedCount += 1;

      try {
        let anySaved = false;

        if (mappedColumn.topic?.id) {
          const existing = (
            await db.query(
              `SELECT id FROM grades WHERE student_id=$1 AND topic_id=$2 LIMIT 1`,
              [localStudent.id, mappedColumn.topic.id]
            )
          ).rows[0];

          if (existing) {
            if (!dryRun) {
              await db.query(
                `UPDATE grades
                 SET score=$1,
                     external_source=$2,
                     external_id=$3,
                     last_synced_at=CURRENT_TIMESTAMP
                 WHERE id=$4`,
                [cell.score, SOURCE, cell.externalId, existing.id]
              );
            }
            summary.updated += 1;
          } else {
            if (!dryRun) {
              await db.query(
                `INSERT INTO grades (student_id, topic_id, score, external_source, external_id, last_synced_at)
                 VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,
                [localStudent.id, mappedColumn.topic.id, cell.score, SOURCE, cell.externalId]
              );
            }
            summary.created += 1;
          }
          anySaved = true;
        }

        if (mappedColumn.gradebookId && context.termId) {
          const valueExternalId = String(
            cell.externalId || `${classCourse.classCourseId}:${localStudent.id}:${cell.gradeId}:${context.termId}`
          );
          const existingValue = (
            await db.query(
              `SELECT id
               FROM gradebook_values
               WHERE student_id=$1 AND term_id=$2 AND gradebook_id=$3
               LIMIT 1`,
              [localStudent.id, context.termId, mappedColumn.gradebookId]
            )
          ).rows[0];

          if (existingValue) {
            if (!dryRun) {
              await db.query(
                `UPDATE gradebook_values
                 SET phase_id=$1,
                     school_period_id=$2,
                     value=$3,
                     raw=$4,
                     external_source=$5,
                     external_id=$6,
                     last_synced_at=CURRENT_TIMESTAMP
                 WHERE id=$7`,
                [
                  context.phaseId || null,
                  classCourse.schoolPeriodLocalId || null,
                  cell.score,
                  JSON.stringify(cell.raw || null),
                  SOURCE,
                  valueExternalId,
                  existingValue.id
                ]
              );
            }
          } else if (!dryRun) {
            await db.query(
              `INSERT INTO gradebook_values (
                 student_id, term_id, phase_id, school_period_id, gradebook_id, value, raw,
                 external_source, external_id, last_synced_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)`,
              [
                localStudent.id,
                context.termId,
                context.phaseId || null,
                classCourse.schoolPeriodLocalId || null,
                mappedColumn.gradebookId,
                cell.score,
                JSON.stringify(cell.raw || null),
                SOURCE,
                valueExternalId
              ]
            );
          }
          anySaved = true;
        }
        if (!anySaved) mappedCount -= 1;
      } catch (error) {
        summary.errors += 1;
        if (summary.samples.errors.length < 8) {
          summary.samples.errors.push({
            message: error.message,
            classCourseId: classCourse.classCourseId,
            studentExternalId: localStudent.external_id,
            gradeId: cell.gradeId,
            score: cell.score
          });
        }
        mappedCount -= 1;
      }
    }

    debugEntry.mappedCount = mappedCount;
    if (mappedCount > 0) {
      summary.studentsWithMarks = (summary.studentsWithMarks || 0) + 1;
      debugEntry.result = "values_saved";
    } else {
      summary.skipped += 1;
      summary.skippedReasons.values_found_but_no_topic_mapping =
        (summary.skippedReasons.values_found_but_no_topic_mapping || 0) + 1;
      debugEntry.result = "values_no_topic_mapping";
    }
    if ((summary.studentValueDiagnostics || []).length < 120) {
      summary.studentValueDiagnostics.push(debugEntry);
    }
  }

  summary.gradebookValuesRequests = (summary.gradebookValuesRequests || 0) + valueCallsAttempted;
  summary.studentsAttemptedForValues = (summary.studentsAttemptedForValues || 0) + candidates.length;
}

async function syncGrades({
  termId,
  phaseId,
  stream,
  classCourseId,
  schoolPeriodId,
  replaceLocalAcademic = false,
  createMissingTopics = false,
  dryRun = false,
  query,
  skipFoundationSync = false,
  foundationSummary = null
} = {}) {
  if (!dreamclassClient.isConfigured()) {
    return {
      ok: true,
      configured: false,
      skipped: true,
      reason: "DreamClass not configured"
    };
  }

  await ensureGradebookPhaseColumns();

  // Ensure local academic structure exists when DreamClass is the source of truth.
  if (!skipFoundationSync) {
    await syncTermsAndPhases({ dryRun, replaceLocalAcademic });
  }
  const studentsSync = foundationSummary?.studentsSync || await syncStudents({ dryRun, query }).catch(() => null);
  const coursesSync = foundationSummary?.coursesSync || await syncCourses().catch(() => null);
  const gradeMappingsSync = foundationSummary?.gradeMappingsSync || await syncGradeMappings().catch(() => null);

  const context = await resolveSyncContext({ phaseId, termId, stream });
  if (!context.phaseId) {
    const err = new Error("Cannot sync grades: no local phase found. Create/select a phase first.");
    err.statusCode = 400;
    throw err;
  }

  await purgeDreamClassPhaseGradeData(context.phaseId, { dryRun });

  const students = await loadStudentMaps();
  const remoteStudentsResp = await dreamclassClient.fetchStudents().catch(() => ({ records: [] }));
  const remoteStudentLookup = buildRemoteStudentLookup(remoteStudentsResp.records || []);
  const topicsCache = await loadTopicsForPhase(context.phaseId);
  const classCourseSelection = await resolveDreamClassClassCoursesForSync({
    context,
    stream,
    schoolPeriodId,
    classCourseId
  });

  const classCourses = Array.isArray(classCourseSelection.entries) ? classCourseSelection.entries : [];
  if (!classCourses.length) {
    const err = new Error("No DreamClass class courses found for grade sync.");
    err.statusCode = 400;
    throw err;
  }

  const summary = {
    ok: true,
    configured: true,
    source: SOURCE,
    endpoint: dreamclassClient.getConfig().gradesPath,
    phaseId: context.phaseId,
    phaseName: context.phase?.name || null,
    defaultStream: context.stream,
    schoolPeriodId: classCourseSelection.schoolPeriodId || null,
    schoolPeriodName: classCourseSelection.schoolPeriodName || null,
    classCourseIds: classCourses.map((c) => c.classCourseId),
    studentsSync,
    coursesSync,
    gradeMappingsSync,
    fetched: 0,
    schemaColumnsFetched: 0,
    created: 0,
    updated: 0,
    topicsCreated: 0,
    gradebookValuesRequests: 0,
    studentsAttemptedForValues: 0,
    studentsWithMarks: 0,
    skipped: 0,
    errors: 0,
    skippedReasons: {},
    studentValueDiagnostics: [],
    samples: {
      skipped: [],
      errors: []
    }
  };

  for (const classCourse of classCourses) {
    let schemaResp;
    try {
      schemaResp = await dreamclassClient.fetchGrades({
        classCourseId: classCourse.classCourseId,
        query
      });
    } catch (error) {
      summary.errors += 1;
      if (summary.samples.errors.length < 8) {
        summary.samples.errors.push({
          message: error.message,
          classCourseId: classCourse.classCourseId,
          kind: "gradebook_schema"
        });
      }
      continue;
    }

    const gradebookColumnMap = await syncGradebookTopicsForClassCourse({
      classCourse,
      schemaResponse: schemaResp,
      context,
      topicsCache,
      allowCreate: createMissingTopics !== false,
      dryRun,
      summary
    });

    await syncGradebookValuesForClassCourse({
      classCourse,
      students,
      gradebookColumnMap,
      context,
      remoteStudentLookup,
      schoolPeriodId: classCourseSelection.schoolPeriodId || null,
      dryRun,
      query,
      summary
    });
  }

  return summary;
}

async function syncAll({
  termId,
  phaseId,
  stream,
  classCourseId,
  schoolPeriodId,
  replaceLocalAcademic = false,
  createMissingTopics = false,
  dryRun = false,
  query
} = {}) {
  if (!dreamclassClient.isConfigured()) {
    return {
      ok: true,
      configured: false,
      skipped: true,
      reason: "DreamClass not configured"
    };
  }

  const termsPhases = await syncTermsAndPhases({ dryRun, replaceLocalAcademic });
  const students = await syncStudents({ dryRun, query });
  const coursesSync = await syncCourses().catch(() => null);
  const gradeMappingsSync = await syncGradeMappings().catch(() => null);
  const attendance = await syncAttendance({
    schoolPeriodId,
    dryRun,
    query,
    replaceLocalAcademic: false,
    skipFoundationSync: true
  }).catch(() => null);

  let phaseRows = [];
  if (phaseId) {
    phaseRows = (
      await db.query(
        `SELECT id, term_id, name, phase_order
         FROM phases
         WHERE id = $1
         LIMIT 1`,
        [phaseId]
      )
    ).rows;
  } else if (termId) {
    phaseRows = (
      await db.query(
        `SELECT id, term_id, name, phase_order
         FROM phases
         WHERE term_id = $1
         ORDER BY phase_order ASC, created_at ASC`,
        [termId]
      )
    ).rows;
  } else {
    phaseRows = (
      await db.query(
        `SELECT
           p.id,
           p.term_id,
           p.name,
           p.phase_order,
           t.start_date AS term_start_date
         FROM phases p
         LEFT JOIN terms t ON t.id = p.term_id
         ORDER BY t.start_date ASC NULLS LAST, p.phase_order ASC, p.created_at ASC`
      )
    ).rows;
  }

  const gradeRuns = [];
  for (const row of phaseRows) {
    try {
      const result = await syncGrades({
        termId: row.term_id || termId || null,
        phaseId: row.id,
        stream,
        classCourseId,
        schoolPeriodId,
        replaceLocalAcademic: false,
        createMissingTopics,
        dryRun,
        query,
        skipFoundationSync: true,
        foundationSummary: {
          studentsSync: students,
          coursesSync,
          gradeMappingsSync
        }
      });
      gradeRuns.push(result);
    } catch (error) {
      gradeRuns.push({
        ok: false,
        skipped: true,
        phaseId: row.id,
        phaseName: row.name,
        message: error.message || "Grades sync failed",
        code: error.code || null,
        statusCode: error.statusCode || 500
      });
    }
  }

  let grades = summarizeGradeRuns(gradeRuns);
  if (!phaseRows.length) {
    grades = {
      ok: false,
      skipped: true,
      message: "No terms available for grade sync.",
      code: "NO_TERMS_FOR_GRADE_SYNC",
      statusCode: 400
    };
  }

  return {
    ok: true,
    partial: Boolean(grades && grades.ok === false),
    configured: true,
    source: SOURCE,
    termsPhases,
    students,
    courses: coursesSync,
    gradeMappings: gradeMappingsSync,
    attendance,
    grades
  };
}

function integrationStatus() {
  const cfg = dreamclassClient.getConfig();
  return {
    provider: "DreamClass",
    configured: dreamclassClient.isConfigured(),
    baseUrl: cfg.baseUrl || null,
    tenant: cfg.tenant || null,
    schoolCode: cfg.schoolCode || null,
    studentsPath: cfg.studentsPathTemplate,
    gradesPath: cfg.gradesPath,
    gradebookValuesPath: cfg.gradebookValuesPath,
    gradeMappingPath: cfg.gradeMappingPath,
    coursesPath: cfg.coursesPath,
    schoolPeriodsPath: cfg.schoolPeriodsPath,
    levelsPath: cfg.levelsPath,
    schoolPeriodClassesPathTemplate: cfg.schoolPeriodClassesPathTemplate,
    schoolPeriodClassCoursesPathTemplate: cfg.schoolPeriodClassCoursesPathTemplate,
    schoolPeriodStudentsPathTemplate: cfg.schoolPeriodStudentsPathTemplate,
    attendanceStatusesPath: cfg.attendanceStatusesPath,
    attendanceDailyPath: cfg.attendanceDailyPath,
    attendanceLessonPath: cfg.attendanceLessonPath,
    studentsNameOrEmail: cfg.studentsNameOrEmail || null,
    classCourseId: cfg.classCourseId || null,
    authType: cfg.authType || null,
    authHeader: cfg.authHeader,
    hasToken: Boolean(cfg.token || cfg.apiKey)
  };
}

module.exports = {
  ensureGradebookPhaseColumns,
  resolveSyncContext,
  syncTermsAndPhases,
  syncStudents,
  ensureAttendanceSyncColumns,
  syncAttendance,
  syncGrades,
  syncAll,
  integrationStatus,
  ping: dreamclassClient.ping
};
