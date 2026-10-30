// Rule-based risk scoring (0-100). Pure config-driven, no ML.
// Inputs come from the progressively-built RiskProfile.

// fearTolerance describes comfort with volatility: low = uncomfortable with
// losses, high = comfortable with market swings.
const FEAR_SCORE = { low: 0, medium: 15, high: 30 };

/**
 * Compute a 0-100 risk score from a profile.
 * Higher score = higher risk capacity/appetite.
 */
export function computeRiskScore(profile) {
  if (!profile || typeof profile !== "object") return 0;
  let score = 0;

  // Horizon: longer horizon -> more risk capacity (max 40 pts).
  const horizon = Math.max(0, Math.min(60, Number(profile.horizonYears) || 0));
  if (horizon >= 20) score += 40;
  else if (horizon >= 10) score += 30;
  else if (horizon >= 5) score += 18;
  else if (horizon >= 3) score += 10;
  else score += 4;

  // Volatility comfort (max 30 pts).
  score += FEAR_SCORE[profile.fearTolerance] ?? 12;

  // Investable ratio: how much of income is investable (max 20 pts).
  const income = Math.max(0, Number(profile.monthlyIncome) || 0);
  const investable = Math.max(0, Number(profile.monthlyInvestable) || 0);
  if (income > 0 && investable > 0) {
    const ratio = Math.min(1, investable / income);
    if (ratio >= 0.4) score += 20;
    else if (ratio >= 0.25) score += 14;
    else if (ratio >= 0.15) score += 9;
    else score += 4;
  } else {
    score += 6;
  }

  // Life stage nudge (max ~10 pts).
  const stage = (profile.lifeStage || "").toLowerCase();
  if (/student|early|young|20s/.test(stage)) score += 10;
  else if (/family|mid|30s|40s/.test(stage)) score += 5;
  else if (/retire|senior|60/.test(stage)) score += 0;
  else score += 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function categorize(score) {
  const normalizedScore = Number.isFinite(Number(score))
    ? Math.max(0, Math.min(100, Number(score)))
    : 0;
  if (normalizedScore <= 30) return "Conservative";
  if (normalizedScore <= 55) return "Balanced";
  if (normalizedScore <= 80) return "Aggressive";
  return "Growth";
}

/** Whether we have enough to compute a meaningful score & build a plan. */
export function isProfileComplete(profile) {
  const horizon = Number(profile?.horizonYears);
  const income = Number(profile?.monthlyIncome);
  const investable = Number(profile?.monthlyInvestable);
  return Boolean(
    profile &&
    Number.isFinite(horizon) && horizon >= 1 && horizon <= 60 &&
    Number.isFinite(income) && income > 0 &&
    Number.isFinite(investable) && investable > 0 && investable <= income &&
    ["low", "medium", "high"].includes(profile.fearTolerance) &&
    typeof profile.lifeStage === "string" && profile.lifeStage.trim().length > 0 &&
    Array.isArray(profile.goals) &&
    profile.goals.some((goal) => typeof goal === "string" && goal.trim()),
  );
}
