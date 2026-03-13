import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import PageShell from "../../components/admin/PageShell";
import "../../styles/admin.css";

export default function CoachingPage() {
  const [days, setDays] = useState(42);
  const [summary, setSummary] = useState({ total: 0, attended: 0, missed: 0, missedRate: 0 });
  const [sessions, setSessions] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const data = await api(`/api/coaching?days=${days}`);
      setSummary(data.summary || { total: 0, attended: 0, missed: 0, missedRate: 0 });
      setSessions(data.sessions || []);
    })();
  }, [days]);

  const filtered = useMemo(() => {
    const x = q.trim().toLowerCase();
    if (!x) return sessions;
    return sessions.filter(s => s.name.toLowerCase().includes(x));
  }, [sessions, q]);

  return (
    <PageShell
      title="Coaching"
      subtitle="Coaching sessions and missed rate."
      actions={(
        <>
          <input
            className="adminSearch"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search student..."
          />
          <select className="chipSelect" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={42}>Last 6 weeks</option>
            <option value={84}>Last 12 weeks</option>
            <option value={120}>Last 120 days</option>
          </select>
        </>
      )}
    >
      <div className="kpiGrid">
        <div className="kpiCard">
          <div className="kpiLabel">Total Sessions</div>
          <div className="kpiValue">{summary.total}</div>
          <div className="kpiNote">Last {days} days</div>
        </div>
        <div className="kpiCard">
          <div className="kpiLabel">Attended</div>
          <div className="kpiValue">{summary.attended}</div>
          <div className="kpiNote">Present</div>
        </div>
        <div className="kpiCard">
          <div className="kpiLabel">Missed</div>
          <div className="kpiValue">{summary.missed}</div>
          <div className="kpiNote">Did not attend</div>
        </div>
        <div className="kpiCard">
          <div className="kpiLabel">Missed Rate</div>
          <div className="kpiValue">{summary.missedRate}</div>
          <div className="kpiNote">Missed / total</div>
        </div>
      </div>

      <div className="panel">
        <div className="panelTitle">Session list</div>
        <div className="panelSub">{filtered.length} sessions</div>

        <div className="table">
          <div className="tr head" style={{ gridTemplateColumns: "0.8fr 1.6fr 0.8fr" }}>
            <div>Date</div><div>Student</div><div>Status</div>
          </div>
          {filtered.map(s => (
            <div className="tr" key={s.id} style={{ gridTemplateColumns: "0.8fr 1.6fr 0.8fr" }}>
              <div>{s.date}</div>
              <div>{s.name}</div>
              <div>{s.attended ? "Attended" : "Missed"}</div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
