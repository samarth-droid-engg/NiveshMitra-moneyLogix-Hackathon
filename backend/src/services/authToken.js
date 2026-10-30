import crypto from "crypto";
import { getUserAuthVersion } from "./store.js";

const secret = process.env.AUTH_SECRET || "local-demo-auth-secret";
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
) {
  throw new Error("AUTH_SECRET must be at least 32 characters in production.");
}
const configuredTtl = Number(process.env.AUTH_TOKEN_TTL_SECONDS);
const TOKEN_TTL_SECONDS = Number.isFinite(configuredTtl) && configuredTtl >= 900
  ? Math.min(configuredTtl, 30 * 24 * 60 * 60)
  : process.env.NODE_ENV === "production"
    ? 24 * 60 * 60
    : 7 * 24 * 60 * 60;
export const AUTH_COOKIE = "nm_auth";

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function createAuthSession(email, authVersion = 0) {
  const payload = {
    email: String(email).trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    csrf: crypto.randomBytes(24).toString("base64url"),
    ver: Number(authVersion || 0),
  };
  const body = encode(payload);
  return { token: `${body}.${sign(body)}`, csrfToken: payload.csrf };
}

export function createAuthToken(email) {
  return createAuthSession(email).token;
}

export async function requireAuth(req, res, next) {
  const cookieToken = parseCookies(req.headers.cookie || "")[AUTH_COOKIE];
  const token = cookieToken || "";
  const [body, signature] = token?.split(".") || [];
  if (!body || !signature) {
    return res.status(401).json({ error: "Authentication is required." });
  }

  const expected = sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  const validSignature =
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);

  if (!validSignature) {
    return res.status(401).json({ error: "Authentication is required." });
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      !payload.email ||
      !payload.csrf ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return res.status(401).json({ error: "Your session has expired." });
    }
    const currentVersion = await getUserAuthVersion(payload.email);
    if (currentVersion == null || currentVersion !== Number(payload.ver || 0)) {
      return res.status(401).json({ error: "Your session is no longer valid." });
    }
    req.auth = payload;
    return next();
  } catch (error) {
    if (error?.status === 503) {
      return res.status(503).json({ error: "Authentication service is temporarily unavailable." });
    }
    return res.status(401).json({ error: "Authentication is required." });
  }
}

export function requireCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const supplied = req.get("x-csrf-token") || "";
  const expected = req.auth?.csrf || "";
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  const valid =
    suppliedBuffer.length > 0 &&
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
  if (!valid) {
    return res.status(403).json({ error: "Invalid CSRF token." });
  }
  return next();
}

export function authenticatedEmail(req) {
  return req.auth?.email || null;
}

export function authCookieOptions() {
  const configuredSameSite = String(process.env.AUTH_COOKIE_SAMESITE || "").toLowerCase();
  const sameSite = ["lax", "strict", "none"].includes(configuredSameSite)
    ? configuredSameSite
    : process.env.NODE_ENV === "production"
      ? "none"
      : "lax";
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/",
  };
}

export function serializeAuthCookie(token, options = authCookieOptions()) {
  const parts = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    `Max-Age=${Math.floor((options.maxAge || 0) / 1000)}`,
    `Path=${options.path || "/"}`,
    "HttpOnly",
    `SameSite=${options.sameSite || "lax"}`,
  ];
  if (options.secure) parts.push("Secure");
  parts.push("Priority=High");
  return parts.join("; ");
}

function parseCookies(value) {
  const cookies = {};
  for (const part of value.split(";")) {
    const [key, ...segments] = part.trim().split("=");
    if (!key || !segments.length) continue;
    try {
      cookies[key] = decodeURIComponent(segments.join("="));
    } catch {
      // Ignore malformed cookies instead of failing the entire request.
    }
  }
  return cookies;
}
