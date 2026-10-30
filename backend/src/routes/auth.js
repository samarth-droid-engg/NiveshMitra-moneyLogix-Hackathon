import express from "express";
import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";
import {
  createUser,
  getUser,
  getUserForAuth,
  incrementUserAuthVersion,
  setUserIdentity,
} from "../services/store.js";
import {
  authenticatedEmail,
  authCookieOptions,
  createAuthSession,
  requireAuth,
  requireCsrf,
  serializeAuthCookie,
} from "../services/authToken.js";
import {
  cleanText,
  normalizeEmail,
  validateBasicInfo,
  validatePassword,
} from "../services/validation.js";

const router = express.Router();
const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;
const DUMMY_PASSWORD_HASH =
  "$2b$12$zdNvcQo8r.PRIz8RiktpeOzp1z2jJYp0s6cRTsZATN6t6vl4wnYr2";

function serializeUser(user) {
  return {
    _id: user?._id?.toString() ?? null,
    name: user?.name ?? "Friend",
    email: user?.email ?? null,
    image: user?.image ?? null,
    age: user?.age ?? null,
    city: user?.city ?? null,
    occupation: user?.occupation ?? null,
    phone: user?.phone ?? null,
    monthlyIncome: user?.monthlyIncome ?? null,
    goal: user?.goal ?? null,
    basicInfoComplete: Boolean(user?.basicInfoComplete),
    onboardingComplete: Boolean(user?.onboardingComplete),
  };
}

function setAuthCookie(res, user) {
  const session = createAuthSession(user.email, user.authVersion);
  res.setHeader(
    "Set-Cookie",
    serializeAuthCookie(session.token, authCookieOptions()),
  );
  return session.csrfToken;
}

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const normalizedEmail = normalizeEmail(email);
    if (
      !normalizedEmail ||
      typeof password !== "string" ||
      !password ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({ error: "A valid email and password are required." });
    }
    const user = await getUserForAuth(normalizedEmail);

    const ok = await bcrypt.compare(
      String(password),
      user?.password || DUMMY_PASSWORD_HASH,
    );
    if (!user || !user.password || !ok) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const csrfToken = setAuthCookie(res, user);
    return res.status(200).json({
      user: serializeUser(user),
      csrfToken,
    });
  } catch (err) {
    console.error("auth/login error:", err);
    res.status(500).json({ error: "Could not sign you in." });
  }
});

router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    const normalizedEmail = normalizeEmail(email);
    const passwordError = validatePassword(password);
    if (!normalizedEmail) {
      return res.status(400).json({ error: "A valid email address is required." });
    }
    if (passwordError) return res.status(400).json({ error: passwordError });
    let user = await getUser(normalizedEmail);

    if (user) {
      return res
        .status(409)
        .json({ error: "That email is already registered." });
    }

    const rounds = Math.max(10, Math.min(14, Number(process.env.BCRYPT_ROUNDS || 12)));
    const hashedPassword = await bcrypt.hash(password, rounds);
    user = await createUser(normalizedEmail, hashedPassword);
    if (!user) {
      return res
        .status(409)
        .json({ error: "That email is already registered." });
    }

    const csrfToken = setAuthCookie(res, user);
    res.status(201).json({
      user: serializeUser(user),
      csrfToken,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "That email is already registered." });
    }
    console.error("auth/register error:", err);
    return res.status(500).json({ error: "Could not register you." });
  }
});

router.post("/google", async (req, res) => {
  const { credential } = req.body;

  if (!googleClient || !credential) {
    return res.status(400).json({ error: "Google sign-in is not configured." });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);

    if (!email || !payload.email_verified) {
      return res
        .status(401)
        .json({ error: "Google account email is not verified." });
    }

    const user = await setUserIdentity(email, {
      name: cleanText(payload.name, 100) || "Friend",
      image: cleanText(payload.picture, 2048) || null,
    });

    if (!user) {
      return res.status(500).json({ error: "Could not create your account." });
    }

    const csrfToken = setAuthCookie(res, user);
    return res.status(200).json({
      user: serializeUser(user),
      csrfToken,
    });
  } catch (err) {
    console.error("auth/google error:", err.message);
    return res.status(401).json({ error: "Could not verify Google sign-in." });
  }
});

router.get("/session", requireAuth, async (req, res) => {
  try {
    const user = await getUser(authenticatedEmail(req));
    if (!user) return res.status(401).json({ error: "Session user not found." });
    return res.status(200).json({
      user: serializeUser(user),
      csrfToken: req.auth.csrf,
    });
  } catch (err) {
    console.error("auth/session error:", err.message);
    return res.status(503).json({ error: "Could not verify your session." });
  }
});

router.post("/logout", requireAuth, requireCsrf, async (req, res) => {
  try {
    await incrementUserAuthVersion(authenticatedEmail(req));
    res.setHeader(
      "Set-Cookie",
      serializeAuthCookie("", { ...authCookieOptions(), maxAge: 0 }),
    );
    return res.status(204).end();
  } catch (err) {
    console.error("auth/logout error:", err.message);
    return res.status(Number(err?.status) || 500).json({ error: "Could not sign out." });
  }
});

router.post("/basic-info", requireAuth, requireCsrf, async (req, res) => {
  const { name, age, city, occupation, phone, monthlyIncome, goal, email } =
    req.body;

  try {
    const identityEmail = authenticatedEmail(req);
    if (!identityEmail) {
      return res.status(400).json({ error: "Email is required." });
    }

    if (email && String(email).trim().toLowerCase() !== identityEmail) {
      return res
        .status(403)
        .json({ error: "You cannot update another user's details." });
    }

    if (!(await getUser(identityEmail))) {
      return res
        .status(401)
        .json({ error: "Please sign in before saving your details." });
    }

    const validated = validateBasicInfo({
      name,
      age,
      city,
      occupation,
      phone,
      monthlyIncome,
      goal,
    });
    if (validated.error) return res.status(400).json({ error: validated.error });

    const user = await setUserIdentity(identityEmail, {
      ...validated.value,
      phone: validated.value.phone || null,
      basicInfoComplete: true,
    });

    if (!user) {
      return res.status(400).json({ error: "Could not save your details." });
    }

    res.status(200).json({ user: serializeUser(user) });
  } catch (err) {
    console.error("auth/basic-info error:", err);
    res.status(500).json({ error: "Could not save your details." });
  }
});

export default router;
