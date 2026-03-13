function toPercentScale(value) {
  const v = Number(value);
  if (Number.isNaN(v)) return Number.NaN;
  if (v >= 0 && v <= 5) return (v / 5) * 100;
  return v;
}

export function scoreBand(score) {
  const v = toPercentScale(score);
  if (Number.isNaN(v)) return "neutral";
  if (v >= 80) return "good";
  if (v >= 65) return "warn";
  return "bad";
}

export function scoreColors(score) {
  const band = scoreBand(score);
  if (band === "good") return { ring: "#22C55E", bg: "#DCFCE7", avgBg: "#BBF7D0", text: "#14532D" };
  if (band === "warn") return { ring: "#F59E0B", bg: "#FEF3C7", avgBg: "#FDE68A", text: "#92400E" };
  if (band === "bad") return { ring: "#EF4444", bg: "#FEE2E2", avgBg: "#FECACA", text: "#7F1D1D" };
  return { ring: "#94A3B8", bg: "#F1F5F9", avgBg: "#E2E8F0", text: "#334155" };
}

export function scoreScaleMeta(score) {
  const v = Number(score);
  if (Number.isNaN(v)) {
    return { value: 0, isFiveScale: false, progressPct: 0, display: "-" };
  }
  const isFiveScale = v >= 0 && v <= 5;
  const progressPct = isFiveScale
    ? Math.max(0, Math.min(100, (v / 5) * 100))
    : Math.max(0, Math.min(100, v));
  const display = isFiveScale
    ? `${Number.isInteger(v) ? v : v.toFixed(1)}`
    : `${Math.round(v)}`;
  return { value: v, isFiveScale, progressPct, display };
}
