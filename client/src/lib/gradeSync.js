function mergeCounts(target = {}, source = {}) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = Number(target[key] || 0) + Number(value || 0);
  }
  return target;
}

function topSkipReason(skippedReasons = {}) {
  return Object.entries(skippedReasons).sort((a, b) => Number(b[1]) - Number(a[1]))[0] || null;
}

function sortTerms(a, b) {
  const aOrder = Number(a?.phase_order || 0);
  const bOrder = Number(b?.phase_order || 0);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
}

export async function syncGradesAcrossTerms(api, terms = [], options = {}) {
  const orderedTerms = [...terms].sort(sortTerms);
  if (!orderedTerms.length) {
    throw new Error("No terms available to sync.");
  }

  const reportProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const runs = [];
  for (let index = 0; index < orderedTerms.length; index += 1) {
    const term = orderedTerms[index];
    reportProgress?.({
      status: "running",
      current: index + 1,
      total: orderedTerms.length,
      term
    });

    try {
      const result = await api("/api/integrations/dreamclass/sync/grades", {
        method: "POST",
        body: JSON.stringify({
          phaseId: term.id,
          stream: options.stream || "all",
          createMissingTopics: options.createMissingTopics !== false
        })
      });
      runs.push({ term, result });
      reportProgress?.({
        status: "completed",
        current: index + 1,
        total: orderedTerms.length,
        term,
        result
      });
    } catch (error) {
      throw new Error(`${term.name || "Term"} sync failed: ${error?.message || "Unknown error"}`);
    }
  }

  if (runs.some(({ result }) => result?.configured === false)) {
    return {
      runs,
      summaryText: "DreamClass not configured."
    };
  }

  const totals = runs.reduce((acc, { result }) => {
    acc.created += Number(result?.created || 0);
    acc.updated += Number(result?.updated || 0);
    acc.fetched += Number(result?.fetched || 0);
    acc.gradebookValuesRequests += Number(result?.gradebookValuesRequests || 0);
    acc.studentsWithMarks += Number(result?.studentsWithMarks || 0);
    acc.studentsAttemptedForValues += Number(result?.studentsAttemptedForValues || 0);
    mergeCounts(acc.skippedReasons, result?.skippedReasons || {});
    if (!acc.firstDiagnostic && Array.isArray(result?.studentValueDiagnostics)) {
      acc.firstDiagnostic = result.studentValueDiagnostics.find((entry) => entry.result && entry.result !== "values_saved") || null;
    }
    return acc;
  }, {
    created: 0,
    updated: 0,
    fetched: 0,
    gradebookValuesRequests: 0,
    studentsWithMarks: 0,
    studentsAttemptedForValues: 0,
    skippedReasons: {},
    firstDiagnostic: null
  });

  const reason = topSkipReason(totals.skippedReasons);
  const termLabels = orderedTerms.map((term) => term.name).join(", ");
  const summaryText = `Synced grades across ${orderedTerms.length} terms (${termLabels}): ${totals.created} new, ${totals.updated} updated (${totals.fetched} values, ${totals.gradebookValuesRequests} value calls, ${totals.studentsWithMarks}/${totals.studentsAttemptedForValues} students with marks${reason ? ` | top skip: ${reason[0]} (${reason[1]})` : ""}${totals.firstDiagnostic ? ` | sample: ${totals.firstDiagnostic.studentName || "student"} -> ${totals.firstDiagnostic.result}` : ""}).`;

  return {
    runs,
    summaryText
  };
}
