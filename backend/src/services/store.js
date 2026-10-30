// Thin data-access layer. Uses MongoDB when connected and an in-memory store
// otherwise only in local/test environments. Production always fails closed.
import crypto from "crypto";
import mongoose from "mongoose";
import { isDbConnected } from "../config/db.js";
import { generateConversationTitle } from "../services/llmService.js";
import ConversationLog from "../models/ConversationLog.js";
import RiskProfile from "../models/RiskProfile.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";
import { normalizeEmail } from "./validation.js";

const mem = {
  conversations: new Map(),
  profiles: new Map(),
  plans: new Map(),
  users: new Map(),
};

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Database is temporarily unavailable.");
    this.name = "DatabaseUnavailableError";
    this.status = 503;
  }
}

function useDatabase() {
  if (isDbConnected()) return true;
  if (process.env.NODE_ENV === "production") throw new DatabaseUnavailableError();
  return false;
}

function getUserId(user) {
  if (!user) return null;
  return user._id?.toString ? user._id.toString() : String(user._id);
}

export function generateSlug(title) {
  const baseSlug = String(title || "chat")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const suffix = crypto.randomBytes(2).toString("hex");
  return `${baseSlug || "chat"}-${suffix}`;
}

// ---- Users ----
export async function getUser(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  if (useDatabase()) return User.findOne({ email: normalizedEmail });

  return mem.users.get(normalizedEmail) || null;
}

export async function getUserForAuth(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  if (useDatabase()) {
    return User.findOne({ email: normalizedEmail }).select("+password +authVersion");
  }
  return mem.users.get(normalizedEmail) || null;
}

export async function getUserAuthVersion(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  if (useDatabase()) {
    const user = await User.findOne({ email: normalizedEmail }).select("+authVersion");
    return user ? Number(user.authVersion || 0) : null;
  }
  const user = mem.users.get(normalizedEmail);
  return user ? Number(user.authVersion || 0) : null;
}

export async function incrementUserAuthVersion(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  if (useDatabase()) {
    return User.findOneAndUpdate(
      { email: normalizedEmail },
      { $inc: { authVersion: 1 } },
      { new: true },
    ).select("+authVersion");
  }
  const user = mem.users.get(normalizedEmail);
  if (!user) return null;
  user.authVersion = Number(user.authVersion || 0) + 1;
  mem.users.set(normalizedEmail, user);
  return user;
}

export async function setUserIdentity(email, info = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const fields = {};
  for (const k of [
    "name",
    "image",
    "age",
    "city",
    "occupation",
    "phone",
    "monthlyIncome",
    "goal",
    "basicInfoComplete",
    "onboardingComplete",
    "password",
  ]) {
    if (info[k] != null && info[k] !== "") fields[k] = info[k];
  }

  if (useDatabase()) {
    return User.findOneAndUpdate(
      { email: normalizedEmail },
      { $set: fields },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    ).select("+authVersion");
  }

  const existing = mem.users.get(normalizedEmail) || {
    _id: crypto.randomUUID(),
    email: normalizedEmail,
    basicInfoComplete: false,
    onboardingComplete: false,
  };

  const updated = {
    ...existing,
    ...fields,
    email: normalizedEmail,
    _id: existing._id || crypto.randomUUID(),
  };
  mem.users.set(normalizedEmail, updated);
  return updated;
}

export async function createUser(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) return null;

  if (useDatabase()) {
    return User.create({
      email: normalizedEmail,
      password,
      basicInfoComplete: false,
      onboardingComplete: false,
    });
  }

  if (mem.users.has(normalizedEmail)) return null;
  const user = {
    _id: crypto.randomUUID(),
    email: normalizedEmail,
    password,
    name: "Friend",
    basicInfoComplete: false,
    onboardingComplete: false,
  };
  mem.users.set(normalizedEmail, user);
  return user;
}

// ---- Conversations ----
export async function getConversation(conversationId) {
  if (!conversationId) return null;

  if (useDatabase()) {
    if (!mongoose.isValidObjectId(conversationId)) return null;
    return ConversationLog.findOne({ _id: conversationId });
  }

  return mem.conversations.get(String(conversationId)) || null;
}

export async function getConversationForUser(conversationId, email) {
  if (!email) return null;
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;

  const user = await getUser(email);
  if (!user) return null;

  return String(conversation.userId) === getUserId(user) ? conversation : null;
}

export async function getConversationBySlugForUser(slug, email) {
  if (!slug || !email) return null;
  const user = await getUser(email);
  if (!user) return null;

  if (useDatabase()) {
    return ConversationLog.findOne({ slug, userId: getUserId(user) });
  }

  const userId = getUserId(user);
  return (
    [...mem.conversations.values()].find(
      (conversation) =>
        conversation.slug === slug &&
        String(conversation.userId) === String(userId),
    ) || null
  );
}

