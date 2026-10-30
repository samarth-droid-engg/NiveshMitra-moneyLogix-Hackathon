import express from "express";
import {
  getProfileForUser,
  getConversationForUser,
} from "../services/store.js";
import { authenticatedEmail, requireAuth } from "../services/authToken.js";
import { isSupportedConversationId } from "../services/validation.js";

const router = express.Router();
router.use(requireAuth);

function getUserEmail(req) {
  return authenticatedEmail(req);
}

// GET /api/profile/:conversationId/history -> full conversation log
router.get("/:conversationId/history", async (req, res) => {
  const { conversationId } = req.params;
  const email = getUserEmail(req);

  try {
    if (!email) {
      return res.status(401).json({ error: "User email is required." });
    }

    if (!isSupportedConversationId(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation ID." });
    }

    const convo = await getConversationForUser(conversationId, email);

    if (!convo) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    return res.status(200).json({ messages: convo.messages || [] });
  } catch (err) {
    return res.status(Number(err?.status) || 500).json({ error: "Could not load history." });
  }
});

// GET /api/profile/:conversationId
router.get("/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
  const email = getUserEmail(req);

  try {
    if (!email) {
      return res.status(401).json({ error: "User email is required." });
    }

    if (!isSupportedConversationId(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation ID." });
    }

    const p = await getProfileForUser(conversationId, email);
    if (!p) {
      return res.status(404).json({ error: "Profile not found." });
    }

    return res.status(200).json({
      profile: {
        goals: p.goals || [],
        horizonYears: p.horizonYears ?? null,
        monthlyIncome: p.monthlyIncome ?? null,
        monthlyInvestable: p.monthlyInvestable ?? null,
        fearTolerance: p.fearTolerance ?? null,
        lifeStage: p.lifeStage ?? null,
        riskScore: p.riskScore ?? null,
        riskCategory: p.riskCategory ?? null,
        complete: Boolean(p.complete),
      },
    });
  } catch (err) {
    return res.status(Number(err?.status) || 500).json({ error: "Could not load profile." });
  }
});

export default router;
