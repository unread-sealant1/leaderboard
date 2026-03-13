import { clearToken, getToken } from "./auth";

const BASE = import.meta.env.VITE_API_URL;

export async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearToken();
      if (typeof window !== "undefined" && window.location?.pathname?.startsWith("/admin")) {
        window.location.href = "/admin/login";
      }
    }
    const err = new Error(data.message || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
