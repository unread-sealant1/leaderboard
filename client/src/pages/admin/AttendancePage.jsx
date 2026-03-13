import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import PageShell from "../../components/admin/PageShell";
import "../../styles/admin.css";

const sortStudentsAZ = (rows) =>
  [...rows].sort((a, b) =>
    (a.name ?? "").trim().localeCompare((b.name ?? "").trim(), undefined, { sensitivity: "base" })
  );

export default function AttendancePage() {
  const [days, setDays] = useState(14);
  const [summary, setSummary] = useState({ present: 0, late: 0, absent: 0, rate: 0 });
  const [students, setStudents] = useState([]);
  const [q, setQ] = useState("");
  const cols = "1.6fr 0.6fr 0.6fr 0.6fr 0.6fr";

  useEffect(() => {
    (async () => {
      const data = await api(`/api/attendance?days=${days}`);
      setSummary(data.summary || { present: 0, late: 0, absent: 0, rate: 0 });
      setStudents(data.students || []);
    })();
  }, [days]);

  const filtered = useMemo(() => {
    const x = q.trim().toLowerCase();
    const base = !x ? students : students.filter((s) => s.name.toLowerCase().includes(x));
    return sortStudentsAZ(base);
  }, [students, q]);

  return (
    <PageShell
      title="Attendance"
      subtitle="Rolling attendance view by student."
      actions={(
        <>
          <input
            className="adminSearch"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search student..."
          />
          <select className="chipSelect" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
          </select>
        </>
      )}
    >
      <div className="kpiGrid">
        <div className="kpiCard">
          <div className="kpiLabel">Present</div>
          <div className="kpiValue">{summary.present}</div>
          <div className="kpiNote">Last {days} days</div>
        </div>
        <div className="kpiCard">
          <div className="kpiLabel">Late</div>
          <div className="kpiValue">{summary.late}</div>
          <div className="kpiNote">Last {days} days</div>
        </div>
        <div className="kpiCard">
          <div className="kpiLabel">Absent</div>
          <div className="kpiValue">{summary.absent}</div>
          <div className="kpiNote">Last {days} days</div>
        </div>
        <div className="kpiCard">
          <div className="kpiLabel">Attendance Rate</div>
          <div className="kpiValue">{summary.rate}</div>
          <div className="kpiNote">Present / total</div>
        </div>
      </div>

      <div className="panel">
        <div className="panelTitle">Student attendance</div>
        <div className="panelSub">{filtered.length} students</div>

        <div className="table">
          <div className="tr head" style={{ gridTemplateColumns: cols }}>
            <div>Name</div><div>Present</div><div>Late</div><div>Absent</div><div>Rate</div>
          </div>
          {filtered.map(s => (
            <div className="tr" key={s.id} style={{ gridTemplateColumns: cols }}>
              <div>{s.name}</div>
              <div>{s.present}</div>
              <div>{s.late}</div>
              <div>{s.absent}</div>
              <div>{s.rate}</div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
