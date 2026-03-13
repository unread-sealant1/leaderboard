import React from "react";
import MetaSkillsGrid from "./MetaSkillsGrid";
import MetaSkillCommentsTV from "./MetaSkillCommentsTV";

export default function MetaSkillAreas1Screen({ data, phaseId }) {
  return (
    <div className="tvMetaStack">
      <MetaSkillsGrid subtitle="Meta Skill Areas" data={data} />
      <MetaSkillCommentsTV phaseId={phaseId} teamId="" stream="meta" skillKey="general" />
    </div>
  );
}
