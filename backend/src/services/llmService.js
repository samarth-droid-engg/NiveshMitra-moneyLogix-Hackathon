import {
  CALM_MODE_DIRECTIVE,
  DETAILED_MODE_DIRECTIVE,
  FOMO_MODE_DIRECTIVE,
  TITLE_GENERATION_SYSTEM_PROMPT,
} from "../prompts/systemPrompts.js";
import Groq from "groq-sdk";

const provider = {
  name: "groq",
  mode: "groq-chat",
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  fallbackModels: (process.env.GROQ_FALLBACK_MODELS || "llama-3.3-70b-versatile")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

const apiKey =
  provider.apiKey &&
  !/^replace_with_|^your_|^paste_|^<.*>$/.test(provider.apiKey.trim())
    ? provider.apiKey.trim()
    : "";
const MOCK = process.env.MOCK_LLM === "true" || !apiKey;
const MODEL = provider.model;
const groq = MOCK
  ? null
  : new Groq({
      apiKey,
      timeout: Number(process.env.GROQ_TIMEOUT_MS || 30000),
    });

export class AIProviderError extends Error {
  constructor(message = "AI provider unavailable.") {
    super(message);
    this.name = "AIProviderError";
    this.status = 503;
  }
}

export function isMockMode() {
  return MOCK;
}

export function providerInfo() {
  return {
    provider: provider.name,
    model: MODEL,
    mode: provider.mode,
    mock: MOCK,
  };
}

export function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") return null;
  let text = raw.trim();
  text = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(text);
  } catch (_) {
    // Try extracting JSON when the model adds surrounding text.
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (_) {
      // Return null for invalid model output.
    }
  }
  return null;
}

export async function chatJSON({
  systemPrompt,
  history = [],
  userMessage,
  calmMode = false,
  fomoMode = false,
  thinkMode = false,
}) {
  let system = calmMode
    ? `${systemPrompt}\n\n${CALM_MODE_DIRECTIVE}`
    : systemPrompt;
  if (fomoMode && !calmMode) {
    system = `${system}\n\n${FOMO_MODE_DIRECTIVE}`;
  }
  if (thinkMode) {
    system = `${system}\n\n${DETAILED_MODE_DIRECTIVE}`;
  }

  if (MOCK) {
    return mockResponse(userMessage, calmMode, fomoMode);
  }

  try {
    const raw = await callGroq({
      system,
      history,
      userMessage,
      thinkMode,
    });
    const parsed = safeParseJSON(raw);
    if (parsed && parsed.response_text) {
      return { ...normalize(parsed), _raw: raw, _mock: false };
    }
    throw new AIProviderError("The AI provider returned an invalid response.");
  } catch (err) {
    console.error(
      "Groq call failed:",
      err?.status || "error",
      process.env.NODE_ENV === "production" ? err?.name || "provider error" : err.message,
    );
    if (process.env.NODE_ENV === "production" || err instanceof AIProviderError) {
      throw err instanceof AIProviderError
        ? err
        : new AIProviderError("The AI provider is temporarily unavailable.");
    }
    return {
      ...mockResponse(userMessage, calmMode, fomoMode),
      response_text:
        "I'm having a little trouble reaching my brain right now — but I'm still here. Want to try again?",
    };
  }
}

export async function generateJSON({ systemPrompt, userMessage }) {
  if (MOCK) {
    return {};
  }

  const raw = await callGroq({
    system: systemPrompt,
    history: [],
    userMessage,
    thinkMode: false,
  });
  const parsed = safeParseJSON(raw);

  if (!parsed) {
    throw new Error("Failed to parse JSON response.");
  }

  return parsed;
}

async function callGroq({
  system,
  history,
  userMessage,
  thinkMode = false,
}) {
  const messages = [
    { role: "system", content: system },
    ...history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || ""),
    })),
    { role: "user", content: userMessage },
  ];
  const modelsToTry = [provider.model, ...provider.fallbackModels];
  let lastErr = "unknown error";

  for (const model of modelsToTry) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        max_tokens: Number(
          process.env.GROQ_MAX_TOKENS || (thinkMode ? 4096 : 2048),
        ),
        response_format: { type: "json_object" },
      });
      return completion.choices?.[0]?.message?.content || "";
    } catch (err) {
      lastErr = err?.message || "unknown error";
      if (![429, 500, 502, 503, 504].includes(err?.status)) break;
    }
  }
  throw new Error(lastErr);
}

