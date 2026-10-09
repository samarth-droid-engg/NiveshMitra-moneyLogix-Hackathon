// Tiny fetch wrapper. Vite proxies /api -> backend:5000 in dev.
// In production on Vercel, set VITE_API_URL to your Render backend URL (e.g. https://niveshmitra-backend.onrender.com)

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function req(path, options = {}) {
  let res;
  const token = localStorage.getItem("nm_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      credentials: "include",
      ...options,
      headers,
    });
  } catch (error) {
    console.error("API request failed:", path, error);
    throw new Error("We could not reach NiveshMitra. Please try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const friendly = {
      401: "Please sign in again to continue.",
      403: "You do not have access to that information.",
      404: "That information is no longer available.",
      429: "Too many requests. Please wait a moment and try again.",
    };
    console.error("API error:", path, res.status, body);
    throw new Error(
      friendly[res.status] ||
        body.error ||
        "Something went wrong. Please try again.",
    );
  }
  if (res.status === 204) return null;
  return res.json().catch(() => ({}));
}

export const api = {
  sendMessage: ({ email, conversationId = null, message, thinkMode = false }) =>
    req("/chat", {
      method: "POST",
      body: JSON.stringify({ email, conversationId, message, thinkMode }),
    }),
  getConversations: () => req("/chat"),
  getHistory: (conversationId, email) =>
    req(
      `/profile/${encodeURIComponent(conversationId)}/history?email=${encodeURIComponent(email)}`,
    ),
  getPlan: (conversationId, email) =>
    req(
      `/plan/${encodeURIComponent(conversationId)}?email=${encodeURIComponent(email)}`,
    ),
  getProfile: (conversationId, email) =>
    req(
      `/profile/${encodeURIComponent(conversationId)}?email=${encodeURIComponent(email)}`,
    ),
  health: () => req("/health"),
  login: async (email, password) => {
    const res = await req("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res?.token) localStorage.setItem("nm_token", res.token);
    return res;
  },
  register: async (email, password) => {
    const res = await req("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res?.token) localStorage.setItem("nm_token", res.token);
    return res;
  },
  googleLogin: async (credential) => {
    const res = await req("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    if (res?.token) localStorage.setItem("nm_token", res.token);
    return res;
  },
  logout: async () => {
    localStorage.removeItem("nm_token");
    return req("/auth/logout", { method: "POST" });
  },
  saveBasicInfo: (email, info) =>
    req("/auth/basic-info", {
      method: "POST",
      body: JSON.stringify({ email, ...info }),
    }),
};
