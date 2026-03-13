import React from "react";
import PageShell from "../../components/admin/PageShell";
import MetaSkillCommentsAdmin from "../../components/admin/MetaSkillCommentsAdmin";
import TvNotificationsAdmin from "../../components/admin/TvNotificationsAdmin";
import "../../styles/admin.css";

export default function MetaSkillsPage() {
  return (
    <PageShell
      title="Comments and Notifications"
      subtitle="Use comments for progress feedback and notifications for announcements."
    >
      <div className="panel">
        <MetaSkillCommentsAdmin />
      </div>

      <div className="panel">
        <TvNotificationsAdmin />
      </div>
    </PageShell>
  );
}