export async function generateConversationTitle(message) {
  try {
    const result = await generateJSON({
      systemPrompt: TITLE_GENERATION_SYSTEM_PROMPT,
      userMessage: message,
    });
    const title = String(result?.title || "")
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, 80);
    return title || "New Chat";
  } catch (err) {
    console.warn(
      "Conversation title generation failed; using fallback title.",
      err.message,
    );
    return "New Chat";
  }
}

function normalize(p) {
  const payload = p || {};
  const confidenceValue = Number(payload.confidence);
  const validConfidence =
    Number.isFinite(confidenceValue) &&
    confidenceValue >= 0 &&
    confidenceValue <= 1
      ? confidenceValue
      : 0.5;

  return {
    response_text: String(payload.response_text || "").trim().slice(0, 20_000),
    detected_emotion: [
      "neutral",
      "excited",
      "anxious",
      "fearful",
      "frustrated",
      "hopeful",
      "confused",
      "panic",
    ].includes(payload.detected_emotion)
      ? payload.detected_emotion
      : "neutral",
    risk_signal: ["none", "low", "medium", "high"].includes(payload.risk_signal)
      ? payload.risk_signal
      : "none",
    confidence: validConfidence,
    profile_updates:
      payload.profile_updates && typeof payload.profile_updates === "object"
        ? payload.profile_updates
        : {},
    onboarding_complete: Boolean(payload.onboarding_complete),
  };
}

function mockResponse(userMessage, calmMode, fomoMode = false) {
  if (calmMode) {
    return {
      response_text:
        "I hear you — that fear is completely valid. Take a breath. Markets dip; your plan was built for exactly these moments. Let's not act on panic. Can we look at your goals together before doing anything?",
      detected_emotion: "panic",
      risk_signal: "medium",
      confidence: 0.9,
      profile_updates: {},
      onboarding_complete: false,
      _mock: true,
    };
  }

  if (fomoMode) {
    return {
      response_text:
        "That excitement makes sense, but let’s pause before chasing the move. Check how much you could genuinely afford to lose, compare it with your goal-based plan, and consider paper-testing the idea before committing real money.",
      detected_emotion: "excited",
      risk_signal: "medium",
      confidence: 0.85,
      profile_updates: {},
      onboarding_complete: false,
      _mock: true,
    };
  }

  const profileUpdates = extractMockProfileUpdates(userMessage);
  const learned = Object.keys(profileUpdates).length;
  const responseText = learned
    ? "Thanks — I’ve noted that. To shape this around you, what else should I know about your goals, timeline, monthly investing amount, and comfort with market ups and downs?"
    : "(mock) Thanks for sharing that! To tailor your plan, what's your biggest financial goal right now — and roughly how many years away is it?";

  return {
    response_text: responseText,
    detected_emotion: "neutral",
    risk_signal: "none",
    confidence: 0.6,
    profile_updates: profileUpdates,
    onboarding_complete: false,
    _mock: true,
  };
}

