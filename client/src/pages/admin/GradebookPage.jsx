import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import PageShell from "../../components/admin/PageShell";
import "../../styles/admin.css";
import { scoreScaleMeta } from "../../lib/scoreColors";

const CATEGORY_LABELS = {
  digital: "Web Development",
  meta: "Meta Skills",
  coaching: "Coaching",
  portfolio: "Project Portfolio"
};

function displayScore(value) {
  return scoreScaleMeta(value).display;
}

function displayTermName(value) {
  return String(value || "").replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

function displayPeriodName(value) {
  return String(value || "").trim() || "Untitled Period";
}

function toBarWidth(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (number / max) * 100));
}

export default function GradebookPage() {
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("");
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");
  const [gradeData, setGradeData] = useState({ rows: [] });
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPeriods() {
    const items = await api("/api/periods");
    const nextPeriods = Array.isArray(items) ? items : [];
    setPeriods(nextPeriods);
    setPeriodId((prev) => (prev && nextPeriods.some((period) => String(period.id) === String(prev)) ? prev : (nextPeriods[0]?.id || "")));
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
    setTermId((prev) => (prev && nextTerms.some((term) => String(term.id) === String(prev)) ? prev : (nextTerms[0]?.id || "")));
  }

  useEffect(() => {
    loadPeriods().catch((loadError) => {
      setError(loadError?.message || "Failed to load periods.");
      setPeriods([]);
      setPeriodId("");
    });
  }, []);

  useEffect(() => {
    function onAcademicRefresh() {
      loadPeriods().catch(() => {});
    }
    window.addEventListener("admin:academic-structure-updated", onAcademicRefresh);
    return () => window.removeEventListener("admin:academic-structure-updated", onAcademicRefresh);
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
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [gradesResponse, teamsResponse] = await Promise.all([
          api(`/api/grades?phaseId=${encodeURIComponent(termId)}`),
          api(`/api/team-performance?phaseId=${encodeURIComponent(termId)}`)
        ]);
        if (cancelled) return;
        setGradeData({ rows: Array.isArray(gradesResponse?.rows) ? gradesResponse.rows : [] });
        setTeams(Array.isArray(teamsResponse) ? teamsResponse : []);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError?.message || "Failed to load grades overview.");
        setGradeData({ rows: [] });
        setTeams([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [termId]);

  const selectedPeriod = periods.find((period) => String(period.id) === String(periodId));
  const selectedTerm = terms.find((term) => String(term.id) === String(termId));

  const derived = useMemo(() => {
    const rows = Array.isArray(gradeData.rows) ? gradeData.rows : [];
    const scoreValues = rows.flatMap((row) => {
      const streamValues = Object.values(row.streamScores || {}).filter((value) => value != null).map(Number);
      return row.avg != null ? [...streamValues, Number(row.avg)] : streamValues;
    }).filter(Number.isFinite);
    const scaleMax = scoreValues.length && Math.max(...scoreValues) <= 5 ? 5 : 100;
    const riskThreshold = scaleMax === 5 ? 3 : 60;

    const categoryRows = Object.entries(CATEGORY_LABELS).map(([key, label]) => {
      const values = rows.map((row) => row.streamScores?.[key]).filter((value) => value != null).map(Number);
      const avg = values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
      return {
        key,
        label,
        avg,
        high: values.length ? Math.max(...values) : null,
        low: values.length ? Math.min(...values) : null,
        coverage: rows.length ? Math.round((values.length / rows.length) * 100) : 0,
        count: values.length
      };
    });

    const programValues = rows.map((row) => row.avg).filter((value) => value != null).map(Number);
    const programAvg = programValues.length ? Number((programValues.reduce((sum, value) => sum + value, 0) / programValues.length).toFixed(2)) : null;
    const atRisk = rows.filter((row) => row.avg != null && Number(row.avg) < riskThreshold).length;

    const reviewStudents = [...rows]
      .map((row) => ({ ...row, avg: row.avg == null ? null : Number(row.avg) }))
      .sort((a, b) => {
        if (a.avg == null && b.avg == null) return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
        if (a.avg == null) return 1;
        if (b.avg == null) return -1;
        return a.avg - b.avg || String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
      })
      .slice(0, 8);

    const topTeams = [...teams].sort((a, b) => {
      const aValue = a.teamAvg == null ? -Infinity : Number(a.teamAvg);
      const bValue = b.teamAvg == null ? -Infinity : Number(b.teamAvg);
      return bValue - aValue || String(a.team || "").localeCompare(String(b.team || ""), undefined, { sensitivity: "base" });
    });

    return {
      rows,
      categoryRows,
      programAvg,
      atRisk,
      riskThreshold,
      scaleMax,
      reviewStudents,
      topTeams
    };
  }, [gradeData.rows, teams]);

  return (
    <PageShell
      title="Grades Overview"
      subtitle="High-level summary by selected period and term across Web Development, Meta Skills, Coaching, Project Portfolio, and Overall."
      actions={(
        <div style={{ display: "grid", gap: 8 }}>
          <div className="filterField compact">
            <span className="filterFieldLabel">Period</span>
            <select className="chipSelect adminSelect" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              {periods.length ? periods.map((period) => (
                <option key={period.id} value={period.id}>{displayPeriodName(period.name)}</option>
              )) : <option value="">No periods</option>}
            </select>
          </div>
          <div className="filterField compact">
            <span className="filterFieldLabel">Term</span>
            <select className="chipSelect adminSelect" value={termId} onChange={(event) => setTermId(event.target.value)}>
              {terms.length ? terms.map((term) => (
                <option key={term.id} value={term.id}>{displayTermName(term.name)}</option>
              )) : <option value="">No terms</option>}
            </select>
          </div>
        </div>
      )}
    >
      {loading ? (
        <div className="adminLoading">Loading grades overview...</div>
      ) : error ? (
        <div className="adminError">{error}</div>
      ) : (
        <>
          <div className="kpiGrid">
            <div className="kpiCard">
              <div className="kpiLabel">Period</div>
              <div className="kpiValue">{displayPeriodName(selectedPeriod?.name) || "-"}</div>
              <div className="kpiNote">DreamClass period</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Term</div>
              <div className="kpiValue">{displayTermName(selectedTerm?.name) || "-"}</div>
              <div className="kpiNote">Reporting term</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Overall</div>
              <div className="kpiValue">{derived.programAvg == null ? "-" : displayScore(derived.programAvg)}</div>
              <div className="kpiNote">Program average</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Students</div>
              <div className="kpiValue">{derived.rows.length}</div>
              <div className="kpiNote">Visible students</div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panelTitle">Stream Summary</div>
            <div className="panelSub">No curriculum topic-level breakdowns. Reporting is period-aware and term-based.</div>
            <div className="table">
              <div className="tr head" style={{ gridTemplateColumns: "1.5fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr" }}>
                <div>Category</div>
                <div>Avg</div>
                <div>High</div>
                <div>Low</div>
                <div>Students With Data</div>
                <div>Coverage %</div>
              </div>
              {derived.categoryRows.map((row) => (
                <div className="tr" key={row.key} style={{ gridTemplateColumns: "1.5fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr" }}>
                  <div>{row.label}</div>
                  <div>{row.avg == null ? "-" : displayScore(row.avg)}</div>
                  <div>{row.high == null ? "-" : displayScore(row.high)}</div>
                  <div>{row.low == null ? "-" : displayScore(row.low)}</div>
                  <div>{row.count}</div>
                  <div>
                    <div className="miniBar">
                      <div className="miniBarFill" style={{ width: `${row.coverage}%` }} />
                    </div>
                    <div className="topicMeta">{row.coverage}%</div>
                  </div>
                </div>
              ))}
              <div className="tr" style={{ gridTemplateColumns: "1.5fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr", fontWeight: 800 }}>
                <div>Program Avg (Overall Streams)</div>
                <div>{derived.programAvg == null ? "-" : displayScore(derived.programAvg)}</div>
                <div>-</div>
                <div>-</div>
                <div>{derived.rows.length}</div>
                <div>-</div>
              </div>
            </div>
          </div>

          <div className="gridTwo" style={{ marginTop: 16 }}>
            <div className="panel">
              <div className="panelTitle">Team Overview</div>
              <div className="panelSub">Average performance by team for the selected term.</div>
              {!derived.topTeams.length ? (
                <div className="emptyState">No team data yet.</div>
              ) : (
                <div className="stackList">
                  {derived.topTeams.map((team) => (
                    <div className="bucketRow" key={team.id}>
                      <div className="bucketLabel">
                        {team.team}
                        <span className="topicMeta"> ({Array.isArray(team.students) ? team.students.length : 0} students)</span>
                      </div>
                      <div className="bucketCount">{team.teamAvg == null ? "-" : displayScore(team.teamAvg)}</div>
                      <div className="miniBar">
                        <div className="miniBarFill" style={{ width: `${toBarWidth(team.teamAvg, derived.scaleMax)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panelTitle">Students Needing Review</div>
              <div className="panelSub">Lowest overall averages in the selected term.</div>
              {!derived.reviewStudents.length ? (
                <div className="emptyState">No student data yet.</div>
              ) : (
                <div className="stackList">
                  {derived.reviewStudents.map((student) => (
                    <div className="riskRow" key={student.id}>
                      <div>
                        <div className="riskName">{student.name}</div>
                        <div className="riskMeta">{student.teamName || "Unassigned"}</div>
                      </div>
                      <div className="riskStat">{student.avg == null ? "-" : displayScore(student.avg)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
