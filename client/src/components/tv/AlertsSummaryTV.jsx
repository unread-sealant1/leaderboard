import React, { useEffect, useMemo, useState } from "react";
import API_BASE from "../../lib/apiBase";
import "../../styles/tv.css";

function displayTermLabel(value, fallback = "Term") {
  const text = String(value || "").trim() || fallback;
  return text.replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

const SEVERITY_DOT = {
  warning: "#F4A259",
  low: "#6FA8DC",
  onTrack: "#A4D07B",
  critical: "#F97066"
};

const STATIC_TEAM_LIST = [
  { id: "all", label: "All Teams" },
  { id: "team-1", label: "Team 1" },
  { id: "team-2", label: "Team 2" },
  { id: "team-3", label: "Team 3" },
  { id: "team-4", label: "Team 4" }
];

function severityFromCount(count) {
  const n = Number(count || 0);
  if (n === 0) return "onTrack";
  if (n < 5) return "low";
  if (n < 15) return "warning";
  return "critical";
}

function buildItems(summary) {
  if (!summary) return [];
  const windowLabel = summary.windowLabel || "last month";

  const rows = [
    {
      id: "late_attendance",
      title: "Late Attendance",
      count: summary.lateAttendance,
      description: `${summary.lateAttendance || 0} students have been late to class in the ${windowLabel}`
    },
    {
      id: "missed_days",
      title: "Missed Days",
      count: summary.missedDays,
      description: `${summary.missedDays || 0} students have missed class in the ${windowLabel}`
    },
    {
      id: "late_submissions",
      title: "Late Submissions",
      count: summary.lateSubmissions,
      description: `${summary.lateSubmissions || 0} grade issues recorded in the ${windowLabel}`
    },
    {
      id: "coaching_missed",
      title: "Coaching Missed Meetings",
      count: summary.coachingMissedMeetings,
      description: `${summary.coachingMissedMeetings || 0} coaching meetings missed in the ${windowLabel}`
    },
    {
      id: "alerts",
      title: "Alerts",
      count: summary.alerts,
      description: `${summary.alerts || 0} active alerts in the ${windowLabel}`
    },
    {
      id: "strikes",
      title: "Strikes",
      count: summary.strikes,
      description: `${summary.strikes || 0} strikes in the ${windowLabel}`
    }
  ];

  return rows.map((row) => ({
    ...row,
    severity: severityFromCount(row.count)
  }));
}

export default function AlertsSummaryTV({ tvTeamScope = "all", phaseId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = new URL(`${API_BASE}/api/tv/alerts-summary`, window.location.origin);
        if (phaseId) url.searchParams.set("phase", phaseId);
        if (tvTeamScope !== "all" && tvTeamScope) url.searchParams.set("teamId", tvTeamScope);
        const res = await fetch(url.toString());
        const data = await res.json().catch(() => null);
        if (!cancelled) setSummary(res.ok ? data : null);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phaseId, tvTeamScope]);

  const data = useMemo(() => {
    const items = buildItems(summary);
    return {
      phase: displayTermLabel(summary?.phaseName, "Term"),
      scope: summary?.scope || "All Teams",
      items
    };
  }, [summary]);
  const activeScopeLabel = data.scope || "All Teams";

  return (
    <div className="tvPanel alertsSummaryPanel">
      <div className="tvPanelTitle">Alerts</div>

      <div className="alertsSummaryColumns">
        <div className="alertsTeamList">
          {STATIC_TEAM_LIST.map((team) => (
            <div
              key={team.id}
              className={`alertsTeamItem ${team.label === activeScopeLabel ? "active" : ""}`}
            >
              {team.label}
            </div>
          ))}
        </div>

        <div className="alertsDetail">
          <div className="alertsDetailHeader">
            <div className="alertsDetailTitle">{data.phase}</div>
            <div className="alertsDetailScope">{data.scope}</div>
          </div>

          {loading ? (
            <div className="emptyState">Loading alerts...</div>
          ) : !data.items.length ? (
            <div className="emptyState">No alerts data available.</div>
          ) : (
            <div className="alertsDetailList">
              {data.items.map((item, idx) => (
                <div key={item.id} className="alertsDetailRow">
                  <div className="alertsItemRow">
                    <span
                      className="alertsDot"
                      style={{ background: SEVERITY_DOT[item.severity] || "#6B7280" }}
                    />
                    <div className="alertsItemText">
                      <div className="alertsItemTitle">{item.title}</div>
                      <div className="alertsItemDesc">{item.description}</div>
                    </div>
                  </div>
                  {idx < data.items.length - 1 && <div className="alertsDivider" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
