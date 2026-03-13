import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import PageShell from "../../components/admin/PageShell";
import GradeDetailMatrix from "../../components/grades/GradeDetailMatrix";
import { syncGradesAcrossTerms } from "../../lib/gradeSync";
import "../../styles/admin.css";

function displayTermName(value) {
  return String(value || "").replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

function displayPeriodName(value) {
  return String(value || "").trim() || "Untitled Period";
}

export default function WeeklyGradebookPage() {
  const [periodId, setPeriodId] = useState("");
  const [periods, setPeriods] = useState([]);
  const [termId, setTermId] = useState("");
  const [terms, setTerms] = useState([]);
  const [detail, setDetail] = useState({
    rows: [],
    columns: { meta: [], webdev: [] },
    periodName: "",
    termName: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncingGrades, setSyncingGrades] = useState(false);
  const [syncSummary, setSyncSummary] = useState("");

  async function loadPeriods() {
    const items = await api("/api/periods");
    const nextPeriods = Array.isArray(items) ? items : [];
    setPeriods(nextPeriods);
    setPeriodId((prev) => (
      prev && nextPeriods.some((period) => String(period.id) === String(prev))
        ? prev
        : (nextPeriods[0]?.id || "")
    ));
  }

  async function loadTerms(selectedPeriodId = periodId) {
    if (!selectedPeriodId) {
      setTerms([]);
      setTermId("");
      return;
    }
    const items = await api(`/api/phases?termId=${encodeURIComponent(selectedPeriodId)}`);
    const nextTerms = Array.isArray(items) ? items : [];
    setTerms(nextTerms);
    setTermId((prev) => (
      prev && nextTerms.some((term) => String(term.id) === String(prev))
        ? prev
        : (nextTerms[0]?.id || "")
    ));
  }

  async function loadGrades(selectedTermId = termId) {
    if (!selectedTermId) {
      setDetail({
        rows: [],
        columns: { meta: [], webdev: [] },
        periodName: "",
        termName: ""
      });
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api(`/api/grade-detail?phaseId=${encodeURIComponent(selectedTermId)}`);
      setDetail({
        rows: Array.isArray(response?.rows) ? response.rows : [],
        columns: {
          meta: Array.isArray(response?.columns?.meta) ? response.columns.meta : [],
          webdev: Array.isArray(response?.columns?.webdev) ? response.columns.webdev : []
        },
        periodName: response?.periodName || "",
        termName: response?.termName || ""
      });
    } catch (loadError) {
      setError(loadError?.message || "Failed to load weekly gradebook.");
      setDetail({
        rows: [],
        columns: { meta: [], webdev: [] },
        periodName: "",
        termName: ""
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPeriods().catch((loadError) => {
      setError(loadError?.message || "Failed to load periods.");
      setPeriods([]);
      setPeriodId("");
    });
  }, []);

  useEffect(() => {
    if (!periodId) {
      setTerms([]);
      setTermId("");
      return;
    }
    loadTerms(periodId).catch((loadError) => {
      setError(loadError?.message || "Failed to load terms.");
      setTerms([]);
      setTermId("");
    });
  }, [periodId]);

  useEffect(() => {
    if (!termId) return;
    loadGrades(termId);
  }, [termId]);

  useEffect(() => {
    function handleAcademicRefresh() {
      loadPeriods()
        .then(() => loadTerms(periodId))
        .catch(() => {});
    }
    window.addEventListener("admin:academic-structure-updated", handleAcademicRefresh);
    return () => window.removeEventListener("admin:academic-structure-updated", handleAcademicRefresh);
  }, [periodId]);

  async function syncGrades() {
    if (!periodId || !terms.length) {
      setSyncSummary("Select a period with terms first.");
      return;
    }
    setSyncingGrades(true);
    setSyncSummary("");
    try {
      const result = await syncGradesAcrossTerms(api, terms, {
        stream: "all",
        createMissingTopics: true,
        onProgress: ({ current, total, term }) => {
          setSyncSummary(`Syncing ${term?.name || "Term"} (${current}/${total})...`);
        }
      });
      await loadGrades(termId);
      window.dispatchEvent(new Event("admin:sync"));
      setSyncSummary(result.summaryText || "Grades synced.");
    } catch (syncError) {
      setSyncSummary(syncError?.message || "Grades sync failed.");
    } finally {
      setSyncingGrades(false);
    }
  }

  const weeklyRows = useMemo(
    () => (
      [...(detail.rows || [])].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      )
    ),
    [detail.rows]
  );

  const metaColumns = useMemo(() => detail.columns?.meta || [], [detail.columns?.meta]);
  const webdevColumns = useMemo(() => detail.columns?.webdev || [], [detail.columns?.webdev]);

  return (
    <PageShell
      title="Weekly Gradebook"
      subtitle="Per-student weekly performance for Meta Skills and Web Development."
      actions={(
        <>
          <div style={{ display: "grid", gap: 8 }}>
            <div className="filterField compact">
              <span className="filterFieldLabel">Period</span>
              <select className="chipSelect adminSelect" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
                {periods.length ? (
                  periods.map((period) => (
                    <option key={period.id} value={period.id}>{displayPeriodName(period.name)}</option>
                  ))
                ) : (
                  <option value="">No periods</option>
                )}
              </select>
            </div>
            <div className="filterField compact">
              <span className="filterFieldLabel">Term</span>
              <select className="chipSelect adminSelect" value={termId} onChange={(event) => setTermId(event.target.value)}>
                {terms.length ? (
                  terms.map((term) => (
                    <option key={term.id} value={term.id}>{displayTermName(term.name)}</option>
                  ))
                ) : (
                  <option value="">No terms</option>
                )}
              </select>
            </div>
          </div>
          <button className="chipBtn" onClick={syncGrades} disabled={syncingGrades || !termId} type="button">
            {syncingGrades ? "Syncing Grades..." : "Sync Grades"}
          </button>
        </>
      )}
    >
      <div className="panel">
        <div className="panelTitle">Weekly Gradebook</div>
        <div className="panelSub">
          {weeklyRows.length} students
          {detail.periodName ? ` - ${displayPeriodName(detail.periodName)}` : ""}
          {detail.termName ? ` - ${displayTermName(detail.termName)}` : ""}
          {syncSummary ? ` - ${syncSummary}` : ""}
        </div>

        {error ? <div className="adminError">{error}</div> : null}
        {loading ? <div className="adminLoading">Loading weekly gradebook...</div> : null}

        {!loading && (!metaColumns.length && !webdevColumns.length) ? (
          <div className="emptyState">No weekly grade columns are available for this term yet.</div>
        ) : !loading && !weeklyRows.length ? (
          <div className="emptyState">No grades found for this term.</div>
        ) : (
          <GradeDetailMatrix detail={{ ...detail, rows: weeklyRows }} variant="admin" />
        )}
      </div>
    </PageShell>
  );
}
