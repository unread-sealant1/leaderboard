import { useEffect, useState } from "react";
import { api } from "../../auth/api";
import Modal from "../../pages/admin/Modal";

export default function TvNotificationsAdmin() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState("");

  async function load() {
    const data = await api("/api/messages");
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    load().catch(() => {
      setRows([]);
      setFeedback("Failed to load notifications.");
    });
  }, []);

  async function create() {
    setFeedback("");
    await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({ severity, title, body })
    });
    setOpen(false);
    setTitle("");
    setBody("");
    setSeverity("info");
    await load();
    setFeedback("Notification published.");
  }

  async function toggle(id) {
    setFeedback("");
    await api(`/api/messages/${id}/toggle`, { method: "PUT" });
    await load();
  }

  async function remove(id) {
    setFeedback("");
    await api(`/api/messages/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="commentAdminCard">
      <div className="commentAdminTitle">Notifications</div>
      <div className="panelSub">
        Publish announcement cards for the TV notification screen.
      </div>
      <div className="commentActions" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button className="primaryBtn" type="button" onClick={() => setOpen(true)}>
          New Notification
        </button>
      </div>
      {feedback ? <div className="smallMeta">{feedback}</div> : null}

      <div className="table" style={{ marginTop: 12 }}>
        <div className="tr head">
          <div>Severity</div>
          <div>Title</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {rows.map((row) => (
          <div className="tr" key={row.id}>
            <div><span className={`badge ${row.severity}`}>{row.severity}</span></div>
            <div>
              <div style={{ fontWeight: 900 }}>{row.title}</div>
              <div style={{ color: "#6B778C" }}>{row.body}</div>
            </div>
            <div>{row.is_active ? "Active" : "Hidden"}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="softBtn" type="button" onClick={() => toggle(row.id)}>
                {row.is_active ? "Hide" : "Show"}
              </button>
              <button className="secondaryBtn" type="button" onClick={() => remove(row.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} title="New Notification" onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>Severity</label>
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <label>Title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Announcement title"
          />
          <label>Body</label>
          <input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Announcement details"
          />
          <div className="formRowActions">
            <button className="secondaryBtn" type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button className="primaryBtn" type="button" disabled={!title.trim() || !body.trim()} onClick={create}>
              Publish
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
