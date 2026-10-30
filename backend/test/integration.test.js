import test, { after, before } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.MOCK_LLM = "true";
process.env.GOOGLE_CLIENT_ID = "";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";

const { createApp } = await import("../src/app.js");

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

async function request(path, { cookie, csrf, body, headers = {}, ...options } = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function authFrom(response, body) {
  const setCookie = response.headers.get("set-cookie") || "";
  return {
    cookie: setCookie.split(";")[0],
    csrf: body.csrfToken,
  };
}

test("registration, session, basic-info, login, and logout use secure cookie auth", async () => {
  const email = `auth-${Date.now()}@example.com`;
  let response = await request("/auth/register", {
    method: "POST",
    body: { email, password: "correct-horse-42" },
  });
  assert.equal(response.status, 201);
  const registered = await response.json();
  assert.equal("token" in registered, false);
  assert.ok(registered.csrfToken);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  const auth = authFrom(response, registered);

  response = await request("/auth/session", { cookie: auth.cookie });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.email, email);

  response = await request("/auth/basic-info", {
    method: "POST",
    cookie: auth.cookie,
    csrf: auth.csrf,
    body: {
      name: "Test Investor",
      age: 30,
      city: "Pune",
      occupation: "Engineer",
      monthlyIncome: 100000,
      goal: "Retirement",
    },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.basicInfoComplete, true);

  response = await request("/auth/logout", {
    method: "POST",
    cookie: auth.cookie,
    csrf: auth.csrf,
  });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/i);

  response = await request("/auth/session", { cookie: auth.cookie });
  assert.equal(response.status, 401);

  response = await request("/auth/login", {
    method: "POST",
    body: { email, password: "correct-horse-42" },
  });
  assert.equal(response.status, 200);
  const loggedIn = await response.json();
  assert.equal(loggedIn.user.email, email);
  assert.equal("token" in loggedIn, false);
});

test("invalid registration and Google authentication inputs are rejected", async () => {
  let response = await request("/auth/register", {
    method: "POST",
    body: { email: "not-an-email", password: "short" },
  });
  assert.equal(response.status, 400);

  response = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid-json",
  });
  assert.equal(response.status, 400);

  response = await request("/auth/google", {
    method: "POST",
    body: { credential: "invalid" },
  });
  assert.equal(response.status, 400);
});

test("protected routes enforce authentication, CSRF, user isolation, and idempotency", async () => {
  const firstEmail = `chat-a-${Date.now()}@example.com`;
  const secondEmail = `chat-b-${Date.now()}@example.com`;
  const firstResponse = await request("/auth/register", {
    method: "POST",
    body: { email: firstEmail, password: "correct-horse-42" },
  });
  const firstBody = await firstResponse.json();
  const firstAuth = authFrom(firstResponse, firstBody);
  const secondResponse = await request("/auth/register", {
    method: "POST",
    body: { email: secondEmail, password: "correct-horse-42" },
  });
  const secondBody = await secondResponse.json();
  const secondAuth = authFrom(secondResponse, secondBody);

  let response = await request("/chat");
  assert.equal(response.status, 401);

  response = await request("/chat", {
    method: "POST",
    cookie: firstAuth.cookie,
    headers: { "X-Request-ID": "request-no-csrf" },
    body: { message: "Hello" },
  });
  assert.equal(response.status, 403);

  const requestId = `request-${Date.now()}`;
  const chatBody = {
    message:
      "My goal is retirement in 20 years. Monthly income ₹100000, I can invest ₹30000, I am comfortable with a market drop, and I have a family.",
  };
  response = await request("/chat", {
    method: "POST",
    cookie: firstAuth.cookie,
    csrf: firstAuth.csrf,
    headers: { "X-Request-ID": requestId },
    body: chatBody,
  });
  assert.equal(response.status, 200);
  const chat = await response.json();
  assert.ok(chat.conversationId);
  assert.equal(chat.planBuilt, true);
  assert.equal(chat.plan.allocation.reduce((sum, item) => sum + item.percent, 0), 100);

  response = await request("/chat", {
    method: "POST",
    cookie: firstAuth.cookie,
    csrf: firstAuth.csrf,
    headers: { "X-Request-ID": requestId },
    body: chatBody,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).meta.replayed, true);

  response = await request(`/profile/${chat.conversationId}/history`, {
    cookie: firstAuth.cookie,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).messages.length, 2);

  response = await request(`/profile/${chat.conversationId}`, {
    cookie: secondAuth.cookie,
  });
  assert.equal(response.status, 404);

  response = await request(`/plan/${chat.conversationId}`, {
    cookie: firstAuth.cookie,
  });
  assert.equal(response.status, 200);
  const plan = (await response.json()).plan;
  assert.equal(plan.allocation.reduce((sum, item) => sum + item.percent, 0), 100);
});
