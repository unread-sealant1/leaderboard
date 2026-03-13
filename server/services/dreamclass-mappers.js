function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function toText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function splitName(fullName) {
  const clean = toText(fullName).replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "Student" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1]
  };
}

function normalizeStatus(rawStatus) {
  const s = toText(rawStatus).toLowerCase();
  if (!s) return "active";
  if (["active", "enrolled", "current"].includes(s)) return "active";
  if (["deactivated", "deactivate", "disabled"].includes(s)) return "deactivated";
  if (["inactive", "paused"].includes(s)) return "inactive";
  if (["dropped", "dropout", "dropped_out", "withdrawn"].includes(s)) return "dropped_out";
  if (["deleted", "delete", "removed", "remove"].includes(s)) return "deleted";
  if (["archived"].includes(s)) return "archived";
  return "active";
}

function inferSchoolPeriodStatus(record) {
  const schoolPeriods = Array.isArray(record?.schoolPeriods) ? record.schoolPeriods : [];
  if (!schoolPeriods.length) return "deactivated";

  const states = schoolPeriods
    .map((entry) => {
      if (entry?.active === true || entry?.isActive === true) return "active";
      if (entry?.active === false || entry?.isActive === false) return "deactivated";
      return normalizeStatus(
        pick(entry, ["status", "state", "registrationStatus", "schoolPeriodStatus"])
      );
    })
    .filter(Boolean);

  if (states.includes("active")) return "active";
  if (states.includes("deleted")) return "deleted";
  if (states.includes("archived")) return "archived";
  if (states.includes("dropped_out")) return "dropped_out";
  if (states.includes("deactivated")) return "deactivated";
  if (states.includes("inactive")) return "inactive";
  return "deactivated";
}

function parseNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;

  const fractionMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const num = Number(fractionMatch[1]);
    const den = Number(fractionMatch[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return (num / den) * 100;
    return null;
  }

  const pctMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (pctMatch) return Number(pctMatch[1]);

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function scoreToPercent(rawScore, rawMax) {
  const score = parseNumber(rawScore);
  if (score == null) return null;

  const max = parseNumber(rawMax);
  // Preserve 1-5 competency values when no explicit max is provided.
  if (max == null) {
    if (score > 0 && score < 1) return Math.round(score * 100);
    if (score >= 0 && score <= 5) return Number(score.toFixed(3));
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  return Math.round(pct);
}

function normalizeStream(raw) {
  const s = toText(raw).toLowerCase();
  if (!s) return null;
  if (/portfolio/.test(s)) return "portfolio";
  if (/meta\s*skills?|metaskills?/.test(s)) return "meta";
  if (/web\s*development|digital\s*skills?|^webdev$|^digital$|^web$/.test(s)) return "webdev";
  if (/coaching|coach/.test(s)) return "coaching";
  return null;
}

function normalizeTopicTitle(value) {
  return toText(value).replace(/\s+/g, " ");
}

function normalizeStudentRecord(record) {
  const externalId = toText(
    pick(record, [
      "periodStudentId",
      "period_student_id",
      "periodStudent.id",
      "period_student.id",
      "id",
      "student_id",
      "studentId",
      "uuid",
      "external_id",
      "user_id"
    ])
  );
  const firstNameRaw = pick(record, ["first_name", "firstName", "firstname", "given_name", "givenName"]);
  const lastNameRaw = pick(record, ["last_name", "lastName", "lastname", "surname", "family_name", "familyName"]);
  const fullNameRaw = pick(record, ["full_name", "fullName", "name", "student_name", "studentName"]);
  const email = toText(pick(record, ["email", "email_address", "emailAddress", "user.email"])) || null;
  const explicitStatus = pick(record, ["status", "student_status", "studentStatus", "state"]);
  const status = explicitStatus
    ? normalizeStatus(explicitStatus)
    : inferSchoolPeriodStatus(record);

  let firstName = toText(firstNameRaw);
  let lastName = toText(lastNameRaw);

  if (!firstName && !lastName && fullNameRaw) {
    const split = splitName(fullNameRaw);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  if (!firstName && lastName) {
    const split = splitName(lastName);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  if (!firstName || !lastName) {
    return { ok: false, reason: "missing_name", raw: record };
  }

  return {
    ok: true,
    externalId: externalId || null,
    firstName,
    lastName,
    email,
    status,
    raw: record
  };
}

function normalizeGradeRecord(record) {
  const externalId = toText(
    pick(record, ["id", "grade_id", "gradeId", "result_id", "resultId", "external_id"])
  ) || null;

  const studentExternalId = toText(
    pick(record, [
      "student_id",
      "studentId",
      "student.id",
      "learner_id",
      "learnerId",
      "user_id",
      "userId"
    ])
  ) || null;

  const topicExternalId = toText(
    pick(record, ["topic_id", "topicId", "assessment_id", "assessmentId", "assignment_id", "assignmentId"])
  ) || null;

  const topicTitle = normalizeTopicTitle(
    pick(record, [
      "topic_title",
      "topicTitle",
      "topic",
      "assessment_title",
      "assessmentTitle",
      "assignment",
      "assignment_name",
      "assignmentName",
      "title"
    ])
  ) || null;

  const score = scoreToPercent(
    pick(record, ["score", "mark", "grade", "value", "points_earned", "pointsEarned", "percentage"]),
    pick(record, ["max_score", "maxScore", "out_of", "outOf", "points_possible", "pointsPossible"])
  );

  if (!studentExternalId) {
    return { ok: false, reason: "missing_student_id", raw: record };
  }
  if (score == null) {
    return { ok: false, reason: "missing_score", raw: record };
  }
  if (!topicExternalId && !topicTitle) {
    return { ok: false, reason: "missing_topic", raw: record };
  }

  return {
    ok: true,
    externalId,
    studentExternalId,
    topicExternalId,
    topicTitle,
    score,
    stream: normalizeStream(pick(record, ["stream", "course_type", "courseType", "category"])),
    phaseName: toText(pick(record, ["phase_name", "phaseName", "phase", "module"])) || null,
    gradedAt: toText(pick(record, ["graded_at", "gradedAt", "updated_at", "updatedAt", "created_at", "createdAt"])) || null,
    raw: record
  };
}

module.exports = {
  pick,
  normalizeStudentRecord,
  normalizeGradeRecord,
  normalizeTopicTitle,
  normalizeStream,
  scoreToPercent
};
