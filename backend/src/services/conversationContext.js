const inr = (value) =>
  Number.isFinite(Number(value))
    ? `₹${Math.round(Number(value)).toLocaleString("en-IN")}`
    : "—";

export function buildDashboardContext(profile, plan) {
  const lines = [];
  const p = profile || {};
  const profileBits = [];

  if (p.goals?.length) profileBits.push(`Goals: ${p.goals.join(", ")}`);
  if (p.horizonYears != null) profileBits.push(`Horizon: ${p.horizonYears} years`);
  if (p.monthlyIncome != null) profileBits.push(`Monthly income: ${inr(p.monthlyIncome)}`);
  if (p.monthlyInvestable != null) {
    profileBits.push(`Can invest/month: ${inr(p.monthlyInvestable)}`);
  }
  if (p.fearTolerance) profileBits.push(`Volatility comfort: ${p.fearTolerance}`);
  if (p.lifeStage) profileBits.push(`Life stage: ${p.lifeStage}`);
  if (p.riskCategory) {
    profileBits.push(
      `Risk profile: ${p.riskCategory}${p.riskScore != null ? ` (score ${p.riskScore}/100)` : ""}`,
    );
  }

  if (profileBits.length) {
    lines.push("USER PROFILE:");
    profileBits.forEach((bit) => lines.push(`- ${bit}`));
  }

  if (plan) {
    lines.push("", `INVESTMENT PLAN — "${plan.templateName}"${plan.tagline ? ` (${plan.tagline})` : ""}:`);
    if (plan.expectedReturn) lines.push(`- Expected return: ${plan.expectedReturn}`);
    if (plan.monthlySIP) lines.push(`- Monthly SIP: ${inr(plan.monthlySIP)}`);
    if (plan.allocation?.length) {
      lines.push("- Asset allocation:");
      plan.allocation.forEach((allocation) => {
        const examples = allocation.examples?.length
          ? ` (e.g. ${allocation.examples.slice(0, 2).join(", ")})`
          : "";
        lines.push(`    • ${allocation.asset}: ${allocation.percent}%${examples}`);
      });
    }
    if (plan.milestones?.length) {
      lines.push("- Milestones:");
      plan.milestones.forEach((milestone) => {
        const year = milestone.targetYear ? ` [${milestone.targetYear}]` : "";
        lines.push(`    • ${milestone.label}${year}${milestone.done ? " ✓" : ""}`);
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

export function buildConversationSummary(profile, plan, messages = []) {
  const lines = [];
  if (profile?.goals?.length) lines.push(`Goals: ${profile.goals.join(", ")}`);
  if (profile?.horizonYears != null) lines.push(`Horizon: ${profile.horizonYears} years`);
  if (profile?.monthlyIncome != null) lines.push(`Monthly income: ${inr(profile.monthlyIncome)}`);
  if (profile?.monthlyInvestable != null) {
    lines.push(`Monthly investable: ${inr(profile.monthlyInvestable)}`);
  }
  if (profile?.fearTolerance) lines.push(`Volatility comfort: ${profile.fearTolerance}`);
  if (profile?.lifeStage) lines.push(`Life stage: ${profile.lifeStage}`);
  if (profile?.riskCategory) {
    lines.push(`Risk profile: ${profile.riskCategory} (${profile.riskScore}/100)`);
  }
  if (plan?.templateName) lines.push(`Plan: ${plan.templateName}`);
  if (plan?.monthlySIP) lines.push(`Monthly SIP: ${inr(plan.monthlySIP)}`);
  if (plan?.allocation?.length) {
    lines.push(
      `Allocation: ${plan.allocation.map((item) => `${item.asset} ${item.percent}%`).join(", ")}`,
    );
  }

  const userMessages = messages
    .filter((item) => item?.role === "user" && typeof item.content === "string")
    .slice(-3)
    .map((item) => item.content.slice(0, 500));
  if (userMessages.length) {
    lines.push(`Recent user concerns: ${userMessages.join(" | ")}`);
  }
  return lines.join("\n").slice(0, 4000);
}
