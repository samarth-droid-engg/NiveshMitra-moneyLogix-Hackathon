import express from "express";
import mongoose from "mongoose";
import { chatJSON, providerInfo } from "../services/llmService.js";
import { resolvePanic } from "../services/emotionService.js";
import {
  computeRiskScore,
  categorize,
  isProfileComplete,
} from "../services/riskService.js";
import { buildPlan } from "../services/planService.js";
import {
  ONBOARDING_SYSTEM_PROMPT,
  ADVISOR_SYSTEM_PROMPT,
} from "../prompts/systemPrompts.js";
import {
  getConversation,
  getConversationForUser,
  getConversationBySlugForUser,
  createConversation,
  getAllConversations,
  appendMessages,
  getProfile,
  updateProfile,
  updateConversationSummary,
  savePlan,
  getPlan,
  getUser,
} from "../services/store.js";
import { authenticatedEmail, requireAuth } from "../services/authToken.js";

const router = express.Router();
router.use(requireAuth);

// Number of user turns between simulated periodic check-ins.
const CHECKIN_EVERY = 4;

router.post("/", async (req, res) => {
  try {
    const { conversationId, message, thinkMode } = req.body;
    const email = authenticatedEmail(req);

    if (!email || !message || typeof message !== "string") {
      return res.status(400).json({ error: "Email and message are required." });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Message too long." });
    }

    const user = await getUser(email);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    let conversation;
    if (conversationId) {
      conversation = await getConversationForUser(conversationId, email);
      if (!conversation) {
        return res
          .status(404)
          .json({ error: "Conversation not found for this user." });
      }
    } else {
      conversation = await createConversation(email, message);
      if (!conversation) {
        return res
          .status(404)
          .json({ error: "Unable to create conversation." });
      }
    }

    const newConversationId = conversation._id.toString();

    if (!conversation.messages) {
      conversation.messages = [];
    }

    const profile = (await getProfile(newConversationId)) || {
      complete: false,
    };
    const plan = await getPlan(newConversationId);

    const onboarding = !profile.complete && !isProfileComplete(profile);
    let systemPrompt = onboarding
      ? ONBOARDING_SYSTEM_PROMPT
      : ADVISOR_SYSTEM_PROMPT;

    if (user?.name && user.name !== "Friend") {
      systemPrompt =
        `IMPORTANT: You are already talking with ${user.name}. ` +
        `You know their name — greet and address them as ${user.name} naturally, ` +
        `and never ask what their name is.\n\n${systemPrompt}`;
    }

    const dashboardContext = buildDashboardContext(profile, plan);
    if (dashboardContext) {
      systemPrompt = `${systemPrompt}\n\n${dashboardContext}`;
    }

    const history = conversation.messages.slice(-8).map((messageItem) => ({
      role: messageItem.role,
      content: messageItem.content,
    }));
    if (conversation.summary) {
      systemPrompt = `${systemPrompt}\n\nCONVERSATION SUMMARY:\n${conversation.summary}`;
    }

    const preScan = resolvePanic(message, {});
    const calmMode = preScan.panicMode;
    const fomoMode = preScan.fomo;

    const llm = await chatJSON({
      systemPrompt,
      history,
      userMessage: message,
      calmMode,
      fomoMode,
      thinkMode: Boolean(thinkMode),
    });

    const panic = resolvePanic(message, llm);

    if (llm.profile_updates && Object.keys(llm.profile_updates).length) {
      await updateProfile(newConversationId, llm.profile_updates);
    }

    let updatedProfile = await getProfile(newConversationId);
    let planJustBuilt = null;

    const readyToFinalize =
      (llm.onboarding_complete || isProfileComplete(updatedProfile)) &&
      !updatedProfile.complete;

    if (isProfileComplete(updatedProfile)) {
      const score = computeRiskScore(updatedProfile);
      updatedProfile = await updateProfile(newConversationId, {
        riskScore: score,
        riskCategory: categorize(score),
      });
    }

    if (readyToFinalize && isProfileComplete(updatedProfile)) {
      updatedProfile = await updateProfile(newConversationId, {
        complete: true,
      });
      const planData = buildPlan(updatedProfile);
      planJustBuilt = await savePlan(newConversationId, planData);
      user.onboardingComplete = true;
      if (user.save) await user.save();
    }

    const userTurns =
      conversation.messages.filter((item) => item.role === "user").length + 1;
    const checkIn = userTurns > 0 && userTurns % CHECKIN_EVERY === 0;

    await appendMessages(newConversationId, [
      { role: "user", content: message },
      {
        role: "assistant",
        content: llm.response_text,
        detectedEmotion: llm.detected_emotion,
        riskSignal: llm.risk_signal,
        confidence: llm.confidence,
        panicMode: panic.panicMode,
        triggeredBy: panic.triggeredBy,
      },
    ]);
    await updateConversationSummary(
      newConversationId,
      buildConversationSummary(
        updatedProfile,
        planJustBuilt || plan,
        conversation,
      ),
    );

    res.status(200).json({
      conversationId: newConversationId,
      reply: llm.response_text,
      emotion: {
        detected: llm.detected_emotion,
        riskSignal: llm.risk_signal,
        confidence: llm.confidence,
        panicMode: panic.panicMode,
        fomo: panic.fomo,
        triggeredBy: panic.triggeredBy,
        matched: panic.matched,
      },
      phase: updatedProfile.complete ? "advisor" : "onboarding",
      profile: serializeProfile(updatedProfile),
      planBuilt: Boolean(planJustBuilt),
      checkIn,
      meta: { mock: Boolean(llm._mock), ...providerInfo(), error: llm._error },
    });
  } catch (err) {
    console.error("chat route error:", err);
    res
      .status(500)
      .json({ error: "Something went wrong handling your message." });
  }
});

