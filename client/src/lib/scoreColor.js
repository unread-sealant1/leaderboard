export function scoreBand(pct) {
  const v = Number(pct);
  if (Number.isNaN(v)) return "neutral";
  if (v >= 80) return "good";
  if (v >= 65) return "warn";
  return "bad";
}

export function scoreColors(pct) {
  const band = scoreBand(pct);
  if (band === "good") {
    return { ring: "#22C55E", bg: "#DCFCE7", text: "#14532D" };
  }
  if (band === "warn") {
    return { ring: "#F59E0B", bg: "#FEF3C7", text: "#92400E" };
  }
  if (band === "bad") {
    return { ring: "#EF4444", bg: "#FEE2E2", text: "#7F1D1D" };
  }
  return { ring: "#94A3B8", bg: "#F1F5F9", text: "#334155" };
}
