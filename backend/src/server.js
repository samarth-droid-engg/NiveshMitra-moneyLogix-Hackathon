import "dotenv/config";
import { connectDB } from "./config/db.js";
import { createApp, validateProductionConfig } from "./app.js";
import { providerInfo } from "./services/llmService.js";

const PORT = process.env.PORT || 5000;

async function start() {
  validateProductionConfig();
  await connectDB(process.env.MONGODB_URI);
  const app = createApp();
  app.listen(PORT, () => {
    const info = providerInfo();
    console.log(`NiveshMitra backend listening on port ${PORT}`);
    console.log(`LLM: ${info.mock ? "MOCK" : `${info.provider} -> ${info.model}`}`);
  });
}

start().catch((error) => {
  console.error("Backend startup failed:", error.message);
  process.exitCode = 1;
});
