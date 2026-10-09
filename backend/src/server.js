import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB, isDbConnected } from "./config/db.js";
import { isMockMode, providerInfo } from "./services/llmService.js";
import chatRoutes from "./routes/chat.js";
import planRoutes from "./routes/plan.js";
import profileRoutes from "./routes/profile.js";
import authRoutes from "./routes/auth.js";

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      const cleanOrigin = origin.replace(/\/$/, "");
      if (
        allowedOrigins.includes(cleanOrigin) ||
        allowedOrigins.includes("*")
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));

const rateLimitMap = new Map();
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120);

app.use((req, res, next) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const now = Date.now();
  const recent = (rateLimitMap.get(ip) || []).filter(
    (ts) => now - ts < WINDOW_MS,
  );

  if (recent.length >= MAX_REQUESTS) {
    return res
      .status(429)
      .json({ error: "Too many requests. Please slow down." });
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);

  if (rateLimitMap.size > 5000) {
    for (const [key, timestamps] of rateLimitMap) {
      if (
        !timestamps.length ||
        now - timestamps[timestamps.length - 1] >= WINDOW_MS
      ) {
        rateLimitMap.delete(key);
      }
    }
  }

  return next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    database: isDbConnected() ? "mongodb" : "memory",
    databaseConnected: isDbConnected(),
    mockLLM: isMockMode(),
    ...providerInfo(),
    time: new Date().toISOString(),
  });
});

app.use("/api/chat", chatRoutes);
app.use("/api/plan", planRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/auth", authRoutes);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  console.error("Unhandled express error:", err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB(process.env.MONGODB_URI);
    app.listen(PORT, () => {
      const info = providerInfo();
      console.log(`NiveshMitra backend on http://localhost:${PORT}`);
      console.log(
        `LLM: ${info.mock ? "MOCK (no key)" : `${info.provider} → ${info.model}`}`,
      );
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exitCode = 1;
  }
})();
