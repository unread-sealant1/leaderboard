import React, { useEffect, useState } from "react";
import "../../styles/tv.css";

const BASE = import.meta.env.VITE_API_URL || "";

export default function MetaSkillCommentsTV({
  phaseId,
  teamId = "",
  stream = "meta",
  skillKey = "general",
  limit = 1
}) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = new URL(`${BASE}/api/stream-comments/public`, window.location.origin);
        if (phaseId) url.searchParams.set("phaseId", phaseId);
        if (teamId) url.searchParams.set("teamId", teamId);
        if (stream) url.searchParams.set("stream", stream);
        if (skillKey) url.searchParams.set("skillKey", skillKey);
        url.searchParams.set("limit", String(limit));

        const response = await fetch(url.toString());
        const data = await response.json().catch(() => []);
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setItems([]);
      }
    }

    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phaseId, teamId, stream, skillKey, limit]);

  if (!items.length) return null;
  const comment = items[0];

  return (
    <div className="tvComment">
      <div className="tvCommentLabel">Comment</div>
      <div className="tvCommentText">{comment.body}</div>
      <div className="tvCommentMeta">
        {(comment.author_name || "Admin")} - {new Date(comment.updated_at || comment.created_at).toLocaleString()}
      </div>
    </div>
  );
}
