import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList
} from "recharts";

function isoWeekToMonday(weekStr) {
  const parts = String(weekStr).split("-");
  if (parts.length !== 2) return null;
  const year = Number(parts[0]);
  const week = Number(parts[1]);
  if (Number.isNaN(year) || Number.isNaN(week)) return null;
  const simple = new Date(Date.UTC(year, 0, 4));
  const day = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - (day - 1) + (week - 1) * 7);
  return monday;
}

function formatMonday(value) {
  const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!value) return "";
  if (value.includes("-") && value.split("-").length === 3) {
    const date = new Date(`${value}T00:00:00`);
    const day = String(date.getDate()).padStart(2, "0");
    const month = monthShort[date.getMonth()] || "";
    return `${day}-${month}`;
  }
  const monday = isoWeekToMonday(value);
  if (!monday) return value;
  const day = String(monday.getUTCDate()).padStart(2, "0");
  const month = monthShort[monday.getUTCMonth()] || "";
  return `${day}-${month}`;
}

function fillWeeks(weeks, teamSeries) {
  const map = new Map((teamSeries || []).map((p) => [p.week, p.total]));
  return weeks.map((w) => ({ week: w, total: map.get(w) ?? 0 }));
}

function TeamChartCard({ teamName, topicName, data }) {
  return (
    <div className="coachCard">
      <div className="coachCardHead">
        <div className="coachTeamTitle">{teamName}</div>
        <div className="coachSubtitle">{topicName} · Weekly Total</div>
      </div>

      <div className="coachChartWrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 18, right: 18, left: 0, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#eaeaea" />
            <XAxis
              dataKey="week"
              tickFormatter={formatMonday}
              tick={{ fontSize: 12, fill: "#667085" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#667085" }}
              axisLine={false}
              tickLine={false}
              width={24}
              allowDecimals={false}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#20B7C6"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            >
              <LabelList dataKey="total" position="top" fill="#20B7C6" fontSize={12} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function normalizePayload(payload) {
  const weeks = Array.isArray(payload?.weeks) ? payload.weeks.filter(Boolean) : [];
  const teams = payload?.teams || {};
  return {
    topicName: payload?.topic?.name || "Coaching",
    weeks,
    team1: fillWeeks(weeks, teams["Team 1"] || []),
    team2: fillWeeks(weeks, teams["Team 2"] || []),
    team3: fillWeeks(weeks, teams["Team 3"] || []),
    team4: fillWeeks(weeks, teams["Team 4"] || [])
  };
}

export default function TVCoachingWeeklyTotals({ payload }) {
  const safe = useMemo(() => normalizePayload(payload), [payload]);
  const hasData = safe.weeks.length > 0;

  return (
    <div className="coachPage">
      {hasData ? (
        <div className="coachGrid">
          <TeamChartCard teamName="Team 1" topicName={safe.topicName} data={safe.team1} />
          <TeamChartCard teamName="Team 2" topicName={safe.topicName} data={safe.team2} />
          <TeamChartCard teamName="Team 3" topicName={safe.topicName} data={safe.team3} />
          <TeamChartCard teamName="Team 4" topicName={safe.topicName} data={safe.team4} />
        </div>
      ) : (
        <div className="tvEmpty">No coaching trend data available.</div>
      )}
    </div>
  );
}
