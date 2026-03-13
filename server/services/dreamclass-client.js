const DEFAULT_TIMEOUT_MS = Number(process.env.DREAMCLASS_TIMEOUT_MS || 15000);

function parseJsonEnv(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function trimSlashes(value = "") {
  return String(value).replace(/^\/+|\/+$/g, "");
}

function joinUrl(base, path) {
  if (!base && /^https?:\/\//i.test(path || "")) return path;
  const cleanBase = String(base || "").replace(/\/+$/g, "");
  const cleanPath = String(path || "").replace(/^\/+/g, "");
  return `${cleanBase}/${cleanPath}`;
}

function extractCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidates = [
    payload.items,
    payload.results,
    payload.data,
    payload.values,
    payload.courses,
    payload.classes,
    payload.classCourses,
    payload.classcourses,
    payload.gradeMappings,
    payload.grade_mappings,
    payload.mappings,
    payload.levels,
    payload.schoolPeriods,
    payload.schoolperiods,
    payload.students,
    payload.grades,
    payload.records,
    payload.rows,
    payload.response?.items,
    payload.response?.data,
    payload.data?.courses,
    payload.data?.classes,
    payload.data?.classCourses,
    payload.data?.classcourses,
    payload.data?.gradeMappings,
    payload.data?.grade_mappings,
    payload.data?.mappings,
    payload.data?.levels,
    payload.data?.schoolPeriods,
    payload.data?.schoolperiods,
    payload.data?.items,
    payload.data?.results,
    payload.data?.students,
    payload.data?.grades
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function getConfig() {
  const authType = (process.env.DREAMCLASS_AUTH_TYPE || process.env.DC_AUTH_TYPE || "").trim().toLowerCase();
  const baseUrl = (process.env.DREAMCLASS_BASE_URL || process.env.DC_SERVER || "").trim();
  const token = (process.env.DREAMCLASS_API_TOKEN || process.env.DREAMCLASS_TOKEN || "").trim();
  const apiKey = (process.env.DREAMCLASS_API_KEY || process.env.DC_API_KEY || "").trim();
  const authHeader = (
    process.env.DREAMCLASS_AUTH_HEADER ||
    process.env.DC_API_KEY_HEADER ||
    "Authorization"
  ).trim();
  const authPrefix = process.env.DREAMCLASS_AUTH_PREFIX ?? (authType === "api-key" ? "" : "Bearer ");
  const extraHeaders = parseJsonEnv(process.env.DREAMCLASS_EXTRA_HEADERS_JSON, {});
  const studentsPathTemplate = (
    process.env.DREAMCLASS_STUDENTS_PATH_TEMPLATE ||
    process.env.DC_STUDENTS_PATH_TEMPLATE ||
    process.env.DREAMCLASS_STUDENTS_PATH ||
    "/dreamclassapi/v1/students/records/list/{nameOrEmail}"
  ).trim();
  const gradesPath = (
    process.env.DREAMCLASS_GRADEBOOK_PATH ||
    process.env.DC_GRADEBOOK_PATH ||
    process.env.DREAMCLASS_GRADES_PATH ||
    "/dreamclassapi/v1/grading/gradebook"
  ).trim();
  const gradebookValuesPath = (
    process.env.DREAMCLASS_GRADEBOOK_VALUES_PATH ||
    process.env.DC_GRADEBOOK_VALUES_PATH ||
    "/dreamclassapi/v1/grading/gradebook/values"
  ).trim();
  const gradeMappingPath = (
    process.env.DREAMCLASS_GRADE_MAPPING_PATH ||
    process.env.DC_GRADE_MAPPING_PATH ||
    "/dreamclassapi/v1/grading/grade-mapping"
  ).trim();
  const coursesPath = (
    process.env.DREAMCLASS_COURSES_PATH ||
    process.env.DC_COURSES_PATH ||
    "/dreamclassapi/v1/curriculum/courses/list"
  ).trim();
  const schoolPeriodsPath = (
    process.env.DREAMCLASS_SCHOOL_PERIODS_PATH ||
    process.env.DC_SCHOOL_PERIODS_PATH ||
    "/dreamclassapi/v1/curriculum/schoolperiods/list"
  ).trim();
  const levelsPath = (
    process.env.DREAMCLASS_LEVELS_PATH ||
    process.env.DC_LEVELS_PATH ||
    "/dreamclassapi/v1/curriculum/level"
  ).trim();
  const schoolPeriodClassesPathTemplate = (
    process.env.DREAMCLASS_SCHOOL_PERIOD_CLASSES_PATH_TEMPLATE ||
    process.env.DC_SCHOOL_PERIOD_CLASSES_PATH_TEMPLATE ||
    "/dreamclassapi/v1/curriculum/schoolperiod/{schoolPeriodId}/classes"
  ).trim();
  const schoolPeriodClassCoursesPathTemplate = (
    process.env.DREAMCLASS_SCHOOL_PERIOD_CLASSCOURSES_PATH_TEMPLATE ||
    process.env.DC_SCHOOL_PERIOD_CLASSCOURSES_PATH_TEMPLATE ||
    "/dreamclassapi/v1/curriculum/schoolperiod/{schoolPeriodId}/classcourses"
  ).trim();
  const schoolPeriodStudentsPathTemplate = (
    process.env.DREAMCLASS_SCHOOL_PERIOD_STUDENTS_PATH_TEMPLATE ||
    process.env.DC_SCHOOL_PERIOD_STUDENTS_PATH_TEMPLATE ||
    "/dreamclassapi/v1/students/schoolperiod/{schoolPeriodId}/list"
  ).trim();
  const schoolPeriodTermsPathTemplate = (
    process.env.DREAMCLASS_SCHOOL_PERIOD_TERMS_PATH_TEMPLATE ||
    process.env.DC_SCHOOL_PERIOD_TERMS_PATH_TEMPLATE ||
    ""
  ).trim();
  const attendanceStatusesPath = (
    process.env.DREAMCLASS_ATTENDANCE_STATUSES_PATH ||
    process.env.DC_ATTENDANCE_STATUSES_PATH ||
    "/dreamclassapi/v1/students/attendance/status/list"
  ).trim();
  const attendanceDailyPath = (
    process.env.DREAMCLASS_ATTENDANCE_DAILY_PATH ||
    process.env.DC_ATTENDANCE_DAILY_PATH ||
    "/dreamclassapi/v1/students/attendance/daily/list"
  ).trim();
  const attendanceLessonPath = (
    process.env.DREAMCLASS_ATTENDANCE_LESSON_PATH ||
    process.env.DC_ATTENDANCE_LESSON_PATH ||
    "/dreamclassapi/v1/students/attendance/lesson/list"
  ).trim();
  const pingPath = (process.env.DREAMCLASS_PING_PATH || studentsPathTemplate).trim();
  const studentsNameOrEmail = (
    process.env.DREAMCLASS_STUDENTS_NAME_OR_EMAIL ||
    process.env.DC_STUDENTS_NAME_OR_EMAIL ||
    ""
  ).trim();
  const classCourseId = (
    process.env.DREAMCLASS_CLASS_COURSE_ID ||
    process.env.DC_CLASS_COURSE_ID ||
    ""
  ).trim();
  const tenant = (process.env.DREAMCLASS_TENANT || process.env.DC_TENANT || "").trim();
  const schoolCode = (process.env.DREAMCLASS_SCHOOL_CODE || process.env.DC_SCHOOL_CODE || "").trim();

  return {
    baseUrl,
    token,
    apiKey,
    authType,
    authHeader,
    authPrefix,
    extraHeaders,
    studentsPathTemplate,
    gradesPath,
    gradebookValuesPath,
    gradeMappingPath,
    coursesPath,
    schoolPeriodsPath,
    levelsPath,
    schoolPeriodClassesPathTemplate,
    schoolPeriodClassCoursesPathTemplate,
    schoolPeriodStudentsPathTemplate,
    schoolPeriodTermsPathTemplate,
    attendanceStatusesPath,
    attendanceDailyPath,
    attendanceLessonPath,
    pingPath,
    studentsNameOrEmail,
    classCourseId,
    tenant,
    schoolCode,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
}

function isConfigured() {
  const cfg = getConfig();
  return Boolean(cfg.baseUrl && (cfg.token || cfg.apiKey));
}

function buildHeaders(cfg) {
  const headers = {
    Accept: "application/json",
    ...(cfg.extraHeaders && typeof cfg.extraHeaders === "object" ? cfg.extraHeaders : {})
  };

  if (cfg.token) {
    headers[cfg.authHeader] = `${cfg.authPrefix || ""}${cfg.token}`;
  } else if (cfg.apiKey) {
    headers[cfg.authHeader] = cfg.apiKey;
  }

  // DreamClass commonly expects these exact header names.
  if (cfg.tenant && !headers.tenant) {
    headers.tenant = cfg.tenant;
  }
  if (cfg.schoolCode && !headers.schoolCode) {
    headers.schoolCode = cfg.schoolCode;
  }

  return headers;
}

function resolvePathTemplate(template, vars = {}) {
  const path = String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = vars[key];
    if (value === undefined || value === null || value === "") return `__MISSING_${key}__`;
    return encodeURIComponent(String(value));
  });

  const missing = path.match(/__MISSING_([A-Z0-9_]+?)__/i);
  if (missing) {
    const err = new Error(`DreamClass path template is missing value for ${missing[1].toLowerCase()}`);
    err.code = "DREAMCLASS_TEMPLATE_VALUE_MISSING";
    err.statusCode = 400;
    throw err;
  }

  return path;
}

function resolveStudentsPath(cfg, nameOrEmail) {
  const raw = nameOrEmail ?? cfg.studentsNameOrEmail ?? "";
  const encoded = encodeURIComponent(String(raw));
  return String(cfg.studentsPathTemplate || "").replace(/\{nameOrEmail\}/g, encoded);
}

async function requestJson(path, { method = "GET", query, body } = {}) {
  const cfg = getConfig();
  if (!isConfigured()) {
    const err = new Error("DreamClass is not configured. Set DREAMCLASS_BASE_URL and DREAMCLASS_API_TOKEN/API_KEY.");
    err.code = "DREAMCLASS_NOT_CONFIGURED";
    err.statusCode = 400;
    throw err;
  }

  const url = new URL(joinUrl(cfg.baseUrl, path));
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }

  const res = await fetch(url, {
    method,
    headers: {
      ...buildHeaders(cfg),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(cfg.timeoutMs)
  });

  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(payload?.message || payload?.error || `DreamClass request failed (${res.status})`);
    err.code = "DREAMCLASS_HTTP_ERROR";
    err.statusCode = res.status;
    err.details = payload;
    throw err;
  }

  return payload;
}

async function ping() {
  const cfg = getConfig();
  const pingPath = cfg.pingPath.includes("{nameOrEmail}")
    ? resolveStudentsPath(cfg, cfg.studentsNameOrEmail)
    : resolvePathTemplate(cfg.pingPath, {
        tenant: cfg.tenant,
        schoolCode: cfg.schoolCode
      });
  const payload = await requestJson(pingPath);
  return {
    ok: true,
    configured: true,
    endpoint: trimSlashes(pingPath),
    sampleCount: extractCollection(payload).length
  };
}

async function fetchStudents(options = {}) {
  const cfg = getConfig();
  const path = resolveStudentsPath(cfg, options.nameOrEmail);
  const payload = await requestJson(path, { query: options.query });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(path),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchGrades(options = {}) {
  const cfg = getConfig();
  const classCourseId = options.classCourseId ?? cfg.classCourseId;
  if (!classCourseId) {
    const err = new Error("DreamClass gradebook requires classCourseId (set DC_CLASS_COURSE_ID).");
    err.code = "DREAMCLASS_CLASSCOURSE_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  const payload = await requestJson(cfg.gradesPath, {
    query: {
      classCourseId,
      ...(options.query || {})
    }
  });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(cfg.gradesPath),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchGradebookValues(options = {}) {
  const cfg = getConfig();
  const classCourseId = options.classCourseId ?? cfg.classCourseId;
  const periodStudentId = options.periodStudentId ?? options.query?.periodStudentId;
  if (!classCourseId) {
    const err = new Error("DreamClass gradebook values requires classCourseId.");
    err.code = "DREAMCLASS_CLASSCOURSE_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  if (!periodStudentId) {
    const err = new Error("DreamClass gradebook values requires periodStudentId.");
    err.code = "DREAMCLASS_PERIOD_STUDENT_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  const payload = await requestJson(cfg.gradebookValuesPath, {
    query: {
      classCourseId,
      periodStudentId,
      ...(options.query || {})
    }
  });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(cfg.gradebookValuesPath),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchGradeMapping(options = {}) {
  const cfg = getConfig();
  const payload = await requestJson(cfg.gradeMappingPath, { query: options.query });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(cfg.gradeMappingPath),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchCourses(options = {}) {
  const cfg = getConfig();
  const payload = await requestJson(cfg.coursesPath, {
    query: options.query
  });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(cfg.coursesPath),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchSchoolPeriods(options = {}) {
  const cfg = getConfig();
  const payload = await requestJson(cfg.schoolPeriodsPath, {
    query: options.query
  });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(cfg.schoolPeriodsPath),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchLevels(options = {}) {
  const cfg = getConfig();
  const payload = await requestJson(cfg.levelsPath, {
    query: options.query
  });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(cfg.levelsPath),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchSchoolPeriodClasses(options = {}) {
  const cfg = getConfig();
  const schoolPeriodId = options.schoolPeriodId;
  const path = resolvePathTemplate(cfg.schoolPeriodClassesPathTemplate, { schoolPeriodId });
  const payload = await requestJson(path, { query: options.query });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(path),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchSchoolPeriodClassCourses(options = {}) {
  const cfg = getConfig();
  const schoolPeriodId = options.schoolPeriodId;
  const path = resolvePathTemplate(cfg.schoolPeriodClassCoursesPathTemplate, { schoolPeriodId });
  const payload = await requestJson(path, { query: options.query });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(path),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchSchoolPeriodStudents(options = {}) {
  const cfg = getConfig();
  const schoolPeriodId = options.schoolPeriodId;
  const path = resolvePathTemplate(cfg.schoolPeriodStudentsPathTemplate, { schoolPeriodId });
  const payload = await requestJson(path, { query: options.query });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(path),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchSchoolPeriodTerms(options = {}) {
  const cfg = getConfig();
  if (!cfg.schoolPeriodTermsPathTemplate) {
    return {
      source: "dreamclass",
      configured: false,
      endpoint: null,
      raw: null,
      records: []
    };
  }

  const schoolPeriodId = options.schoolPeriodId;
  const path = resolvePathTemplate(cfg.schoolPeriodTermsPathTemplate, { schoolPeriodId });
  const payload = await requestJson(path, { query: options.query });
  return {
    source: "dreamclass",
    configured: true,
    endpoint: trimSlashes(path),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchAttendanceStatuses(options = {}) {
  const cfg = getConfig();
  const payload = await requestJson(cfg.attendanceStatusesPath, { query: options.query });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(cfg.attendanceStatusesPath),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchDailyAttendance(options = {}) {
  const cfg = getConfig();
  const periodId = options.periodId ?? options.schoolPeriodId;
  if (!periodId) {
    const err = new Error("DreamClass daily attendance requires periodId.");
    err.code = "DREAMCLASS_PERIOD_REQUIRED";
    err.statusCode = 400;
    throw err;
  }

  const payload = await requestJson(cfg.attendanceDailyPath, {
    query: {
      periodId,
      fromDate: options.fromDate,
      toDate: options.toDate,
      statuses: options.statuses,
      studentId: options.studentId,
      ...(options.query || {})
    }
  });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(cfg.attendanceDailyPath),
    raw: payload,
    records: extractCollection(payload)
  };
}

async function fetchLessonAttendance(options = {}) {
  const cfg = getConfig();
  const periodId = options.periodId ?? options.schoolPeriodId;
  if (!periodId) {
    const err = new Error("DreamClass lesson attendance requires periodId.");
    err.code = "DREAMCLASS_PERIOD_REQUIRED";
    err.statusCode = 400;
    throw err;
  }

  const payload = await requestJson(cfg.attendanceLessonPath, {
    query: {
      periodId,
      fromDate: options.fromDate,
      toDate: options.toDate,
      statuses: options.statuses,
      studentId: options.studentId,
      classId: options.classId,
      courseId: options.courseId,
      ...(options.query || {})
    }
  });
  return {
    source: "dreamclass",
    endpoint: trimSlashes(cfg.attendanceLessonPath),
    raw: payload,
    records: extractCollection(payload)
  };
}

module.exports = {
  getConfig,
  isConfigured,
  requestJson,
  ping,
  fetchStudents,
  fetchGrades,
  fetchGradebookValues,
  fetchGradeMapping,
  fetchCourses,
  fetchSchoolPeriods,
  fetchLevels,
  fetchSchoolPeriodClasses,
  fetchSchoolPeriodClassCourses,
  fetchSchoolPeriodStudents,
  fetchSchoolPeriodTerms,
  fetchAttendanceStatuses,
  fetchDailyAttendance,
  fetchLessonAttendance
};
