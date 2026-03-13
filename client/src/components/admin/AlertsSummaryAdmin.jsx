import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import "../../styles/admin.css";

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

function severityFromCount(count) {
  const n = Number(count || 0);
  if (n === 0) return "onTrack";
  if (n < 5) return "low";
  if (n < 15) return "warning";
  return "critical";
}

function toItems(summary) {
  if (!summary) return [];
  const windowLabel = summary.windowLabel || "last month";
  const rows = [
    ["late_attendance", "Late Attendance", summary.lateAttendance, "students have been late to class"],
    ["missed_days", "Missed Days", summary.missedDays, "students have missed class"],
    ["late_submissions", "Late Submissions", summary.lateSubmissions, "grade issues recorded"],
    ["coaching_missed", "Coaching Missed Meetings", summary.coachingMissedMeetings, "coaching meetings missed"],
    ["alerts", "Alerts", summary.alerts, "active alerts"],
    ["strikes", "Strikes", summary.strikes, "strikes recorded"]
  ];
  return rows.map(([id, title, count, suffix]) => ({
    id,
    title,
    description: `${Number(count || 0)} ${suffix} in the ${windowLabel}`,
    severity: severityFromCount(count)
  }));
}

export default function AlertsSummaryAdmin() {
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [phaseId, setPhaseId] = useState(null);
  const [phaseName, setPhaseName] = useState("Term");
  const [teams, setTeams] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tvSettings, teamRows] = await Promise.allSettled([
          api("/api/tv/settings"),
          api("/api/teams")
        ]);

        if (cancelled) return;

        if (tvSettings.status === "fulfilled") {
          const pid = tvSettings.value?.current_phase_id || null;
          setPhaseId(pid);
        }

        if (teamRows.status === "fulfilled") {
          const activeTeams = (teamRows.value || []).filter((t) => !t.is_archived);
          setTeams(activeTeams);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSummary() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (phaseId) qs.set("phase", phaseId);
        if (selectedTeam !== "all") qs.set("teamId", selectedTeam);
        const data = await api(`/api/tv/alerts-summary${qs.toString() ? `?${qs.toString()}` : ""}`);
        if (cancelled) return;
        setSummary(data);
        setPhaseName(displayTermLabel(data?.phaseName, "Term"));
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSummary();
    return () => {
      cancelled = true;
    };
  }, [phaseId, selectedTeam]);

  const teamOptions = useMemo(() => ([
    { id: "all", label: "All Teams" },
    ...teams.map((team) => ({ id: team.id, label: team.name }))
  ]), [teams]);

  const items = useMemo(() => toItems(summary), [summary]);

  return (
    <div className="alertsSummaryPanel">
      <div className="alertsSummaryColumns">
        <div className="alertsTeamList">
          {teamOptions.map((team) => (
            <button
              key={team.id}
              type="button"
              className={`alertsTeamItem ${team.id === selectedTeam ? "active" : ""}`}
              onClick={() => setSelectedTeam(team.id)}
            >
              {team.label}
            </button>
          ))}
        </div>

        <div className="alertsDetail">
          <div className="alertsDetailHeader">
            <div className="alertsDetailTitle">{phaseName}</div>
            <div className="alertsDetailScope">{summary?.scope || "All Teams"}</div>
          </div>

          {loading ? (
            <div className="emptyState">Loading alerts...</div>
          ) : !items.length ? (
            <div className="emptyState">No alerts data available.</div>
          ) : (
            <div className="alertsDetailList">
              {items.map((item, idx) => (
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
                  {idx < items.length - 1 && <div className="alertsDivider" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
