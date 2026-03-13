import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import PageShell from "../../components/admin/PageShell";
import "../../styles/admin.css";

function formatRating(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "-";
  if (v >= 0 && v <= 5) return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(Math.round(v));
}

function formatDate(value) {
  if (!value) return "-";
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let year;
  let month;
  let day;
  if (isoMatch) {
    [, year, month, day] = isoMatch;
  } else {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
    year = String(parsed.getFullYear());
    month = String(parsed.getMonth() + 1).padStart(2, "0");
    day = String(parsed.getDate()).padStart(2, "0");
  }
  const monthName = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ][Number(month) - 1];
  if (!monthName) return raw;
  return `${Number(day)} ${monthName} ${year}`;
}

function displayTermName(value) {
  return String(value || "").replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

function AttendanceDial({ score, label, present, late, absent }) {
  const numericScore = Number(score);
  const safeScore = Number.isFinite(numericScore) ? Math.max(0, Math.min(5, numericScore)) : null;
  const progress = safeScore == null ? 0 : Math.round((safeScore / 5) * 100);
  const circleStyle = {
    background: `conic-gradient(#f4b400 0% ${progress}%, #e8edf5 ${progress}% 100%)`
  };

  return (
    <div className="attendanceDialCard">
      <div className="attendanceDialTitle">{label}</div>
      <div className="attendanceDial" style={circleStyle}>
        <div className="attendanceDialInner">
          <div className="attendanceDialValue">{safeScore == null ? "-" : formatRating(safeScore)}</div>
          <div className="attendanceDialScale">/5</div>
        </div>
      </div>
      <div className="attendanceDialMeta">
        {Number.isFinite(Number(present)) || Number.isFinite(Number(late)) || Number.isFinite(Number(absent))
          ? `P ${Number(present || 0)} · L ${Number(late || 0)} · A ${Number(absent || 0)}`
          : "-"}
      </div>
    </div>
  );
}

function Bar({ value, max }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="miniBar">
      <div className="miniBarFill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TrendBars({ points = [] }) {
  const max = Math.max(1, ...points.map((point) => point.average || 0));

  return (
    <div className="trendBars">
      {points.map((point) => {
        const height = Math.max(8, Math.round(((point.average || 0) / max) * 140));
        return (
            <div className="trendBarCol" key={point.period}>
            <div className="trendBarValue">{formatRating(point.average)}</div>
            <div className="trendBarTrack">
              <div className="trendBarFill" style={{ height }} />
            </div>
            <div className="trendBarLabel">{point.period}</div>
          </div>
        );
      })}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboardSkeleton">
      <div className="kpiGrid">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div className="kpiCard" key={idx}>
            <div className="skeletonLine short" />
            <div className="skeletonLine tall" />
            <div className="skeletonLine medium" />
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="skeletonLine short" />
        <div className="skeletonBlock large" />
      </div>
      <div className="grid2">
        <div className="panel"><div className="skeletonBlock medium" /></div>
        <div className="panel"><div className="skeletonBlock medium" /></div>
      </div>
      <div className="grid2">
        <div className="panel"><div className="skeletonBlock medium" /></div>
        <div className="panel"><div className="skeletonBlock medium" /></div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [dash, setDash] = useState(null);
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function loadDashboard(selectedTermId = termId) {
    setLoading(true);
    setLoadError("");
    try {
      const query = selectedTermId ? `?termId=${encodeURIComponent(selectedTermId)}` : "";
      const data = await api(`/api/admin/dashboard${query}`);
      setDash(data);
      const availableTerms = Array.isArray(data?.terms) ? data.terms : [];
      setTermId((prev) => {
        const requested = String(selectedTermId || "");
        if (requested && availableTerms.some((term) => String(term.id) === requested)) return requested;
        if (prev && availableTerms.some((term) => String(term.id) === String(prev))) return String(prev);
        const current = String(data?.currentPhase?.id || "");
        if (current && availableTerms.some((term) => String(term.id) === current)) return current;
        return availableTerms[0]?.id ? String(availableTerms[0].id) : "";
      });
    } catch (error) {
      setDash(null);
      setLoadError(error?.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    function handleSyncRefresh() {
      loadDashboard(termId);
    }
    window.addEventListener("admin:sync", handleSyncRefresh);
    window.addEventListener("admin:academic-structure-updated", handleSyncRefresh);
    return () => {
      window.removeEventListener("admin:sync", handleSyncRefresh);
      window.removeEventListener("admin:academic-structure-updated", handleSyncRefresh);
    };
  }, [termId]);

  const maxDistribution = useMemo(() => {
    if (!dash?.gradeDistribution?.length) return 0;
    return Math.max(...dash.gradeDistribution.map((bucket) => bucket.count));
  }, [dash]);

  const maxPhaseTrend = useMemo(() => {
    if (!dash?.gradeTrend?.length) return 0;
    return Math.max(...dash.gradeTrend.map((point) => point.average));
  }, [dash]);

  const coachingMax = useMemo(() => {
    if (!dash?.coaching) return 1;
    return Math.max(
      1,
      dash.coaching.activeSessions || 0,
      dash.coaching.completedThisPhase || 0,
      dash.coaching.studentsWithoutPlan || 0
    );
  }, [dash]);

  const selectedTermLabel = useMemo(() => {
    const terms = Array.isArray(dash?.terms) ? dash.terms : [];
    const selected = terms.find((term) => String(term.id) === String(termId));
    return displayTermName(selected?.name || dash?.currentPhase?.name || "Selected Term");
  }, [dash, termId]);

  const usesFiveScale = useMemo(() => {
    const keyValues = [
      dash?.kpis?.overallAverage,
      dash?.kpis?.metaSkillsAvg,
      ...(dash?.teamPerformance || []).map((t) => t.average),
      ...(dash?.gradeTrend || []).map((p) => p.average)
    ]
      .map(Number)
      .filter(Number.isFinite);
    if (!keyValues.length) return false;
    return Math.max(...keyValues) <= 5;
  }, [dash]);

  return (
    <PageShell
      title="Overview"
      subtitle="Grade-centric monitoring across teams, terms, and coaching."
      actions={(
        <>
          <div className="filterField compact">
            <span className="filterFieldLabel">Term</span>
            <select
              className="chipSelect adminSelect"
              value={termId}
              onChange={(event) => {
                const next = event.target.value;
                setTermId(next);
                loadDashboard(next);
              }}
            >
              {(dash?.terms || []).length ? (
                (dash?.terms || []).map((term) => (
                  <option key={term.id} value={term.id}>
                    {displayTermName(term.name)}
                  </option>
                ))
              ) : (
                <option value="">No terms</option>
              )}
            </select>
          </div>
          <button className="chipBtn" onClick={() => loadDashboard(termId)}>Refresh Data</button>
        </>
      )}
    >
      {loading ? (
        <DashboardSkeleton />
      ) : loadError ? (
        <div className="adminLoading">{loadError}</div>
      ) : !dash ? (
        <div className="adminLoading">No dashboard data available.</div>
      ) : (
        <>
          <div className="kpiGrid">
            <div className="kpiCard">
              <div className="kpiLabel">Overall Grade Average</div>
              <div className="kpiValue">{formatRating(dash.kpis.overallAverage)}</div>
              <div className="kpiNote">Current term performance</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Students At Risk</div>
              <div className="kpiValue">{dash.kpis.studentsAtRisk}</div>
              <div className="kpiNote">Below threshold ({usesFiveScale ? "3" : "60"})</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Highest Team</div>
              <div className="kpiValue">{dash.kpis.highestTeam.name}</div>
              <div className="kpiNote">{formatRating(dash.kpis.highestTeam.avg)} average</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Digital Skills Avg</div>
              <div className="kpiValue">
                {formatRating(dash.kpis.digitalSkillsAvg ?? dash.kpis.webDevelopmentAvg ?? 0)}
              </div>
              <div className="kpiNote">Current term snapshot</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Active Students</div>
              <div className="kpiValue">{dash.kpis.totalStudents}</div>
              <div className="kpiNote">Current roster size</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Meta Skills Avg</div>
              <div className="kpiValue">{formatRating(dash.kpis.metaSkillsAvg)}</div>
              <div className="kpiNote">Current term snapshot</div>
            </div>
          </div>



          <div className="panel overviewMainChart">
            <div className="panelTitle">Team Performance Overview</div>
            <div className="panelSub">Average grade by team - Updated {new Date(dash.lastUpdated).toLocaleString()}</div>
            <TrendBars
              points={(dash.teamPerformance || []).map((team) => ({
                period: team.teamName,
                average: team.average
              }))}
            />
          </div>

          <div className="grid2">
            <div className="panel">
              <div className="panelTitle">Term Grade Distribution</div>
              <div className="panelSub">Score buckets for {selectedTermLabel}</div>
              <div className="bucketList">
                {(dash.gradeDistribution || []).map((bucket) => (
                  <div className="bucketRow" key={bucket.bucket}>
                    <div className="bucketLabel">{bucket.bucket}</div>
                    <div className="bucketCount">{bucket.count}</div>
                    <Bar value={bucket.count} max={maxDistribution} />
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panelTitle">Term Trend Snapshot</div>
              <div className="panelSub">Recent term averages</div>
              <div className="bucketList">
                {(dash.gradeTrend || []).map((point) => (
                  <div className="bucketRow" key={point.period}>
                    <div className="bucketLabel">{point.period}</div>
                    <div className="bucketCount">{formatRating(point.average)}</div>
                    <Bar value={point.average} max={maxPhaseTrend} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid2">
            <div className="panel">
              <div className="panelTitle">Attendance By Team</div>
              <div className="panelSub">Team attendance dial scores on a 1-5 scale</div>
              <div className="attendanceDialGrid">
                {(dash.teamAttendance || []).map((team) => (
                  <AttendanceDial
                    key={team.teamId || team.teamName}
                    label={team.teamName}
                    score={team.attendanceScore}
                    present={team.present}
                    late={team.late}
                    absent={team.absent}
                  />
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panelTitle">Coaching Summary</div>
              <div className="panelSub">Active support workload and completion</div>
              <div className="bucketList">
                <div className="bucketRow">
                  <div className="bucketLabel">Active Sessions</div>
                  <div className="bucketCount">{dash.coaching.activeSessions}</div>
                  <Bar value={dash.coaching.activeSessions} max={coachingMax} />
                </div>
                <div className="bucketRow">
                  <div className="bucketLabel">Completed This Term</div>
                  <div className="bucketCount">{dash.coaching.completedThisPhase}</div>
                  <Bar value={dash.coaching.completedThisPhase} max={coachingMax} />
                </div>
                <div className="bucketRow">
                  <div className="bucketLabel">Without Coaching Plan</div>
                  <div className="bucketCount">{dash.coaching.studentsWithoutPlan}</div>
                  <Bar value={dash.coaching.studentsWithoutPlan} max={coachingMax} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid1">
            <div className="panel">
              <div className="panelTitle">Alerts & Risk Summary</div>
              <div className="panelSub">Actionable checks with direct navigation</div>
              <div className="riskList">
                <div className="riskRow">
                  <div>
                    <div className="riskTitle">Below Threshold</div>
                    <div className="riskMeta">{dash.risks.belowThreshold} students</div>
                  </div>
                  <a className="softBtn" href="/admin/students?risk=below-threshold">View</a>
                </div>
                <div className="riskRow">
                  <div>
                    <div className="riskTitle">Declining Performance</div>
                    <div className="riskMeta">{dash.risks.decliningPerformance} students</div>
                  </div>
                  <a className="softBtn" href="/admin/students?risk=declining">View</a>
                </div>
                <div className="riskRow">
                  <div>
                    <div className="riskTitle">Coaching Required</div>
                    <div className="riskMeta">{dash.risks.coachingRequired} students</div>
                  </div>
                  <a className="softBtn" href="/admin/coaching?risk=required">View</a>
                </div>
                <div className="riskRow">
                  <div>
                    <div className="riskTitle">Meta Skill Flags</div>
                    <div className="riskMeta">{dash.risks.metaSkillFlags} students</div>
                  </div>
                  <a className="softBtn" href="/admin/meta-skills?risk=flags">View</a>
                </div>
              </div>

              <div className="alertList">
                {(dash.alerts || []).map((alert) => (
                  <div className="alertRow" key={alert.key}>
                    <div>
                      <div className="alertTitle">{alert.key}</div>
                      <div className="alertMsg">{alert.message}</div>
                    </div>
                    <div className={`badge ${alert.level.toLowerCase()}`}>{alert.level}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

