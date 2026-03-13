import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import PageShell from "../../components/admin/PageShell";
import Modal from "./Modal";
import "../../styles/admin.css";
import { scoreScaleMeta } from "../../lib/scoreColors";

const MAX_VISIBLE_STUDENTS = 10;
const STREAM_OPTIONS = [
  { key: "webdev", label: "Web Dev" },
  { key: "meta", label: "Meta Skills" },
  { key: "portfolio", label: "Portfolio Project" },
  { key: "all", label: "Program Average" }
];

const sortStudentsAZ = (students) =>
  [...students].sort((a, b) =>
    (a.name ?? "").trim().localeCompare((b.name ?? "").trim(), undefined, { sensitivity: "base" })
  );

function displayTermName(value) {
  return String(value || "").replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

function resolveDefaultTerm(items = []) {
  const today = new Date().toISOString().slice(0, 10);
  const current = items.find((item) => {
    const start = String(item.start_date || "").slice(0, 10);
    const end = String(item.end_date || "").slice(0, 10);
    return start && end && today >= start && today <= end;
  });
  return current?.id || items[0]?.id || "";
}

function scoreTone(score) {
  const raw = Number(score || 0);
  const v = raw <= 5 ? (raw / 5) * 100 : raw;
  if (v < 60) return "bad";
  if (v < 75) return "warn";
  return "good";
}

function formatMark(score) {
  return scoreScaleMeta(score).display;
}

function TeamNameEditable({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(name);
  }, [name]);

  async function handleSave() {
    const next = value.trim();
    if (!next) {
      setError("Team name is required.");
      return;
    }
    if (next.length > 40) {
      setError("Maximum length is 40 characters.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      setError(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="teamNameEditable">
        <span className="teamCardTitle">{name}</span>
        <button className="teamTextBtn" onClick={() => setEditing(true)} type="button">
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="teamEditWrap">
      <input
        className="teamEditInput"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={40}
        autoFocus
      />
      <button className="teamMiniBtn primary" onClick={handleSave} disabled={saving} type="button">
        {saving ? "Saving..." : "Save"}
      </button>
      <button
        className="teamMiniBtn"
        onClick={() => {
          setEditing(false);
          setValue(name);
          setError("");
        }}
        type="button"
      >
        Cancel
      </button>
      {error ? <div className="teamInlineError">{error}</div> : null}
    </div>
  );
}

function TeamCard({
  team,
  scoreLabel,
  onRenameTeam,
  onOpenAddModal,
  onRemoveStudents,
  onOpenArchiveModal,
  onOpenDeleteModal
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAll, setShowAll] = useState(false);
  const [removing, setRemoving] = useState(false);

  const students = useMemo(() => sortStudentsAZ(team.students || []), [team.students]);
  const hasOverflow = students.length > MAX_VISIBLE_STUDENTS;
  const visibleStudents = showAll ? students : students.slice(0, MAX_VISIBLE_STUDENTS);

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRemoveSelected() {
    if (!selectedIds.size) return;
    setRemoving(true);
    try {
      await onRemoveStudents(team.id, Array.from(selectedIds));
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="teamCardPanel">
      <div className="teamCardHead">
        <div className="teamCardLeft">
          <TeamNameEditable name={team.team} onSave={(name) => onRenameTeam(team.id, name)} />
          <span className="teamStudentCount">({students.length} students)</span>
          <span className="teamAvgPill">{scoreLabel}: <b>{formatMark(team.teamAvg)}</b></span>
        </div>

        <div className="teamActions">
          <button className="teamActionBtn" onClick={() => onOpenAddModal(team)} type="button">
            Add
          </button>

          {!selectMode ? (
            <button className="teamActionBtn" onClick={() => setSelectMode(true)} type="button">
              Remove
            </button>
          ) : (
            <>
              <button
                className="teamActionBtn primary"
                disabled={!selectedIds.size || removing}
                onClick={handleRemoveSelected}
                type="button"
              >
                {removing ? "Removing..." : `Remove selected (${selectedIds.size})`}
              </button>
              <button
                className="teamActionBtn"
                onClick={() => {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                }}
                type="button"
              >
                Cancel
              </button>
            </>
          )}

          <button className="teamActionBtn danger" onClick={() => onOpenArchiveModal(team)} type="button">
            Archive
          </button>
          <button className="teamActionBtn delete" onClick={() => onOpenDeleteModal(team)} type="button">
            Delete
          </button>
        </div>
      </div>

      <div className="teamsStudentsList">
        {visibleStudents.map((student) => (
          <div className={`teamsStudentRow ${selectMode ? "selectMode" : ""}`} key={student.id}>
            {selectMode ? (
              <input
                className="teamsStudentCheck"
                type="checkbox"
                checked={selectedIds.has(student.id)}
                onChange={() => toggleSelected(student.id)}
              />
            ) : (
              <span className="teamsStudentDot" />
            )}

            <div className="teamsStudentName">{student.name}</div>
            <div className="teamsStudentScore">{formatMark(student.avg)}</div>
            <div className="teamsScoreTrack">
              {(() => {
                const scale = scoreScaleMeta(student.avg);
                return (
              <div
                className={`teamsScoreFill ${scoreTone(student.avg)}`}
                style={{ width: `${scale.progressPct}%` }}
              />
                );
              })()}
            </div>
          </div>
        ))}

        {!students.length ? <div className="teamEmptyState">No students in this team.</div> : null}
      </div>

      {hasOverflow ? (
        <div className="teamCardFooter">
          <button className="teamTextBtn" onClick={() => setShowAll((prev) => !prev)} type="button">
            {showAll ? "Show less" : `View all (${students.length})`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AddStudentsModal({ open, team, students, onClose, onAdd }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuery("");
    setSelected(new Set());
  }, [team?.id, open]);

  const candidates = useMemo(() => {
    if (!team) return [];
    const q = query.trim().toLowerCase();
    const rows = (students || [])
      .filter((s) => s.status === "active")
      .filter((s) => s.team_id !== team.id)
      .map((s) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
        team: s.team_name || "Unassigned"
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    if (!q) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(q) || row.team.toLowerCase().includes(q));
  }, [students, query, team]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (!selected.size || !team) return;
    setSaving(true);
    try {
      await onAdd(team.id, Array.from(selected));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={`Add students to ${team?.team || ""}`} onClose={onClose}>
      <div className="teamsModalWrap">
        <input
          className="adminSearch"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search student..."
        />

        <div className="teamsCandidateList">
          {candidates.map((candidate) => (
            <label className="teamsCandidateRow" key={candidate.id}>
              <input
                type="checkbox"
                checked={selected.has(candidate.id)}
                onChange={() => toggle(candidate.id)}
              />
              <div>
                <div className="teamsCandidateName">{candidate.name}</div>
                <div className="teamsCandidateMeta">Current: {candidate.team}</div>
              </div>
            </label>
          ))}
          {!candidates.length ? <div className="emptyState">No matching students found.</div> : null}
        </div>

        <div className="formRowActions">
          <button className="secondaryBtn" onClick={onClose} type="button">Cancel</button>
          <button
            className="primaryBtn"
            disabled={!selected.size || saving}
            onClick={handleAdd}
            type="button"
          >
            {saving ? "Adding..." : `Add selected (${selected.size})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ArchiveTeamModal({ open, team, onClose, onArchive }) {
  const [loading, setLoading] = useState(false);

  async function confirmArchive() {
    if (!team) return;
    setLoading(true);
    try {
      await onArchive(team.id);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} title="Archive Team" onClose={onClose}>
      <div className="teamsArchiveText">
        Archive <b>{team?.team}</b>? This hides the team from active views and moves students to Unassigned.
      </div>
      <div className="formRowActions">
        <button className="secondaryBtn" onClick={onClose} type="button">Cancel</button>
        <button className="primaryBtn" disabled={loading} onClick={confirmArchive} type="button">
          {loading ? "Archiving..." : "Archive team"}
        </button>
      </div>
    </Modal>
  );
}

function DeleteTeamModal({ open, team, onClose, onDelete }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) setLoading(false);
  }, [open]);

  async function confirmDelete() {
    if (!team) return;
    setLoading(true);
    try {
      await onDelete(team.id);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} title="Delete Team" onClose={onClose}>
      <div className="teamsArchiveText">
        Delete <b>{team?.team}</b>? This permanently removes the team and unassigns students.
      </div>
      <div className="formRowActions">
        <button className="secondaryBtn" onClick={onClose} type="button">Cancel</button>
        <button className="primaryBtn dangerBtn" disabled={loading} onClick={confirmDelete} type="button">
          {loading ? "Deleting..." : "Delete team"}
        </button>
      </div>
    </Modal>
  );
}

function CreateTeamModal({ open, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setError("");
    setSaving(false);
  }, [open]);

  async function handleCreate() {
    const next = name.trim();
    if (!next) {
      setError("Team name is required.");
      return;
    }
    if (next.length > 40) {
      setError("Maximum length is 40 characters.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onCreate(next);
      onClose();
    } catch (e) {
      setError(e?.message || "Failed to create team.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Create Team" onClose={onClose}>
      <div className="teamsModalWrap">
        <label className="teamsModalLabel" htmlFor="create-team-name">Team name</label>
        <input
          id="create-team-name"
          className="teamEditInput"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="e.g. Team 5"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleCreate();
            }
          }}
        />
        {error ? <div className="teamInlineError">{error}</div> : null}

        <div className="formRowActions">
          <button className="secondaryBtn" onClick={onClose} type="button">Cancel</button>
          <button className="primaryBtn" onClick={handleCreate} disabled={saving} type="button">
            {saving ? "Creating..." : "Create team"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [students, setStudents] = useState([]);
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");
  const [stream, setStream] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [addTeam, setAddTeam] = useState(null);
  const [archiveTeam, setArchiveTeam] = useState(null);
  const [deleteTeam, setDeleteTeam] = useState(null);

  async function loadTerms() {
    const termData = await api("/api/phases");
    const nextTerms = Array.isArray(termData) ? termData : [];
    setTerms(nextTerms);
    setTermId((prev) => (
      prev && nextTerms.some((item) => String(item.id) === String(prev))
        ? prev
        : String(resolveDefaultTerm(nextTerms))
    ));
  }

  async function loadTeamsAndStudents(selectedTermId = termId, selectedStream = stream) {
    setLoading(true);
    setError("");
    try {
      const teamQuery = new URLSearchParams();
      if (selectedTermId) teamQuery.set("phaseId", selectedTermId);
      if (selectedStream) teamQuery.set("stream", selectedStream);
      const [teamData, studentData] = await Promise.all([
        api(`/api/team-performance${teamQuery.toString() ? `?${teamQuery.toString()}` : ""}`),
        api(`/api/students${selectedTermId ? `?phaseId=${encodeURIComponent(selectedTermId)}` : ""}`)
      ]);
      setTeams(teamData || []);
      setStudents(studentData || []);
    } catch (e) {
      setError(e?.message || "Failed to load teams.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTerms().catch((e) => {
      setError(e?.message || "Failed to load terms.");
      setTerms([]);
      setTermId("");
    });
  }, []);

  useEffect(() => {
    loadTeamsAndStudents(termId, stream);
  }, [termId, stream]);

  useEffect(() => {
    function handleAcademicRefresh() {
      loadTerms().catch(() => {});
      loadTeamsAndStudents(termId, stream).catch(() => {});
    }
    window.addEventListener("admin:academic-structure-updated", handleAcademicRefresh);
    window.addEventListener("admin:sync", handleAcademicRefresh);
    return () => {
      window.removeEventListener("admin:academic-structure-updated", handleAcademicRefresh);
      window.removeEventListener("admin:sync", handleAcademicRefresh);
    };
  }, [termId, stream]);

  async function handleRenameTeam(teamId, name) {
    await api(`/api/teams/${teamId}`, {
      method: "PUT",
      body: JSON.stringify({ name })
    });
    await loadTeamsAndStudents(termId, stream);
  }

  async function handleAddStudents(teamId, studentIds) {
    await api(`/api/teams/${teamId}/students`, {
      method: "POST",
      body: JSON.stringify({ studentIds })
    });
    await loadTeamsAndStudents(termId, stream);
  }

  async function handleRemoveStudents(teamId, studentIds) {
    await api(`/api/teams/${teamId}/students`, {
      method: "DELETE",
      body: JSON.stringify({ studentIds })
    });
    await loadTeamsAndStudents(termId, stream);
  }

  async function handleArchiveTeam(teamId) {
    await api(`/api/teams/${teamId}/archive`, { method: "POST", body: "{}" });
    await loadTeamsAndStudents(termId, stream);
  }

  async function handleCreateTeam(name) {
    await api("/api/teams", {
      method: "POST",
      body: JSON.stringify({ name, phaseId: termId || null })
    });
    await loadTeamsAndStudents(termId, stream);
  }

  async function handleDeleteTeam(teamId) {
    await api(`/api/teams/${teamId}`, { method: "DELETE" });
    await loadTeamsAndStudents(termId, stream);
  }

  const selectedStreamLabel = STREAM_OPTIONS.find((option) => option.key === stream)?.label || "Program Average";

  return (
    <PageShell
      title="Teams"
      subtitle="Students per team with stream-specific team averages and term filtering."
      actions={(
        <>
          <div className="filterField compact">
            <span className="filterFieldLabel">Term</span>
            <select
              className="chipSelect adminSelect"
              value={termId}
              onChange={(event) => setTermId(event.target.value)}
            >
              {terms.length ? (
                terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {displayTermName(term.name)}
                  </option>
                ))
              ) : (
                <option value="">No terms</option>
              )}
            </select>
          </div>
          <button className="primaryBtn" onClick={() => setCreateTeamOpen(true)} type="button">
            Create Team
          </button>
        </>
      )}
    >
      {error ? <div className="adminError">{error}</div> : null}
      {loading ? <div className="adminLoading">Loading teams...</div> : null}

      <div className="pillRow">
        {STREAM_OPTIONS.map((option) => (
          <button
            key={option.key}
            className={`pill ${stream === option.key ? "pillActive" : ""}`}
            onClick={() => setStream(option.key)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="teamsGrid">
        {teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            scoreLabel={selectedStreamLabel}
            onRenameTeam={handleRenameTeam}
            onOpenAddModal={setAddTeam}
            onRemoveStudents={handleRemoveStudents}
            onOpenArchiveModal={setArchiveTeam}
            onOpenDeleteModal={setDeleteTeam}
          />
        ))}
        {!loading && !teams.length ? <div className="emptyState">No active teams found.</div> : null}
      </div>

      <AddStudentsModal
        open={Boolean(addTeam)}
        team={addTeam}
        students={students}
        onClose={() => setAddTeam(null)}
        onAdd={handleAddStudents}
      />

      <CreateTeamModal
        open={createTeamOpen}
        onClose={() => setCreateTeamOpen(false)}
        onCreate={handleCreateTeam}
      />

      <ArchiveTeamModal
        open={Boolean(archiveTeam)}
        team={archiveTeam}
        onClose={() => setArchiveTeam(null)}
        onArchive={handleArchiveTeam}
      />

      <DeleteTeamModal
        open={Boolean(deleteTeam)}
        team={deleteTeam}
        onClose={() => setDeleteTeam(null)}
        onDelete={handleDeleteTeam}
      />
    </PageShell>
  );
}
