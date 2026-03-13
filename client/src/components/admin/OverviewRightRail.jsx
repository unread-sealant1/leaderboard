import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../auth/api";
import { runAdminFullSync } from "../../lib/adminSync";
import "../../styles/admin.css";

function RailCard({ title, children }) {
  return (
    <section className="railCard">
      <div className="railCardTitle">{title}</div>
      {children}
    </section>
  );
}

export default function OverviewRightRail() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [messages, setMessages] = useState([]);
  const [coaching, setCoaching] = useState({ sessions: [] });
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const [dashRes, messageRes, coachingRes] = await Promise.allSettled([
      api("/api/admin/dashboard"),
      api("/api/messages"),
      api("/api/coaching?days=30")
    ]);

    if (dashRes.status === "fulfilled") setDashboard(dashRes.value);
    if (messageRes.status === "fulfilled") setMessages(messageRes.value || []);
    if (coachingRes.status === "fulfilled") setCoaching(coachingRes.value || { sessions: [] });
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    function onSync() {
      load();
    }
    window.addEventListener("admin:sync", onSync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("admin:sync", onSync);
    };
  }, []);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await runAdminFullSync(api);
      await load();
    } finally {
      setSyncing(false);
    }
  }

  const notices = useMemo(
    () => (messages || []).filter((msg) => msg.is_active).slice(0, 5),
    [messages]
  );

  const coachingItems = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (coaching?.sessions || []).filter((s) => s.date >= today);
    const source = upcoming.length ? upcoming : (coaching?.sessions || []);
    return source.slice(0, 5);
  }, [coaching]);

  return (
    <div className="railGrid">
      <RailCard title="Alerts Feed">
        <div className="railList">
          {(dashboard?.alerts || []).slice(0, 5).map((alert) => (
            <div className="railListItem" key={alert.key}>
              <div>
                <div>{alert.key}</div>
                <div className="railSubtle">{alert.message}</div>
              </div>
              <span className={`railPill ${alert.level?.toLowerCase()}`}>{alert.level}</span>
            </div>
          ))}
          {!dashboard?.alerts?.length ? <div className="railSubtle">No active alerts</div> : null}
        </div>
      </RailCard>

      <RailCard title="Notice Board">
        <div className="railList">
          {notices.map((notice) => (
            <div className="railListItem" key={notice.id}>
              <div>
                <div>{notice.title}</div>
                <div className="railSubtle">{notice.body}</div>
              </div>
            </div>
          ))}
          {!notices.length ? <div className="railSubtle">No active notices</div> : null}
        </div>
      </RailCard>

      <RailCard title="Upcoming Events">
        <div className="railList">
          {coachingItems.map((session) => (
            <div className="railListItem" key={session.id}>
              <div>
                <div>Coaching Review</div>
                <div className="railSubtle">{session.name}</div>
              </div>
              <div className="railSubtle">{session.date}</div>
            </div>
          ))}
          {!coachingItems.length ? <div className="railSubtle">No coaching events</div> : null}
        </div>
      </RailCard>

      <RailCard title="Admin Actions">
        <div className="railActions">
          <button className="railActionBtn" type="button" onClick={() => navigate("/admin/students")}>Add Student</button>
          <button className="railActionBtn" type="button" onClick={() => navigate("/admin/teams")}>Create Team</button>
          <button className="railActionBtn primary" type="button" onClick={handleSyncNow} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </RailCard>
    </div>
  );
}
