import express from "express";
import {
  getProfileForUser,
  getPlanForUser,
  savePlan,
  updateProfile,
} from "../services/store.js";
import { listTemplates, buildPlan } from "../services/planService.js";
import {
  computeRiskScore,
  categorize,
  isProfileComplete,
} from "../services/riskService.js";
import { authenticatedEmail, requireAuth } from "../services/authToken.js";
import { isSupportedConversationId } from "../services/validation.js";

const router = express.Router();

function getUserEmail(req) {
  return authenticatedEmail(req);
}

// GET /api/plan/templates/all -> all portfolio templates (for transparency)
router.get("/templates/all", (_req, res) => {
  return res.status(200).json({ templates: listTemplates() });
});

router.use(requireAuth);

// GET /api/plan/:conversationId  -> current plan (builds on the fly if profile ready)
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

    let plan = await getPlanForUser(conversationId, email);
    const allocationTotal = plan?.allocation?.reduce(
      (sum, item) => sum + Number(item.percent || 0),
      0,
    );
    if (plan && allocationTotal !== 100) plan = null;

    if (!plan) {
      const profile = email
        ? await getProfileForUser(conversationId, email)
        : null;
      if (profile && isProfileComplete(profile)) {
        if (profile.riskScore == null) {
          const riskScore = computeRiskScore(profile);
          await updateProfile(conversationId, {
            riskScore,
            riskCategory: categorize(riskScore),
          });
          profile.riskScore = riskScore;
          profile.riskCategory = categorize(riskScore);
        }
        plan = await savePlan(conversationId, buildPlan(profile));
      }
    }

    if (!plan) {
      return res
        .status(404)
        .json({ error: "No plan yet — finish onboarding first." });
    }

    return res.status(200).json({ plan });
  } catch (err) {
    console.error("plan route error:", err);
    return res.status(Number(err?.status) || 500).json({ error: "Could not load plan." });
  }
});

export default router;
