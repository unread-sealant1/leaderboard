import React from "react";
import "../../styles/tv.css";

export default function CommentsScreen({ comments = [] }) {
  const items = Array.isArray(comments) ? comments.slice(0, 4) : [];

  return (
    <div className="tvInfoScreen">
      <div className="tvInfoHeader">
        <div className="tvInfoTitle">Comments</div>
        <div className="tvInfoSub">Shared cohort and team feedback</div>
      </div>

      {!items.length ? (
        <div className="tvEmpty">No active comments.</div>
      ) : (
        <div className="tvInfoList">
          {items.map((comment) => (
            <div className="tvInfoCard" key={comment.id || `${comment.body}-${comment.created_at}`}>
              <div className="tvInfoCardBody">{comment.body}</div>
              <div className="tvInfoCardMeta">
                {(comment.team_name || "All Teams")} | {(comment.author_name || "Admin")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
