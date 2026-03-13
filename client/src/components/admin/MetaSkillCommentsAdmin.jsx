import { useEffect, useState } from "react";
import { api } from "../../auth/api";

const skillOptions = [
  { key: "general", label: "General" },
  { key: "leadership", label: "Leadership" },
  { key: "criticalThinking", label: "Critical Thinking" },
  { key: "digitalAgility", label: "Digital Agility" },
  { key: "communication", label: "Communication" },
  { key: "interpersonal", label: "Interpersonal Skills" },
  { key: "mastery", label: "Personal Mastery" }
];

function displayTermName(value) {
  return String(value || "").replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

export default function MetaSkillCommentsAdmin() {
  const [phaseId, setPhaseId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [skillKey, setSkillKey] = useState("general");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(null);
  const [comments, setComments] = useState([]);
  const [phases, setPhases] = useState([]);
  const [teams, setTeams] = useState([]);
  const [feedback, setFeedback] = useState("");

  async function loadStructure() {
    const [phaseRows, teamRows] = await Promise.all([
      api("/api/phases"),
      api("/api/teams")
    ]);
    const nextPhases = Array.isArray(phaseRows) ? phaseRows : [];
    setPhases(nextPhases);
    setTeams(Array.isArray(teamRows) ? teamRows : []);
    setPhaseId((prev) => (
      prev && nextPhases.some((item) => String(item.id) === String(prev))
        ? prev
        : (nextPhases[0]?.id || "")
    ));
  }

  async function loadComments(selectedPhaseId = phaseId, selectedTeamId = teamId, selectedSkillKey = skillKey) {
    const params = new URLSearchParams({ stream: "meta", skillKey: selectedSkillKey, limit: "100" });
    if (selectedPhaseId) params.set("phaseId", selectedPhaseId);
    if (selectedTeamId) params.set("teamId", selectedTeamId);
    const rows = await api(`/api/stream-comments?${params.toString()}`);
    setComments(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    loadStructure().catch(() => {
      setPhases([]);
      setTeams([]);
      setFeedback("Failed to load terms or teams.");
    });
  }, []);

  useEffect(() => {
    if (!phaseId) return;
    loadComments(phaseId, teamId, skillKey).catch(() => {
      setComments([]);
      setFeedback("Failed to load comments.");
    });
  }, [phaseId, teamId, skillKey]);

  async function onSave() {
    const trimmed = text.trim();
    if (!trimmed || !phaseId) return;

    setFeedback("");
    try {
      if (editing?.id) {
        await api(`/api/stream-comments/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({
            phaseId,
            teamId: teamId || null,
            stream: "meta",
            skillKey,
            body: trimmed,
            isActive: true
          })
        });
      } else {
        await api("/api/stream-comments", {
          method: "POST",
          body: JSON.stringify({
            phaseId,
            teamId: teamId || null,
            stream: "meta",
            skillKey,
            body: trimmed,
            authorName: "Admin"
          })
        });
      }

      await loadComments(phaseId, teamId, skillKey);
      setText("");
      setEditing(null);
      setFeedback("Comment saved.");
    } catch (error) {
      setFeedback(error?.message || "Failed to save comment.");
    }
  }

  function onEdit(comment) {
    setEditing(comment);
    setText(comment.body || "");
    setPhaseId(comment.phase_id || phaseId);
    setTeamId(comment.team_id || "");
    setSkillKey(comment.skill_key || "general");
  }

  async function onDelete(id) {
    setFeedback("");
    try {
      await api(`/api/stream-comments/${id}`, { method: "DELETE" });
      await loadComments(phaseId, teamId, skillKey);
      if (editing?.id === id) {
        setEditing(null);
        setText("");
      }
      setFeedback("Comment deleted.");
    } catch (error) {
      setFeedback(error?.message || "Failed to delete comment.");
    }
  }

  return (
    <div className="commentAdminCard">
      <div className="commentAdminTitle">Comments</div>
      <div className="panelSub">
        Write shared progress comments for the selected term, team, and progress area.
      </div>

      <div className="commentFilters">
        <label>
          Term
          <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
            {phases.length ? (
              phases.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {displayTermName(phase.name)}
                </option>
              ))
            ) : (
              <option value="">No terms</option>
            )}
          </select>
        </label>

        <label>
          Team
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">All Teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Progress Area
          <select value={skillKey} onChange={(e) => setSkillKey(e.target.value)}>
            {skillOptions.map((skill) => (
              <option key={skill.key} value={skill.key}>
                {skill.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="commentBox">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a progress comment for the selected term and team..."
          maxLength={300}
        />
        <div className="commentActions">
          {editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setText("");
              }}
            >
              Cancel
            </button>
          ) : null}
          <button type="button" onClick={onSave}>{editing ? "Update" : "Save"}</button>
        </div>
      </div>

      {feedback ? <div className="smallMeta">{feedback}</div> : null}

      <div className="commentList">
        {!comments.length ? (
          <div className="commentEmpty">No comments for this term, team, or progress area.</div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="commentItem">
              <div className="commentText">{comment.body}</div>
              <div className="commentMeta">
                <span>{comment.author_name || "Admin"}</span>
                <span>-</span>
                <span>{comment.team_name || "All Teams"}</span>
                <span>-</span>
                <span>{new Date(comment.updated_at || comment.created_at).toLocaleString()}</span>
              </div>
              <div className="commentItemActions">
                <button type="button" onClick={() => onEdit(comment)}>Edit</button>
                <button type="button" onClick={() => onDelete(comment.id)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
