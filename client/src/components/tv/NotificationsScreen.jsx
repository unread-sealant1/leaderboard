import React from "react";
import "../../styles/tv.css";

export default function NotificationsScreen({ notifications = [] }) {
  const items = Array.isArray(notifications) ? notifications.slice(0, 5) : [];

  return (
    <div className="tvInfoScreen">
      <div className="tvInfoHeader">
        <div className="tvInfoTitle">Notifications</div>
        <div className="tvInfoSub">Latest active announcements and alerts</div>
      </div>

      {!items.length ? (
        <div className="tvEmpty">No active notifications.</div>
      ) : (
        <div className="tvInfoList">
          {items.map((item, index) => (
            <div className="tvInfoCard" key={item.id || `${item.title}-${index}`}>
              <div className={`tvInfoSeverity ${String(item.severity || "info").toLowerCase()}`}>
                {String(item.severity || "info").toUpperCase()}
              </div>
              <div className="tvInfoCardTitle">{item.title}</div>
              <div className="tvInfoCardBody">{item.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
