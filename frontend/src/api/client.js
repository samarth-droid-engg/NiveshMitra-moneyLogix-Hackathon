// Vite proxies /api to localhost in development. In production, VITE_API_URL
// should point to the Render backend and requests use secure HTTP-only cookies.
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = 15_000;
const CHAT_TIMEOUT_MS = 45_000;
const inflightGets = new Map();
let csrfToken = "";

export class ApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function rememberCsrf(response) {
  if (typeof response?.csrfToken === "string") csrfToken = response.csrfToken;
  return response;
}

async function execute(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = window.setTimeout(() => controller.abort("timeout"), timeoutMs);
  const externalSignal = options.signal;
  const abortFromExternal = () => controller.abort(externalSignal.reason);
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken
      ? { "X-CSRF-Token": csrfToken }
      : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${API_BASE}/api${path}`, {
      credentials: "include",
      ...options,
      method,
      headers,
      signal: controller.signal,
    });
    const body = response.status === 204
      ? null
      : await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) csrfToken = "";
      const friendly = {
        401: "Please sign in again to continue.",
        403: body?.error === "Invalid CSRF token."
          ? "Your session security token expired. Please sign in again."
          : "You do not have access to that information.",
        404: "That information is no longer available.",
        409: body?.error || "That request is already being processed.",
        429: "Too many requests. Please wait a moment and try again.",
        503: body?.error || "NiveshMitra is temporarily unavailable. Please retry shortly.",
      };
      throw new ApiError(
        friendly[response.status] || body?.error || "Something went wrong. Please try again.",
        { status: response.status, body },
      );
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError("The request took too long. Please try again.", {
        status: 408,
      });
    }
    throw new ApiError("We could not reach NiveshMitra. Please try again.");
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

function req(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" || options.dedupe === false) return execute(path, options);
  const key = `${API_BASE}/api${path}`;
  if (inflightGets.has(key)) return inflightGets.get(key);
  const promise = execute(path, options).finally(() => inflightGets.delete(key));
  inflightGets.set(key, promise);
  return promise;
}

export const api = {
  sendMessage: ({ conversationId = null, message, thinkMode = false, requestId }) =>
    req("/chat", {
      method: "POST",
      headers: { "X-Request-ID": requestId },
      body: JSON.stringify({ conversationId, message, thinkMode }),
      timeoutMs: CHAT_TIMEOUT_MS,
    }),
  getConversations: (options = {}) => req("/chat", options),
  getHistory: (conversationId, options = {}) =>
    req(`/profile/${encodeURIComponent(conversationId)}/history`, options),
  getPlan: (conversationId, options = {}) =>
    req(`/plan/${encodeURIComponent(conversationId)}`, options),
  getProfile: (conversationId, options = {}) =>
    req(`/profile/${encodeURIComponent(conversationId)}`, options),
  health: () => req("/health"),
  session: async () => rememberCsrf(await req("/auth/session")),
  login: async (email, password) =>
    rememberCsrf(
      await req("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    ),
  register: async (email, password) =>
    rememberCsrf(
      await req("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    ),
  googleLogin: async (credential) =>
    rememberCsrf(
      await req("/auth/google", {
        method: "POST",
        body: JSON.stringify({ credential }),
      }),
    ),
  logout: async () => {
    const result = await req("/auth/logout", { method: "POST" });
    csrfToken = "";
    return result;
  },
  saveBasicInfo: (info) =>
    req("/auth/basic-info", {
      method: "POST",
      body: JSON.stringify(info),
    }),
};
