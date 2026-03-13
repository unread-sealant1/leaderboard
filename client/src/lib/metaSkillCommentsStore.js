const KEY = "metaSkillComments:v1";

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function loadComments() {
  return safeParse(localStorage.getItem(KEY) || "[]", []);
}

export function saveComments(comments) {
  localStorage.setItem(KEY, JSON.stringify(comments));
}

export function upsertComment(comment) {
  const all = loadComments();
  const idx = all.findIndex((c) => c.id === comment.id);
  if (idx >= 0) all[idx] = comment;
  else all.unshift(comment);
  saveComments(all);
  return all;
}

export function deleteComment(id) {
  const all = loadComments().filter((c) => c.id !== id);
  saveComments(all);
  return all;
}

export function getCommentsFiltered({ weekMonday, teamId, skillKey, limit = 3 }) {
  const all = loadComments();

  return all
    .filter((c) => (weekMonday ? c.weekMonday === weekMonday : true))
    .filter((c) => (teamId === 0 || teamId ? c.teamId === teamId : true))
    .filter((c) => (skillKey ? c.skillKey === skillKey : true))
    .slice(0, limit);
}