export async function createConversation(email, message) {
  const normalizedEmail = normalizeEmail(email);
  const user = await getUser(normalizedEmail);
  if (!user) return null;

  const title =
    (await generateConversationTitle(message).catch(() => "New Chat")) ||
    "New Chat";
  const slug = generateSlug(title);

  if (useDatabase()) {
    const conversation = await ConversationLog.create({
      userId: getUserId(user),
      slug,
      title,
      messages: [],
    });
    await RiskProfile.create({
      conversationId: conversation._id.toString(),
      goals: user.goal ? [user.goal] : [],
      monthlyIncome: user.monthlyIncome ?? null,
      lifeStage: user.age
        ? user.age < 30
          ? "early career"
          : user.age < 50
            ? "mid career"
            : "pre-retirement"
        : null,
    });
    return conversation;
  }

  const conversation = {
    _id: crypto.randomUUID(),
    userId: getUserId(user),
    slug,
    title,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mem.conversations.set(conversation._id, conversation);
  mem.profiles.set(conversation._id, {
    conversationId: conversation._id,
    goals: user.goal ? [user.goal] : [],
    horizonYears: null,
    monthlyIncome: user.monthlyIncome ?? null,
    monthlyInvestable: null,
    fearTolerance: null,
    lifeStage: user.age
      ? user.age < 30
        ? "early career"
        : user.age < 50
          ? "mid career"
          : "pre-retirement"
      : null,
    riskScore: null,
    riskCategory: null,
    complete: false,
  });
  return conversation;
}

export async function getAllConversations(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  if (useDatabase()) {
    const user = await getUser(normalizedEmail);
    if (!user) return [];

    const conversationLogs = await ConversationLog.aggregate([
      { $match: { userId: getUserId(user) } },
      {
        $project: {
          title: 1,
          slug: 1,
          createdAt: 1,
          updatedAt: 1,
          messageCount: { $size: "$messages" },
        },
      },
      { $sort: { updatedAt: -1 } },
    ]);
    return JSON.parse(JSON.stringify(conversationLogs));
  }

  const user = mem.users.get(normalizedEmail);
  if (!user) return [];

  const userId = getUserId(user);
  return [...mem.conversations.values()]
    .filter((conversation) => String(conversation.userId) === String(userId))
    .map((conversation) => ({
      _id: conversation._id,
      title: conversation.title,
      slug: conversation.slug,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages?.length || 0,
    }))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function appendMessages(conversationId, newMessages) {
  if (!Array.isArray(newMessages) || !newMessages.length) return null;
  if (useDatabase()) {
    if (!mongoose.isValidObjectId(conversationId)) return null;
    return ConversationLog.findByIdAndUpdate(
      conversationId,
      { $push: { messages: { $each: newMessages } } },
      { new: true, runValidators: true },
    );
  }

  const conversation = await getConversation(conversationId);
  if (!conversation) return null;
  if (!Array.isArray(conversation.messages)) conversation.messages = [];
  conversation.messages.push(...newMessages);
  conversation.updatedAt = new Date().toISOString();
  mem.conversations.set(String(conversationId), conversation);
  return conversation;
}

export async function updateConversationSummary(conversationId, summary) {
  const normalizedSummary = String(summary || "").slice(0, 4000);
  if (useDatabase()) {
    if (!mongoose.isValidObjectId(conversationId)) return null;
    return ConversationLog.findByIdAndUpdate(
      conversationId,
      { $set: { summary: normalizedSummary } },
      { new: true },
    );
  }
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;
  conversation.summary = normalizedSummary;
  mem.conversations.set(String(conversationId), conversation);
  return conversation;
}

// ---- Risk profile ----
export async function getProfile(conversationId) {
  if (!conversationId) return null;

  if (useDatabase()) {
    try {
      if (!mongoose.isValidObjectId(conversationId)) return null;
      let profile = await RiskProfile.findOne({ conversationId });
      if (!profile) {
        profile = await RiskProfile.create({ conversationId });
      }
      return profile;
    } catch (err) {
      if (err?.code === 11000) return RiskProfile.findOne({ conversationId });
      throw err;
    }
  }

  const key = String(conversationId);
  let profile = mem.profiles.get(key);
  if (!profile) {
    profile = {
      conversationId: key,
      goals: [],
      horizonYears: null,
      monthlyIncome: null,
      monthlyInvestable: null,
      fearTolerance: null,
      lifeStage: null,
      riskScore: null,
      riskCategory: null,
      complete: false,
    };
    mem.profiles.set(key, profile);
  }
  return profile;
}

export async function getProfileForUser(conversationId, email) {
  const conversation = await getConversationForUser(conversationId, email);
  if (!conversation) return null;
  return getProfile(conversationId);
}

export async function updateProfile(conversationId, updates) {
  const profile = await getProfile(conversationId);
  if (!profile) return null;

  const allowedFields = new Set([
    "goals",
    "horizonYears",
    "monthlyIncome",
    "monthlyInvestable",
    "fearTolerance",
    "lifeStage",
    "riskScore",
    "riskCategory",
    "complete",
  ]);
  for (const [key, value] of Object.entries(updates)) {
    if (!allowedFields.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (key === "goals" && Array.isArray(value)) {
      const set = new Set([...(profile.goals || []), ...value]);
      profile.goals = [...set];
    } else {
      profile[key] = value;
    }
  }

  if (useDatabase()) {
    await profile.save();
    return profile;
  }

  mem.profiles.set(String(conversationId), profile);
  return profile;
}

// ---- Plan ----
export async function savePlan(conversationId, planData) {
  if (useDatabase()) {
    return Plan.findOneAndUpdate({ conversationId }, planData, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    });
  }

  const key = String(conversationId);
  const saved = { ...planData, conversationId: key };
  mem.plans.set(key, saved);
  return saved;
}

export async function getPlan(conversationId) {
  if (!conversationId) return null;

  if (useDatabase()) {
    if (!mongoose.isValidObjectId(conversationId)) return null;
    return Plan.findOne({ conversationId });
  }

  return mem.plans.get(String(conversationId)) || null;
}

export async function getPlanForUser(conversationId, email) {
  if (!email) return null;
  const conversation = await getConversationForUser(conversationId, email);
  if (!conversation) return null;
  return getPlan(conversationId);
}
