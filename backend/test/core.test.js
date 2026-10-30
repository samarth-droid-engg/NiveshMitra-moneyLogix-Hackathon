import test from "node:test";
import assert from "node:assert/strict";
import {
  categorize,
  computeRiskScore,
  isProfileComplete,
} from "../src/services/riskService.js";
import { buildPlan } from "../src/services/planService.js";
import {
  AUTH_COOKIE,
  createAuthSession,
  requireAuth,
  requireCsrf,
} from "../src/services/authToken.js";
import { connectDB } from "../src/config/db.js";
import { buildConversationSummary } from "../src/services/conversationContext.js";
import { sanitizeProfileUpdates } from "../src/services/validation.js";
import { getUser, setUserIdentity } from "../src/services/store.js";

test("risk scoring increases with horizon and volatility comfort", () => {
  const conservative = computeRiskScore({
    horizonYears: 3,
    monthlyIncome: 100000,
    monthlyInvestable: 10000,
    fearTolerance: "low",
    lifeStage: "family",
  });
  const growth = computeRiskScore({
    horizonYears: 25,
    monthlyIncome: 100000,
    monthlyInvestable: 50000,
    fearTolerance: "high",
    lifeStage: "early career",
  });

  assert.ok(growth > conservative);
  assert.equal(categorize(conservative), "Conservative");
});

test("profile completeness requires goals and all core fields", () => {
  assert.equal(isProfileComplete({ goals: ["Retirement"] }), false);
  assert.equal(
    isProfileComplete({
      goals: ["Retirement"],
      horizonYears: 25,
      monthlyIncome: 100000,
      monthlyInvestable: 30000,
      fearTolerance: "high",
      lifeStage: "family",
    }),
    true,
  );
});

test("emergency plans protect liquidity and avoid equity", () => {
  const plan = buildPlan({
    goals: ["Emergency fund"],
    horizonYears: 2,
    monthlyIncome: 100000,
    monthlyInvestable: 20000,
    fearTolerance: "low",
    lifeStage: "family",
  });

  const equity = plan.allocation.find((item) => /equity/i.test(item.asset));
  const liquid = plan.allocation.find((item) => /liquid|cash/i.test(item.asset));
  assert.equal(equity?.percent || 0, 0);
  assert.ok((liquid?.percent || 0) >= 70);
  assert.equal(plan.allocation.reduce((sum, item) => sum + item.percent, 0), 100);
});

test("all risk categories produce allocations totaling exactly 100%", () => {
  for (const fearTolerance of ["low", "medium", "high"]) {
    const plan = buildPlan({
      goals: ["Retirement"],
      horizonYears: fearTolerance === "low" ? 3 : fearTolerance === "medium" ? 10 : 30,
      monthlyIncome: 100000,
      monthlyInvestable: 30000,
      fearTolerance,
      lifeStage: fearTolerance === "high" ? "early career" : "family",
    });
    assert.equal(plan.allocation.reduce((sum, item) => sum + item.percent, 0), 100);
  }
});

test("auth sessions require the signed HTTP-only cookie and CSRF token", async () => {
  await setUserIdentity("person@example.com", { name: "Person" });
  const session = createAuthSession("person@example.com");
  const request = {
    method: "POST",
    headers: { cookie: `${AUTH_COOKIE}=${encodeURIComponent(session.token)}` },
    get(name) {
      return name.toLowerCase() === "x-csrf-token" ? session.csrfToken : "";
    },
  };
  const response = {
    statusCode: 200,
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  let csrfPassed = false;
  await requireAuth(request, response, () => {
    requireCsrf(request, response, () => {
      csrfPassed = true;
    });
  });
  assert.equal(request.auth.email, "person@example.com");
  assert.equal(csrfPassed, true);
});

test("untrusted profile updates are whitelisted and financially validated", () => {
  assert.deepEqual(
    sanitizeProfileUpdates(
      {
        goals: ["Retirement"],
        horizonYears: 25,
        monthlyIncome: 100000,
        monthlyInvestable: 120000,
        fearTolerance: "extreme",
        conversationId: "attacker-controlled",
        complete: true,
      },
      {},
    ),
    { goals: ["Retirement"], horizonYears: 25, monthlyIncome: 100000 },
  );
});

test("conversation summaries include the current user message and stay bounded", () => {
  const summary = buildConversationSummary(
    { goals: ["Retirement"], horizonYears: 20 },
    null,
    [{ role: "user", content: "Help me plan calmly" }],
  );
  assert.match(summary, /Help me plan calmly/);
  assert.ok(summary.length <= 4000);
});

test("production refuses to start without MongoDB", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  await assert.rejects(connectDB(""), /MONGODB_URI must be set/);
  if (previous === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous;
});

test("production data access never falls back to process memory", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(getUser("person@example.com"), /Database is temporarily unavailable/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