router.get("/", async (req, res) => {
  try {
    const email = authenticatedEmail(req);
    if (!email) {
      return res.status(401).json({ error: "User email is required." });
    }

    const conversations = await getAllConversations(email);
    return res.status(200).json({ conversations });
  } catch (err) {
    console.error("Some error occurred while fetching conversations:", err);
    return res
      .status(500)
      .json({ error: "Some error occurred while fetching conversations." });
  }
});

router.get("/:slug", async (req, res) => {
  const slug = req.params.slug;
  const email = authenticatedEmail(req);

  if (!email) {
    return res.status(401).json({ error: "User email is required." });
  }

  try {
    if (!mongoose.isValidObjectId(slug)) {
      const conversation = await getConversationBySlugForUser(slug, email);
      if (!conversation) {
        return res.status(404).json({
          error: "This conversation was either deleted or does not exist.",
        });
      }
      return res.status(200).json(conversation);
    }

    const conversation = await getConversationForUser(slug, email);

    if (!conversation) {
      return res.status(404).json({
        error: "This conversation was either deleted or does not exist.",
      });
    }

    return res.status(200).json(conversation);
  } catch (err) {
    console.error("Some error occurred while fetching the conversation:", err);
    return res
      .status(500)
      .json({ error: "Some error occurred while fetching the conversation." });
  }
});

function serializeProfile(p) {
  return {
    goals: p.goals || [],
    horizonYears: p.horizonYears ?? null,
    monthlyIncome: p.monthlyIncome ?? null,
    monthlyInvestable: p.monthlyInvestable ?? null,
    fearTolerance: p.fearTolerance ?? null,
    lifeStage: p.lifeStage ?? null,
    riskScore: p.riskScore ?? null,
    riskCategory: p.riskCategory ?? null,
    complete: Boolean(p.complete),
  };
}

const inr = (n) =>
  typeof n === "number" && !Number.isNaN(n)
    ? "₹" + Math.round(n).toLocaleString("en-IN")
    : "—";

/**
 * Render a plain-text summary of exactly what the user sees on the dashboard,
 * so the LLM can answer questions about their plan with real, specific numbers.
 * Returns "" when there is nothing meaningful yet (early onboarding).
 */
