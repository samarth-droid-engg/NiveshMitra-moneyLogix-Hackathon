import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { computeRiskScore, categorize, isProfileComplete } from "./riskService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const portfolios = JSON.parse(
  readFileSync(join(__dirname, "../data/portfolios.json"), "utf-8"),
);

const DISCLAIMER =
  "This is educational guidance, not registered financial advice. Mutual fund investments " +
  "are subject to market risks. The SIP return assumption used here is illustrative and not guaranteed. " +
  "Please read all scheme-related documents carefully.";

const RETURN_ASSUMPTIONS = {
  smallCap: 0.14,
  midCap: 0.13,
  flexiCap: 0.12,
  international: 0.12,
  equity: 0.11,
  realEstate: 0.09,
  gold: 0.08,
  debt: 0.07,
  liquid: 0.055,
  default: 0.1,
};

function pickTemplate(riskScore) {
  return (
    portfolios.templates.find(
      (t) => riskScore >= t.riskRange[0] && riskScore <= t.riskRange[1],
    ) || portfolios.templates[1]
  );
}

function normalizeGoal(profile) {
  const goal = String(profile.goals?.[0] || "").toLowerCase();
  if (/emergency|rainy/.test(goal)) return "emergency";
  if (/house|home|flat/.test(goal)) return "house";
  if (/education|school|college|child|kid/.test(goal)) return "education";
  if (/travel|vacation|holiday|trip/.test(goal)) return "travel";
  if (/business|startup/.test(goal)) return "business";
  if (/retire|pension/.test(goal)) return "retirement";
  return "wealth";
}

function goalPolicy(goal, horizon) {
  if (goal === "emergency") {
    return {
      label: "Emergency fund",
      tagline: "Protect liquidity first; this money should be available when life needs it.",
      maxEquity: 0,
      liquidMinimum: 70,
      priority: "Build and preserve a liquid emergency reserve before taking equity risk.",
    };
  }

  if (["house", "education", "travel", "business"].includes(goal)) {
    const maxEquity = horizon <= 3 ? 20 : horizon <= 7 ? 45 : 65;
    return {
      label: goal[0].toUpperCase() + goal.slice(1),
      tagline: "Match growth to the date you expect to need the money.",
      maxEquity,
      liquidMinimum: horizon <= 3 ? 25 : 10,
      priority: `Protect money needed within ${horizon} years from avoidable short-term volatility.`,
    };
  }

  return {
    label: goal === "retirement" ? "Retirement" : "Wealth building",
    tagline: goal === "retirement"
      ? "Long-horizon growth with a plan to review risk as retirement approaches."
      : "Build long-term wealth with a diversified, risk-aware allocation.",
    maxEquity: 100,
    liquidMinimum: 0,
    priority: "Stay diversified and review the plan as the goal and life stage change.",
  };
}

function buildGoalAllocation(template, policy) {
  const allocation = template.allocation.map((item) => ({ ...item }));
  if (policy.maxEquity >= 100 && policy.liquidMinimum === 0) return allocation;

  const isEquity = (asset) =>
    /equity|cap|thematic|international|intl|index/i.test(asset);
  const isLiquid = (asset) => /liquid|cash/i.test(asset);
  const isStable = (asset) => /debt|bond|fixed|liquid|cash|gold/i.test(asset);
  const equity = allocation.reduce(
    (sum, item) => sum + (isEquity(item.asset) ? item.percent : 0),
    0,
  );
  if (equity > policy.maxEquity) {
    const factor = policy.maxEquity / equity;
    allocation.forEach((item) => {
      if (isEquity(item.asset)) {
        const next = Math.floor(item.percent * factor);
        item.percent = next;
      }
    });
  }

  let liquidTarget = allocation.find((item) => isLiquid(item.asset));
  if (!liquidTarget && policy.liquidMinimum > 0) {
    liquidTarget = {
      asset: "Liquid / Cash",
      percent: 0,
      examples: ["Parag Parikh Liquid Fund"],
    };
    allocation.push(liquidTarget);
  }

  const total = allocation.reduce((sum, item) => sum + item.percent, 0);
  const deficit = Math.max(0, 100 - total);
  if (deficit > 0 && allocation.length) {
    if (liquidTarget) {
      const liquidNeed = Math.max(0, policy.liquidMinimum - liquidTarget.percent);
      const toLiquid = Math.min(deficit, liquidNeed);
      liquidTarget.percent += toLiquid;
    }
    const afterLiquid = allocation.reduce((sum, item) => sum + item.percent, 0);
    const remaining = Math.max(0, 100 - afterLiquid);
    const stableTarget =
      allocation.find((item) => /debt|bond|fixed|liquid|cash/i.test(item.asset)) ||
      allocation[0];
    stableTarget.percent += remaining;
  }
  if (liquidTarget && liquidTarget.percent < policy.liquidMinimum) {
    let needed = policy.liquidMinimum - liquidTarget.percent;
    allocation.forEach((item) => {
    if (item === liquidTarget || needed <= 0) return;
    const transferable = Math.min(item.percent, needed);
    item.percent -= transferable;
    liquidTarget.percent += transferable;
    needed -= transferable;
    });
  }
  return normalizeAllocation(allocation.filter((item) => item.percent > 0));
}