function extractMockProfileUpdates(text) {
  if (typeof text !== "string" || !text.trim()) return {};

  const updates = {};
  const normalized = text.trim().toLowerCase();

  const goalPatterns = [
    ["Retirement", /\b(retire|retirement|pension)\b/],
    ["Buy a house", /\b(buy|buying|purchase)\b.{0,30}\b(house|home|flat)\b/],
    ["Child's education", /\b(child|children|kid|kids)\b.{0,30}\b(education|school|college)\b/],
    ["Wealth building", /\b(build|grow|create)\b.{0,20}\b(wealth|corpus)\b/],
    ["Emergency fund", /\b(emergency|rainy[- ]day)\b.{0,20}\b(fund|savings?)\b/],
    ["Travel", /\b(travel|vacation|holiday|trip)\b/],
    ["Start a business", /\b(start|launch|fund)\b.{0,25}\b(business|startup)\b/],
  ];
  const matchedGoal = goalPatterns.find(([, pattern]) => pattern.test(normalized));
  if (matchedGoal) updates.goals = [matchedGoal[0]];

  const horizonMatch =
    normalized.match(
      /\b(?:in|for|over|within|after|around|about|roughly)?\s*(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*(years?|yrs?)\b/,
    ) || normalized.match(/\b(?:long[- ]term|short[- ]term)\b/);
  if (horizonMatch?.[0]) {
    if (/long[- ]term/.test(horizonMatch[0])) updates.horizonYears = 10;
    else if (/short[- ]term/.test(horizonMatch[0])) updates.horizonYears = 3;
    else {
      const first = Number(horizonMatch[1]);
      const second = Number(horizonMatch[2]);
      if (Number.isFinite(first)) {
        updates.horizonYears = second
          ? Math.round((first + second) / 2)
          : Math.round(first);
      }
    }
  }

  const income = findMoneyAmount(
    normalized,
    /\b(?:monthly\s+)?(?:income|salary|earnings?)\b[^₹$0-9]{0,20}([₹$]?\s*[\d,.]+(?:\s*(?:k|lakh|lac|cr))?)/i,
  );
  if (income != null) updates.monthlyIncome = income;

  const investable = findMoneyAmount(
    normalized,
    /\b(?:invest|investing|investment|save|saving|sip)\w*\b[^₹$0-9]{0,25}([₹$]?\s*[\d,.]+(?:\s*(?:k|lakh|lac|cr))?)/i,
  );
  if (investable != null) updates.monthlyInvestable = investable;

  if (
    /\b(panic|panicking|terrified|frightened|scared|scare|worried|anxious|nervous|can't handle|cannot handle)\b/.test(
      normalized,
    )
  ) {
    updates.fearTolerance = "low";
  } else if (
    /\b(not bothered|comfortable|calm|okay with|fine with|can handle|can tolerate)\b.{0,25}\b(drop|dip|loss|risk|volatil|swing|fall)\w*\b/.test(
      normalized,
    ) ||
    /\b(high|very high)\b.{0,15}\b(risk tolerance|risk appetite|comfort with risk)\b/.test(
      normalized,
    )
  ) {
    updates.fearTolerance = "high";
  } else if (
    /\b(moderate|medium|manageable|somewhat|a little|little)\b.{0,20}\b(risk|fear|drop|dip|loss|volatil)\w*\b/.test(
      normalized,
    ) ||
    /\b(risk|fear|drop|dip|loss|volatil)\w*\b.{0,20}\b(moderate|medium|manageable|somewhat|a little|little)\b/.test(
      normalized,
    )
  ) {
    updates.fearTolerance = "medium";
  }

  if (/\b(student|college|university)\b/.test(normalized)) {
    updates.lifeStage = "student";
  } else if (/\b(early career|young professional|first job)\b/.test(normalized)) {
    updates.lifeStage = "early career";
  } else if (/\b(family|married|children|kids)\b/.test(normalized)) {
    updates.lifeStage = "family";
  } else if (/\b(pre[- ]?retirement|near retirement)\b/.test(normalized)) {
    updates.lifeStage = "pre-retirement";
  } else if (/\b(retired|retirement)\b/.test(normalized)) {
    updates.lifeStage = "retired";
  }

  return updates;
}

function findMoneyAmount(text, pattern) {
  const match = text.match(pattern);
  if (!match?.[1]) return null;

  const matchEnd = (match.index ?? 0) + match[0].length;
  const trailingText = text.slice(matchEnd, matchEnd + 12);
  if (
    !/[₹$]/.test(match[1]) &&
    !/\b(?:k|lakh|lac|cr)\b/i.test(match[1]) &&
    (/\b(?:year|years|yr|yrs)\b/i.test(match[0]) ||
      /^\s*(?:year|years|yr|yrs)\b/i.test(trailingText))
  ) {
    return findMoneyAmount(text.slice(matchEnd), pattern);
  }

  const raw = match[1]
    .replace(/[₹$,]/g, "")
    .trim()
    .toLowerCase();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (/\b(?:k)\b/.test(raw)) return Math.round(value * 1_000);
  if (/\b(?:lakh|lac)\b/.test(raw)) return Math.round(value * 100_000);
  if (/\bcr\b/.test(raw)) return Math.round(value * 10_000_000);
  return Math.round(value);
}
