import mongoose from "mongoose";

const riskProfileSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, unique: true, index: true },
    // Captured progressively across the onboarding conversation.
    goals: { type: [String], default: [], validate: [(v) => v.length <= 5, "Too many goals"] },
    horizonYears: { type: Number, default: null, min: 1, max: 60 },
    monthlyIncome: { type: Number, default: null, min: 1, max: 1_000_000_000 },
    monthlyInvestable: { type: Number, default: null, min: 1, max: 1_000_000_000 },
    fearTolerance: {
      type: String,
      enum: ["low", "medium", "high", null],
      default: null,
    },
    lifeStage: { type: String, default: null, trim: true, maxlength: 80 },
    // 0-100 computed risk score.
    riskScore: { type: Number, default: null, min: 0, max: 100 },
    riskCategory: {
      type: String,
      enum: ["Conservative", "Balanced", "Aggressive", "Growth", null],
      default: null,
    },
    complete: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("RiskProfile", riskProfileSchema);