export function normalizeAllocation(allocation) {
  const normalized = (Array.isArray(allocation) ? allocation : [])
    .map((item) => ({
      ...item,
      asset: String(item?.asset || "").trim(),
      percent: Math.max(0, Math.round(Number(item?.percent) || 0)),
      examples: Array.isArray(item?.examples)
        ? item.examples.map(String).filter(Boolean).slice(0, 10)
        : [],
    }))
    .filter((item) => item.asset && item.percent > 0);
  if (!normalized.length) throw new Error("Portfolio allocation is empty.");

  const total = normalized.reduce((sum, item) => sum + item.percent, 0);
  const adjustment = 100 - total;
  const target = normalized.reduce(
    (largest, item) => (item.percent > largest.percent ? item : largest),
    normalized[0],
  );
  target.percent += adjustment;
  if (target.percent < 0) throw new Error("Portfolio allocation is invalid.");

  const finalTotal = normalized.reduce((sum, item) => sum + item.percent, 0);
  if (finalTotal !== 100) throw new Error("Portfolio allocation must total 100%.");
  return normalized.filter((item) => item.percent > 0);
}

/**
 * Build a personalized plan object from a risk profile.
 * @param {object} profile RiskProfile-like object
 * @returns {object} plan payload (matches Plan schema)
 */
export function buildPlan(profile) {
  if (!isProfileComplete(profile)) {
    throw new Error("A complete, valid risk profile is required to build a plan.");
  }
  const riskScore = profile.riskScore ?? computeRiskScore(profile);
  const category = profile.riskCategory ?? categorize(riskScore);
  const template = pickTemplate(riskScore);

  const monthlySIP = Number(profile.monthlyInvestable);
  const horizon = Number(profile.horizonYears);
  const goal = normalizeGoal(profile);
  const policy = goalPolicy(goal, horizon);
  const allocation = buildGoalAllocation(template, policy);
  const annualReturn = weightedReturn(allocation);

  // Illustrative SIP projection only: this is a planning assumption, not a forecast.
  const r = annualReturn / 12;
  const n = horizon * 12;
  const fv =
    monthlySIP > 0
      ? r > 0
        ? monthlySIP * (((Math.pow(1 + r, n) - 1) / r) * (1 + r))
        : monthlySIP * n
      : 0;

  const milestones = buildMilestones(
    profile,
    horizon,
    monthlySIP,
    fv,
    policy,
  );

  return {
    conversationId: profile.conversationId,
    templateId: template.id,
    templateName: template.name,
    tagline: policy.tagline,
    goal: policy.label,
    goalPriority: policy.priority,
    expectedReturn: formatExpectedReturn(annualReturn),
    monthlySIP,
    allocation,
    milestones,
    riskScore,
    riskCategory: category,
    disclaimer: DISCLAIMER,
    returnAssumptions: RETURN_ASSUMPTIONS,
  };
}

function weightedReturn(allocation) {
  const rates = RETURN_ASSUMPTIONS;
  return allocation.reduce((sum, item) => {
    const asset = item.asset.toLowerCase();
    const rate =
      asset.includes("small") ? rates.smallCap :
      asset.includes("mid") ? rates.midCap :
      asset.includes("flexi") ? rates.flexiCap :
      asset.includes("international") || asset.includes("intl") ? rates.international :
      asset.includes("equity") || asset.includes("index") || asset.includes("large") ? rates.equity :
      asset.includes("gold") ? rates.gold :
      asset.includes("debt") || asset.includes("bond") || asset.includes("fixed") ? rates.debt :
      asset.includes("liquid") || asset.includes("cash") ? rates.liquid :
      rates.default;
    return sum + (item.percent / 100) * rate;
  }, 0);
}

function formatExpectedReturn(rate) {
  const percentage = rate * 100;
  return `${Math.max(0, Math.floor(percentage - 1))}-${Math.ceil(percentage + 1)}% p.a.`;
}

function buildMilestones(profile, horizon, sip, fv, policy) {
  const ms = [];
  if (sip > 0) {
    ms.push({
      label: `Start a ₹${sip.toLocaleString("en-IN")}/mo SIP`,
      targetAmount: sip,
      targetYear: new Date().getFullYear(),
      done: false,
    });
    if (policy.label !== "Emergency fund") {
      ms.push({
        label: "Build a 6-month emergency fund before increasing risk",
        targetAmount: (profile.monthlyIncome || sip * 3) * 6,
        targetYear: new Date().getFullYear() + 1,
        done: false,
      });
    }
  }
  const mid = Math.max(1, Math.round(horizon / 2));
  ms.push({
    label: `${policy.label} review at year ${mid} — rebalance for the goal date`,
    targetYear: new Date().getFullYear() + mid,
    done: false,
  });
  if (policy.label === "Emergency fund") {
    ms.push({
      label: "Reach the emergency reserve target and keep it readily accessible",
      targetAmount: (profile.monthlyIncome || sip * 3) * 6,
      targetYear: new Date().getFullYear() + 1,
      done: false,
    });
  }
  ms.push({
    label: `${policy.label} corpus ≈ ₹${Math.round(fv).toLocaleString("en-IN")} by year ${horizon}`,
    targetAmount: Math.round(fv),
    targetYear: new Date().getFullYear() + horizon,
    done: false,
  });
  return ms;
}

export function listTemplates() {
  return structuredClone(portfolios.templates);
}
