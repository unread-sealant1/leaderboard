import React, { useEffect, useState } from "react";
import { api } from "../../auth/api";
import Modal from "./Modal";
import PageShell from "../../components/admin/PageShell";
import AlertsSummaryAdmin from "../../components/admin/AlertsSummaryAdmin";
import "../../styles/admin.css";

export default function AlertsPage() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function load() {
    setRows(await api("/api/messages"));
  }

  useEffect(() => { load(); }, []);

  async function create() {
    await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({ severity, title, body })
    });
    setOpen(false);
    setTitle(""); setBody(""); setSeverity("info");
    await load();
  }

  async function toggle(id) {
    await api(`/api/messages/${id}/toggle`, { method: "PUT" });
    await load();
  }

  async function remove(id) {
    await api(`/api/messages/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <PageShell
      title="Alerts"
      subtitle="Create alerts that appear on the TV screen."
      actions={<button className="primaryBtn" onClick={() => setOpen(true)}>New Message</button>}
    >
      <div className="panel">
        <div className="panelTitle">Alerts Summary</div>
        <div className="panelSub">Preview the TV alerts layout with team switching.</div>
        <AlertsSummaryAdmin />
      </div>

      <div className="panel">
        <div className="panelTitle">TV messages</div>
        <div className="panelSub">Active messages will show on the TV view.</div>

        <div className="table">
          <div className="tr head">
            <div>Severity</div><div>Title</div><div>Status</div><div>Actions</div>
          </div>
          {rows.map(r => (
            <div className="tr" key={r.id}>
              <div><span className={`badge ${r.severity}`}>{r.severity}</span></div>
              <div>
                <div style={{ fontWeight: 900 }}>{r.title}</div>
                <div style={{ color: "#6B778C" }}>{r.body}</div>
              </div>
              <div>{r.is_active ? "Active" : "Hidden"}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="softBtn" onClick={() => toggle(r.id)}>{r.is_active ? "Hide" : "Show"}</button>
                <button className="secondaryBtn" onClick={() => remove(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={open} title="New TV Message" onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>Severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <label>Body</label>
          <input value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="formRowActions">
            <button className="secondaryBtn" onClick={() => setOpen(false)}>Cancel</button>
            <button className="primaryBtn" disabled={!title.trim() || !body.trim()} onClick={create}>Publish</button>
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
