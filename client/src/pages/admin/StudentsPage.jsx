import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../auth/api";
import Modal from "./Modal";
import PageShell from "../../components/admin/PageShell";
import "../../styles/admin.css";

const sortStudentsAZ = (rows) =>
  [...rows].sort((a, b) => {
    const aName = `${a.first_name || ""} ${a.last_name || ""}`.trim();
    const bName = `${b.first_name || ""} ${b.last_name || ""}`.trim();
    return aName.localeCompare(bName, undefined, { sensitivity: "base" });
  });

function statusBadge(status) {
  if (status === "active") return { label: "Active", tone: "success" };
  if (status === "deactivated") return { label: "Deactivated", tone: "neutral" };
  if (status === "inactive") return { label: "Inactive", tone: "neutral" };
  if (status === "dropped_out") return { label: "Dropped out", tone: "neutral" };
  if (status === "archived") return { label: "Archived", tone: "archived" };
  if (status === "deleted") return { label: "Deleted", tone: "archived" };
  return { label: status || "Unknown", tone: "neutral" };
}

function isDreamClassStudent(student) {
  return String(student?.external_source || "").toLowerCase() === "dreamclass";
}

export default function StudentsPage() {
  const [searchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [busyId, setBusyId] = useState("");
  const [syncingStudents, setSyncingStudents] = useState(false);
  const [syncSummary, setSyncSummary] = useState("");

  const [open, setOpen] = useState(false);
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState("");

  async function load() {
    const [s, t] = await Promise.all([api("/api/students"), api("/api/teams")]);
    setStudents(s);
    setTeams(t);
    if (!teamId && t[0]?.id) setTeamId(t[0].id);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setQ(searchParams.get("q") || "");
  }, [searchParams]);

  const filtered = useMemo(() => {
    const x = q.trim().toLowerCase();
    const base = !x ? students : students.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(x) ||
      (s.email || "").toLowerCase().includes(x) ||
      (s.team_name || "").toLowerCase().includes(x)
    );
    return sortStudentsAZ(base);
  }, [students, q]);

  async function addStudent() {
    await api("/api/students", {
      method: "POST",
      body: JSON.stringify({ firstName, lastName, email: email || null, teamId: teamId || null })
    });
    setOpen(false);
    setFirst(""); setLast(""); setEmail("");
    await load();
  }

  async function updateStudentStatus(studentId, nextStatus) {
    const s = students.find(x => x.id === studentId);
    if (!s) return;
    setBusyId(studentId);
    try {
      await api(`/api/students/${studentId}`, {
        method: "PUT",
        body: JSON.stringify({
          firstName: s.first_name,
          lastName: s.last_name,
          email: s.email,
          teamId: s.team_id || null,
          status: nextStatus
        })
      });
      await load();
    } finally {
      setBusyId("");
    }
  }

  async function archiveStudent(studentId) {
    await updateStudentStatus(studentId, "archived");
  }

  async function syncStudentsFromDreamClass() {
    setSyncingStudents(true);
    setSyncSummary("");
    try {
      const result = await api("/api/integrations/dreamclass/sync/students", {
        method: "POST",
        body: JSON.stringify({})
      });

      await load();
      window.dispatchEvent(new Event("admin:sync"));

      if (result?.configured === false) {
        setSyncSummary("DreamClass not configured.");
        return;
      }

      const created = Number(result?.created || 0);
      const updated = Number(result?.updated || 0);
      const fetched = Number(result?.fetched || 0);
      const removed = Number(result?.deleted || 0);
      const deactivated = Number(result?.deactivated || 0);
      setSyncSummary(
        `Synced students: ${created} new, ${updated} updated, ${deactivated} deactivated, ${removed} removed from active app view (${fetched} received).`
      );
    } catch (error) {
      setSyncSummary(error?.message || "Student sync failed.");
    } finally {
      setSyncingStudents(false);
    }
  }

  return (
    <PageShell
      title="Students"
      subtitle="Manage active students and assign teams."
      actions={(
        <>
          <input
            className="adminSearch"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search student..."
          />
          <button
            className="chipBtn"
            onClick={syncStudentsFromDreamClass}
            disabled={syncingStudents}
            type="button"
          >
            {syncingStudents ? "Syncing Students..." : "Sync Students"}
          </button>
          <button className="primaryBtn" onClick={() => setOpen(true)}>Add Student</button>
        </>
      )}
    >
      <div className="panel">
        <div className="panelTitle">Student list</div>
        <div className="panelSub">
          {filtered.length} students
          {syncSummary ? ` - ${syncSummary}` : ""}
        </div>

        <div className="table">
          <div className="tr head" style={{ gridTemplateColumns: "1.2fr 1.2fr 0.8fr 1.2fr" }}>
            <div>Name</div><div>Email</div><div>Active</div><div>Actions</div>
          </div>
          {filtered.map(s => (
            <div className="tr" key={s.id} style={{ gridTemplateColumns: "1.2fr 1.2fr 0.8fr 1.2fr" }}>
              <div>{s.first_name} {s.last_name}</div>
              <div>{s.email || "-"}</div>
              <div>
                <span className={`badge ${statusBadge(s.status).tone}`}>{statusBadge(s.status).label}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={s.status === "archived" ? "archived" : (s.status || "active")}
                  onChange={(e) => updateStudentStatus(s.id, e.target.value)}
                  disabled={busyId === s.id || isDreamClassStudent(s)}
                  className="adminSelect"
                >
                  <option value="active">Active</option>
                  <option value="deactivated">Deactivated</option>
                  <option value="inactive">Inactive</option>
                  <option value="dropped_out">Dropped out</option>
                  {s.status === "archived" ? <option value="archived">Archived</option> : null}
                </select>
                <button
                  className="secondaryBtn"
                  onClick={() => archiveStudent(s.id)}
                  disabled={busyId === s.id || s.status === "archived" || isDreamClassStudent(s)}
                >
                  Archive
                </button>
                {isDreamClassStudent(s) ? <span className="topicMeta">DreamClass controlled</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={open} title="Add Student" onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>First name</label>
          <input value={firstName} onChange={(e) => setFirst(e.target.value)} />
          <label>Last name</label>
          <input value={lastName} onChange={(e) => setLast(e.target.value)} />
          <label>Email (optional)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Team</label>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="formRowActions">
            <button className="secondaryBtn" onClick={() => setOpen(false)}>Cancel</button>
            <button className="primaryBtn" disabled={!firstName.trim() || !lastName.trim()} onClick={addStudent}>
              Save
            </button>
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
