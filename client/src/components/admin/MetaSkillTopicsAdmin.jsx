import React, { useState } from "react";
import {
  loadMetaSkillTopics,
  addMetaSkillTopic,
  deleteMetaSkillTopic
} from "../../lib/metaSkillTopicsStore";
import "../../styles/admin.css";

export default function MetaSkillTopicsAdmin() {
  const [topics, setTopics] = useState(() => loadMetaSkillTopics());
  const [title, setTitle] = useState("");

  const onAdd = () => {
    const next = addMetaSkillTopic(title);
    setTopics(next);
    setTitle("");
  };

  const onDelete = (id) => {
    setTopics(deleteMetaSkillTopic(id));
  };

  return (
    <div className="metaTopicsCard">
      <div className="metaTopicsTitle">Meta Skills Topics</div>
      <div className="metaTopicsSub">Add or remove topics shown in Meta Skills.</div>

      <div className="metaTopicsForm">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a topic (e.g., Leadership)"
        />
        <button className="primaryBtn" onClick={onAdd} disabled={!title.trim()}>
          Add Topic
        </button>
      </div>

      <div className="metaTopicsList">
        {topics.length === 0 ? (
          <div className="metaTopicsEmpty">No topics yet.</div>
        ) : (
          topics.map((t) => (
            <div key={t.id} className="metaTopicsItem">
              <div className="metaTopicsName">{t.title}</div>
              <button className="secondaryBtn" onClick={() => onDelete(t.id)}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
