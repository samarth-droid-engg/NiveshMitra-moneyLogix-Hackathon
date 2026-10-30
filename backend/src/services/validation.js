import mongoose from "mongoose";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : "";
}

export function validatePassword(value) {
  if (typeof value !== "string") {
    return "Password is required.";
  }
  const byteLength = Buffer.byteLength(value, "utf8");
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (byteLength > 72) return "Password must be at most 72 UTF-8 bytes.";
  return "";
}

export function cleanText(value, maxLength, { required = false } = {}) {
  if (value == null || value === "") return required ? null : "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  if ((required && !text) || text.length > maxLength) return null;
  return text;
}

export function parseFiniteNumber(value, { min, max, integer = false }) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return integer ? Math.round(number) : number;
}

export function isSupportedConversationId(value) {
  return typeof value === "string" &&
    (mongoose.isValidObjectId(value) || UUID_PATTERN.test(value));
}

export function sanitizeProfileUpdates(updates, currentProfile = {}) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return {};
  }

  const sanitized = {};
  if (Array.isArray(updates.goals)) {
    const goals = updates.goals
      .slice(0, 5)
      .map((goal) => cleanText(goal, 100, { required: true }))
      .filter(Boolean);
    if (goals.length) sanitized.goals = [...new Set(goals)];
  }

  const horizonYears = parseFiniteNumber(updates.horizonYears, {
    min: 1,
    max: 60,
    integer: true,
  });
  if (horizonYears != null) sanitized.horizonYears = horizonYears;

  const monthlyIncome = parseFiniteNumber(updates.monthlyIncome, {
    min: 1,
    max: 1_000_000_000,
  });
  const monthlyInvestable = parseFiniteNumber(updates.monthlyInvestable, {
    min: 1,
    max: 1_000_000_000,
  });
  const currentIncome = Number(currentProfile.monthlyIncome);
  const currentInvestable = Number(currentProfile.monthlyInvestable);
  const candidateInvestable = monthlyInvestable == null ? currentInvestable : NaN;
  if (
    monthlyIncome != null &&
    (!Number.isFinite(candidateInvestable) || candidateInvestable <= monthlyIncome)
  ) {
    sanitized.monthlyIncome = monthlyIncome;
  }

  const effectiveIncome = sanitized.monthlyIncome ?? currentIncome;
  if (
    monthlyInvestable != null &&
    (!Number.isFinite(effectiveIncome) || monthlyInvestable <= effectiveIncome)
  ) {
    sanitized.monthlyInvestable = monthlyInvestable;
  }

  if (["low", "medium", "high"].includes(updates.fearTolerance)) {
    sanitized.fearTolerance = updates.fearTolerance;
  }

  const lifeStage = cleanText(updates.lifeStage, 80, { required: true });
  if (lifeStage) sanitized.lifeStage = lifeStage;

  return sanitized;
}

export function validateBasicInfo(input = {}) {
  const value = {
    name: cleanText(input.name, 100, { required: true }),
    city: cleanText(input.city, 100, { required: true }),
    occupation: cleanText(input.occupation, 120, { required: true }),
    phone: cleanText(input.phone, 30),
    goal: cleanText(input.goal, 100, { required: true }),
    age: parseFiniteNumber(input.age, { min: 10, max: 100, integer: true }),
    monthlyIncome: parseFiniteNumber(input.monthlyIncome, {
      min: 1,
      max: 1_000_000_000,
    }),
  };

  if (!value.name || !value.city || !value.occupation) {
    return { error: "Name, city, and occupation are required and must be valid." };
  }
  if (value.age == null) return { error: "Age must be between 10 and 100." };
  if (value.monthlyIncome == null) {
    return { error: "Monthly income must be a positive number." };
  }
  if (!value.goal) return { error: "A financial goal is required." };
  if (input.phone && value.phone == null) return { error: "Phone number is too long." };
  return { value };
}
