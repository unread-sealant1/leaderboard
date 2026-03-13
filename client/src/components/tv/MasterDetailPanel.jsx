import React, { useEffect, useMemo, useState } from "react";
import "../../styles/tv.css";

export default function MasterDetailPanel({
  title,
  data,
  severityStyles,
  emptyLabel = "No data available."
}) {
  const items = data?.items || [];
  const [activeId, setActiveId] = useState(items[0]?.id || "");

  useEffect(() => {
    setActiveId(items[0]?.id || "");
  }, [items]);

  const active = useMemo(() => {
    return items.find((item) => item.id === activeId) || items[0];
  }, [items, activeId]);

  if (!items.length) {
    return <div className="tvEmpty">{emptyLabel}</div>;
  }

  return (
    <div className="tvAlertsPanel">
      <div className="tvAlertsMaster">
        <div className="tvAlertsColumnTitle">{data?.scope || "Scope"}</div>
        <div className="tvAlertsPills">
          {items.map((item) => {
            const style = (severityStyles && severityStyles[item.severity]) || { bg: "#E2E8F0", text: "#0B1220" };
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                className={`tvAlertPill ${isActive ? "active" : ""}`}
                style={{ background: style.bg, color: style.text }}
                onClick={() => setActiveId(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tvAlertsDetail">
        <div className="tvAlertsColumnTitle">{data?.phase || title}</div>
        <div className="tvAlertDetailTitle">{active?.label}</div>
        <ul className="tvAlertDetailList">
          {active?.summary ? <li>{active.summary}</li> : null}
          {(active?.details || []).map((detail, idx) => (
            <li key={`${active.id}-detail-${idx}`}>{detail}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