function buildDashboardContext(profile, plan) {
  const lines = [];

  const p = profile || {};
  const profileBits = [];
  if (p.goals?.length) profileBits.push(`Goals: ${p.goals.join(", ")}`);
  if (p.horizonYears != null)
    profileBits.push(`Horizon: ${p.horizonYears} years`);
  if (p.monthlyIncome != null)
    profileBits.push(`Monthly income: ${inr(p.monthlyIncome)}`);
  if (p.monthlyInvestable != null)
    profileBits.push(`Can invest/month: ${inr(p.monthlyInvestable)}`);
  if (p.fearTolerance)
    profileBits.push(`Volatility comfort: ${p.fearTolerance}`);
  if (p.lifeStage) profileBits.push(`Life stage: ${p.lifeStage}`);
  if (p.riskCategory)
    profileBits.push(
      `Risk profile: ${p.riskCategory}${p.riskScore != null ? ` (score ${p.riskScore}/100)` : ""}`,
    );

  if (profileBits.length) {
    lines.push("USER PROFILE:");
    profileBits.forEach((b) => lines.push(`- ${b}`));
  }

  if (plan) {
    lines.push("");
    lines.push(
      `INVESTMENT PLAN — "${plan.templateName}"${plan.tagline ? ` (${plan.tagline})` : ""}:`,
    );
    if (plan.expectedReturn)
      lines.push(`- Expected return: ${plan.expectedReturn}`);
    if (plan.monthlySIP) lines.push(`- Monthly SIP: ${inr(plan.monthlySIP)}`);
    if (plan.allocation?.length) {
      lines.push("- Asset allocation:");
      plan.allocation.forEach((a) => {
        const examples = a.examples?.length
          ? ` (e.g. ${a.examples.slice(0, 2).join(", ")})`
          : "";
        lines.push(`    • ${a.asset}: ${a.percent}%${examples}`);
      });
    }
    if (plan.milestones?.length) {
      lines.push("- Milestones:");
      plan.milestones.forEach((m) => {
        const yr = m.targetYear ? ` [${m.targetYear}]` : "";
        lines.push(`    • ${m.label}${yr}${m.done ? " ✓" : ""}`);
      });
    }
  }

  if (!lines.length) return "";

  return [
    "DASHBOARD CONTEXT — this is the live data the user currently sees on their screen.",
    "Use it to answer their questions specifically and accurately:",
    "",
    ...lines,
  ].join("\n");
}

function buildConversationSummary(profile, plan, conversation) {
  const lines = [];
  if (profile?.goals?.length) lines.push(`Goals: ${profile.goals.join(", ")}`);
  if (profile?.horizonYears != null)
    lines.push(`Horizon: ${profile.horizonYears} years`);
  if (profile?.monthlyIncome != null)
    lines.push(`Monthly income: ${inr(profile.monthlyIncome)}`);
  if (profile?.monthlyInvestable != null)
    lines.push(`Monthly investable: ${inr(profile.monthlyInvestable)}`);
  if (profile?.fearTolerance)
    lines.push(`Volatility comfort: ${profile.fearTolerance}`);
  if (profile?.lifeStage) lines.push(`Life stage: ${profile.lifeStage}`);
  if (profile?.riskCategory)
    lines.push(
      `Risk profile: ${profile.riskCategory} (${profile.riskScore}/100)`,
    );
  if (plan?.templateName) lines.push(`Plan: ${plan.templateName}`);
  if (plan?.monthlySIP) lines.push(`Monthly SIP: ${inr(plan.monthlySIP)}`);
  if (plan?.allocation?.length) {
    lines.push(
      `Allocation: ${plan.allocation.map((item) => `${item.asset} ${item.percent}%`).join(", ")}`,
    );
  }
  const userMessages = (conversation.messages || [])
    .filter((item) => item.role === "user")
    .slice(-3)
    .map((item) => item.content);
  if (userMessages.length)
    lines.push(`Recent user concerns: ${userMessages.join(" | ")}`);
  return lines.join("\n");
}

export default router;
