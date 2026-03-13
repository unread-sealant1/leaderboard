import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import PageShell from "../../components/admin/PageShell";
import GradebookSummaryTable from "../../components/grades/GradebookSummaryTable";
import { syncGradesAcrossTerms } from "../../lib/gradeSync";
import "../../styles/admin.css";

function displayTermName(value) {
  return String(value || "").replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

function displayPeriodName(value) {
  return String(value || "").trim() || "Untitled Period";
}

export default function GradesPage() {
  const [periodId, setPeriodId] = useState("");
  const [periods, setPeriods] = useState([]);
  const [termId, setTermId] = useState("");
  const [terms, setTerms] = useState([]);
  const [gradebookRows, setGradebookRows] = useState([]);
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
      setGradebookRows([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const gradebookResponse = await api(`/api/grades?phaseId=${encodeURIComponent(selectedTermId)}`);
      setGradebookRows(Array.isArray(gradebookResponse?.rows) ? gradebookResponse.rows : []);
    } catch (loadError) {
      setError(loadError?.message || "Failed to load grade detail.");
      setGradebookRows([]);
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

  const summaryRows = useMemo(
    () => (
      [...(gradebookRows || [])].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      )
    ),
    [gradebookRows]
  );
  const selectedPeriod = periods.find((period) => String(period.id) === String(periodId));
  const selectedTerm = terms.find((term) => String(term.id) === String(termId));

  return (
    <PageShell
      title="Gradebook"
      subtitle="Per-student stream summaries for the selected period and term."
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
        <div className="panelTitle">Gradebook</div>
        <div className="panelSub">
          {summaryRows.length} students
          {selectedPeriod?.name ? ` - ${displayPeriodName(selectedPeriod.name)}` : ""}
          {selectedTerm?.name ? ` - ${displayTermName(selectedTerm.name)}` : ""}
          {syncSummary ? ` - ${syncSummary}` : ""}
        </div>

        {error ? <div className="adminError">{error}</div> : null}
        {loading ? <div className="adminLoading">Loading grades...</div> : null}

        {!loading && !summaryRows.length ? (
          <div className="emptyState">No gradebook results found for this term.</div>
        ) : (
          <GradebookSummaryTable rows={summaryRows} />
        )}
      </div>
    </PageShell>
  );
}
