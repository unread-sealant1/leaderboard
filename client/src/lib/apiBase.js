const rawBase =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "https://leaderboard-7dct.onrender.com" : "http://localhost:5500");

const API_BASE = String(rawBase || "").replace(/\/+$/, "");

export default API_BASE;
