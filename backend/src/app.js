import "dotenv/config";
import express from "express";
import cors from "cors";
import { isDbConnected } from "./config/db.js";
import { isMockMode, providerInfo } from "./services/llmService.js";
import chatRoutes from "./routes/chat.js";
import planRoutes from "./routes/plan.js";
import profileRoutes from "./routes/profile.js";
import authRoutes from "./routes/auth.js";

function readAllowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS || "";
  if (process.env.NODE_ENV === "production" && !configured.trim()) {
    throw new Error("ALLOWED_ORIGINS must be set when NODE_ENV=production.");
  }
  const origins = (configured || "http://localhost:3000,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (origins.includes("*")) {
    throw new Error("ALLOWED_ORIGINS cannot contain * when credentials are enabled.");
  }
  return origins;
}

export function validateProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required in production.");
  if (isMockMode()) {
    throw new Error("A valid GROQ_API_KEY is required; mock LLM mode is disabled in production.");
  }
  readAllowedOrigins();
}

function createRateLimiter({ windowMs, maxRequests, keyPrefix = "global" }) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || "unknown"}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    const current = !bucket || now >= bucket.resetAt
      ? { count: 0, resetAt: now + windowMs }
      : bucket;
    current.count += 1;
    buckets.set(key, current);
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, maxRequests - current.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));
    if (current.count > maxRequests) {
      res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }
    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets) {
        if (now >= value.resetAt) buckets.delete(bucketKey);
      }
    }
    return next();
  };
}

export function createApp() {
  const allowedOrigins = readAllowedOrigins();
  const app = express();
  app.disable("x-powered-by");
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
          return callback(null, true);
        }
        const error = new Error("Origin is not allowed by CORS.");
        error.status = 403;
        return callback(error);
      },
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Request-ID"],
      maxAge: 600,
    }),
  );

  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (origin && !allowedOrigins.includes(origin.replace(/\/$/, ""))) {
      return res.status(403).json({ error: "Untrusted request origin." });
    }
    return next();
  });

  app.use(express.json({ limit: "64kb", strict: true }));
  app.use(
    createRateLimiter({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
      maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120),
    }),
  );
  app.use(
    "/api/auth",
    createRateLimiter({
      windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60_000),
      maxRequests: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || 30),
      keyPrefix: "auth",
    }),
    authRoutes,
  );
  app.use(
    "/api/chat",
    createRateLimiter({
      windowMs: Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || 60_000),
      maxRequests: Number(process.env.CHAT_RATE_LIMIT_MAX_REQUESTS || 20),
      keyPrefix: "chat",
    }),
    chatRoutes,
  );
  app.use("/api/plan", planRoutes);
  app.use("/api/profile", profileRoutes);

  app.get("/api/health", (_req, res) => {
    const databaseConnected = isDbConnected();
    const statusCode = process.env.NODE_ENV === "production" && !databaseConnected
      ? 503
      : 200;
    res.status(statusCode).json({
      status: databaseConnected ? "ok" : "degraded",
      database: databaseConnected ? "mongodb" : "unavailable",
      databaseConnected,
      mockLLM: isMockMode(),
      ...providerInfo(),
      time: new Date().toISOString(),
    });
  });

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && err.status === 400) {
      return res.status(400).json({ error: "Invalid JSON request body." });
    }
    const status = Number(err?.status) || 500;
    if (status >= 500) console.error("Unhandled express error:", err.message);
    return res.status(status).json({
      error: status === 403 ? err.message : "Internal server error.",
    });
  });
  return app;
}

export default createApp;
