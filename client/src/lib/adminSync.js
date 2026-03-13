export async function runAdminFullSync(apiClient) {
  const result = await apiClient("/api/integrations/dreamclass/sync/all", {
    method: "POST",
    body: JSON.stringify({
      replaceLocalAcademic: true,
      createMissingTopics: true,
      stream: "all"
    })
  });

  if (result?.grades?.ok === false) {
    throw new Error(result?.grades?.message || "Grades sync failed.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("admin:academic-structure-updated"));
    window.dispatchEvent(new Event("admin:sync"));
  }

  return result;
}

export function summarizeAdminFullSync(result) {
  if (result?.configured === false) return "DreamClass not configured.";
  const grades = result?.grades || {};
  const attendance = result?.attendance || {};
  const attendanceSummary = attendance?.fetchedPeriods
    ? ` Attendance: ${Number(attendance.created || 0)} new, ${Number(attendance.updated || 0)} updated across ${Number(attendance.fetchedPeriods || 0)} period${Number(attendance.fetchedPeriods || 0) === 1 ? "" : "s"}.`
    : "";
  if (grades?.mode === "all-phases") {
    return `Sync completed. ${Number(grades.phasesSynced || 0)} terms synced, ${Number(grades.studentsWithMarks || 0)} student-term results saved across ${Number(grades.gradebookValuesRequests || 0)} gradebook requests.${attendanceSummary}`;
  }
  return `Sync completed. ${Number(grades.studentsWithMarks || 0)} student results saved.${attendanceSummary}`;
}
