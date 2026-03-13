import React, { useMemo } from "react";
import TVCoachingWeeklyTotals from "../../pages/tv/TVCoachingWeeklyTotals";

function normalizePayload(coaching) {
  if (!coaching) return null;
  if (coaching?.teams) return coaching;

  const weeks = coaching?.weeks || [];
  const teams = {};
  if (Array.isArray(coaching?.series)) {
    coaching.series.forEach((series) => {
      teams[series.team] = (series.data || []).map((d) => ({
        week: d.week || d.date || d.label,
        total: Number(d.value ?? d.total ?? 0)
      }));
    });
  }

  return {
    topic: { name: "Coaching" },
    weeks,
    teams
  };
}

export default function CoachingTrends({ coaching }) {
  const payload = useMemo(() => normalizePayload(coaching), [coaching]);
  return <TVCoachingWeeklyTotals payload={payload} />;
}
