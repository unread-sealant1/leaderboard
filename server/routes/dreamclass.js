const express = require("express");
const { requireAuth } = require("../middleware/auth");
const dreamclassClient = require("../services/dreamclass-client");
const {
  integrationStatus,
  ping,
  syncTermsAndPhases,
  syncStudents,
  syncAttendance,
  syncGrades,
  syncAll
} = require("../services/dreamclass-sync");

const router = express.Router();

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

function parseSyncOptions(req) {
  const src = req.method === "GET" ? req.query : (req.body || {});
  return {
    termId: src.termId || null,
    phaseId: src.phaseId || null,
    stream: src.stream || null,
    classCourseId: src.classCourseId || null,
    schoolPeriodId: src.schoolPeriodId || null,
    replaceLocalAcademic: toBool(src.replaceLocalAcademic, false),
    createMissingTopics: toBool(src.createMissingTopics, false),
    dryRun: toBool(src.dryRun, false),
    query: src.query && typeof src.query === "object" ? src.query : undefined
  };
}

router.get("/status", requireAuth, async (req, res) => {
  res.json(integrationStatus());
});

router.get("/ping", requireAuth, async (req, res) => {
  try {
    const payload = await ping();
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass ping failed",
      code: error.code || "DREAMCLASS_PING_FAILED",
      details: error.details || null
    });
  }
});

router.get("/courses", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchCourses();
    res.json(payload);
  } catch (error) {
    console.error("DreamClass courses fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass courses fetch failed",
      code: error.code || "DREAMCLASS_COURSES_FAILED",
      details: error.details || null
    });
  }
});

router.get("/grade-mapping", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchGradeMapping({ query: req.query });
    res.json(payload);
  } catch (error) {
    console.error("DreamClass grade mapping fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass grade mapping fetch failed",
      code: error.code || "DREAMCLASS_GRADE_MAPPING_FAILED",
      details: error.details || null
    });
  }
});

router.get("/gradebook/values", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchGradebookValues({
      classCourseId: req.query.classCourseId,
      periodStudentId: req.query.periodStudentId,
      query: req.query
    });
    res.json(payload);
  } catch (error) {
    console.error("DreamClass gradebook values fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass gradebook values fetch failed",
      code: error.code || "DREAMCLASS_GRADEBOOK_VALUES_FAILED",
      details: error.details || null
    });
  }
});

router.get("/school-periods", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchSchoolPeriods();
    res.json(payload);
  } catch (error) {
    console.error("DreamClass school periods fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass school periods fetch failed",
      code: error.code || "DREAMCLASS_SCHOOL_PERIODS_FAILED",
      details: error.details || null
    });
  }
});

router.get("/school-periods/:schoolPeriodId/classes", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchSchoolPeriodClasses({
      schoolPeriodId: req.params.schoolPeriodId,
      query: req.query
    });
    res.json(payload);
  } catch (error) {
    console.error("DreamClass school period classes fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass school period classes fetch failed",
      code: error.code || "DREAMCLASS_SCHOOL_PERIOD_CLASSES_FAILED",
      details: error.details || null
    });
  }
});

router.get("/school-periods/:schoolPeriodId/classcourses", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchSchoolPeriodClassCourses({
      schoolPeriodId: req.params.schoolPeriodId,
      query: req.query
    });
    res.json(payload);
  } catch (error) {
    console.error("DreamClass school period classcourses fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass school period classcourses fetch failed",
      code: error.code || "DREAMCLASS_SCHOOL_PERIOD_CLASSCOURSES_FAILED",
      details: error.details || null
    });
  }
});

router.get("/school-periods/:schoolPeriodId/students", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchSchoolPeriodStudents({
      schoolPeriodId: req.params.schoolPeriodId,
      query: req.query
    });
    res.json(payload);
  } catch (error) {
    console.error("DreamClass school period students fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass school period students fetch failed",
      code: error.code || "DREAMCLASS_SCHOOL_PERIOD_STUDENTS_FAILED",
      details: error.details || null
    });
  }
});

router.get("/attendance/statuses", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchAttendanceStatuses({ query: req.query });
    res.json(payload);
  } catch (error) {
    console.error("DreamClass attendance statuses fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass attendance statuses fetch failed",
      code: error.code || "DREAMCLASS_ATTENDANCE_STATUSES_FAILED",
      details: error.details || null
    });
  }
});

router.get("/attendance/daily", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchDailyAttendance({
      periodId: req.query.periodId,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      statuses: req.query.statuses,
      studentId: req.query.studentId,
      query: req.query
    });
    res.json(payload);
  } catch (error) {
    console.error("DreamClass daily attendance fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass daily attendance fetch failed",
      code: error.code || "DREAMCLASS_ATTENDANCE_DAILY_FAILED",
      details: error.details || null
    });
  }
});

router.get("/attendance/lesson", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchLessonAttendance({
      periodId: req.query.periodId,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      statuses: req.query.statuses,
      studentId: req.query.studentId,
      classId: req.query.classId,
      courseId: req.query.courseId,
      query: req.query
    });
    res.json(payload);
  } catch (error) {
    console.error("DreamClass lesson attendance fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass lesson attendance fetch failed",
      code: error.code || "DREAMCLASS_ATTENDANCE_LESSON_FAILED",
      details: error.details || null
    });
  }
});

router.get("/levels", requireAuth, async (req, res) => {
  try {
    const payload = await dreamclassClient.fetchLevels();
    res.json(payload);
  } catch (error) {
    console.error("DreamClass levels fetch failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass levels fetch failed",
      code: error.code || "DREAMCLASS_LEVELS_FAILED",
      details: error.details || null
    });
  }
});

router.post("/sync/students", requireAuth, async (req, res) => {
  try {
    const payload = await syncStudents(parseSyncOptions(req));
    res.json(payload);
  } catch (error) {
    console.error("DreamClass students sync failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass student sync failed",
      code: error.code || "DREAMCLASS_SYNC_STUDENTS_FAILED",
      details: error.details || null
    });
  }
});

router.post("/sync/attendance", requireAuth, async (req, res) => {
  try {
    const payload = await syncAttendance(parseSyncOptions(req));
    res.json(payload);
  } catch (error) {
    console.error("DreamClass attendance sync failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass attendance sync failed",
      code: error.code || "DREAMCLASS_SYNC_ATTENDANCE_FAILED",
      details: error.details || null
    });
  }
});

router.post("/sync/terms-phases", requireAuth, async (req, res) => {
  try {
    const payload = await syncTermsAndPhases(parseSyncOptions(req));
    res.json(payload);
  } catch (error) {
    console.error("DreamClass terms/phases sync failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass terms/phases sync failed",
      code: error.code || "DREAMCLASS_SYNC_TERMS_PHASES_FAILED",
      details: error.details || null
    });
  }
});

router.post("/sync/grades", requireAuth, async (req, res) => {
  try {
    const payload = await syncGrades(parseSyncOptions(req));
    res.json(payload);
  } catch (error) {
    console.error("DreamClass grades sync failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass grade sync failed",
      code: error.code || "DREAMCLASS_SYNC_GRADES_FAILED",
      details: error.details || null
    });
  }
});

router.post("/sync/all", requireAuth, async (req, res) => {
  try {
    const payload = await syncAll(parseSyncOptions(req));
    res.json(payload);
  } catch (error) {
    console.error("DreamClass full sync failed:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "DreamClass sync failed",
      code: error.code || "DREAMCLASS_SYNC_ALL_FAILED",
      details: error.details || null
    });
  }
});

module.exports = router;
