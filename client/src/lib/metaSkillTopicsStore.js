const KEY = "metaSkillTopics:v1";

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function loadMetaSkillTopics() {
  return safeParse(localStorage.getItem(KEY) || "[]", []);
}

export function saveMetaSkillTopics(topics) {
  localStorage.setItem(KEY, JSON.stringify(topics));
}

export function addMetaSkillTopic(title) {
  const trimmed = String(title || "").trim();
  if (!trimmed) return loadMetaSkillTopics();
  const all = loadMetaSkillTopics();
  const doc = {
    id: (crypto?.randomUUID?.() ?? String(Date.now())),
    title: trimmed,
    createdAt: new Date().toISOString()
  };
  const next = [doc, ...all];
  saveMetaSkillTopics(next);
  return next;
}

export function deleteMetaSkillTopic(id) {
  const next = loadMetaSkillTopics().filter((t) => t.id !== id);
  saveMetaSkillTopics(next);
  return next;
}
