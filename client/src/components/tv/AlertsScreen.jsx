import React, { useMemo } from "react";
import MasterDetailPanel from "./MasterDetailPanel";
import "../../styles/tv.css";

function displayTermLabel(value, fallback = "Term") {
  const text = String(value || "").trim() || fallback;
  return text.replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

const SEVERITY_STYLES = {
  warning: { bg: "#F4A259", text: "#1D2939" },
  low: { bg: "#6FA8DC", text: "#0B1F33" },
  onTrack: { bg: "#A4D07B", text: "#102A14" },
  high: { bg: "#F97066", text: "#FFFFFF" }
};

function severityFromCount(count) {
  const n = Number(count || 0);
  if (n === 0) return "onTrack";
  if (n < 5) return "low";
  if (n < 15) return "warning";
  return "high";
}

function buildAlertsData({ phaseSummary, phaseLabel, scopeLabel }) {
  if (!phaseSummary) {
    return {
      phase: displayTermLabel(phaseLabel, "Term"),
      scope: scopeLabel || "All Teams",
      items: []
    };
  }
  const phase = displayTermLabel(phaseSummary.phaseName || phaseLabel, "Term");
  const scope = scopeLabel || "All Teams";
  const windowLabel = phaseSummary.windowLabel || "last month";

  const items = [
    {
      id: "late_attendance",
      label: "Late Attendance",
      count: phaseSummary.lateAttendance,
      summary: `${phaseSummary.lateAttendance || 0} students have been late to class in the ${windowLabel}`
    },
    {
      id: "missed_days",
      label: "Missed Days",
      count: phaseSummary.missedDays,
      summary: `${phaseSummary.missedDays || 0} students have missed class in the ${windowLabel}`
    },
    {
      id: "late_submissions",
      label: "Late Submissions",
      count: phaseSummary.lateSubmissions,
      summary: `${phaseSummary.lateSubmissions || 0} students submitted late in the ${windowLabel}`
    },
    {
      id: "coaching_missed",
      label: "Coaching Missed Meetings",
      count: phaseSummary.coachingMissedMeetings,
      summary: `${phaseSummary.coachingMissedMeetings || 0} coaching meetings missed in the ${windowLabel}`
    },
    {
      id: "alerts",
      label: "Alerts",
      count: phaseSummary.alerts,
      summary: `${phaseSummary.alerts || 0} students have alerts in the ${windowLabel}`
    },
    {
      id: "strikes",
      label: "Strikes",
      count: phaseSummary.strikes,
      summary: `${phaseSummary.strikes || 0} students have strikes in the ${windowLabel}`
    }
  ].map((item) => ({
    ...item,
    severity: severityFromCount(item.count),
    details: []
  }));

  return { phase, scope, items };
}

export default function AlertsScreen({ phaseSummary, phaseLabel, scopeLabel }) {
  const data = useMemo(
    () => buildAlertsData({ phaseSummary, phaseLabel, scopeLabel }),
    [phaseSummary, phaseLabel, scopeLabel]
  );

  return (
    <div className="tvPanel">
      <div className="tvPanelTitle">Alerts</div>
      <div className="tvPanelSub">Master-detail overview</div>
      <MasterDetailPanel
        title="Alerts"
        data={data}
        severityStyles={SEVERITY_STYLES}
        emptyLabel="No alerts data available."
      />
    </div>
  );
}
