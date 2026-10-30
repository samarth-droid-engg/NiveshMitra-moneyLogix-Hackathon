import mongoose from "mongoose";

const milestoneSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    targetAmount: { type: Number, default: null },
    targetYear: { type: Number, default: null },
    done: { type: Boolean, default: false },
  },
  { _id: false },
);

const allocationSchema = new mongoose.Schema(
  {
    asset: { type: String, required: true, maxlength: 120 },
    percent: { type: Number, required: true, min: 0, max: 100 },
    examples: { type: [String], default: [] },
  },
  { _id: false },
);

const planSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, unique: true, index: true },
    templateId: { type: String, required: true },
    templateName: { type: String, required: true },
    tagline: { type: String, default: "" },
    goal: { type: String, default: "" },
    goalPriority: { type: String, default: "" },
    expectedReturn: { type: String, default: "" },
    monthlySIP: { type: Number, default: null },
    allocation: {
      type: [allocationSchema],
      default: [],
      validate: {
        validator: (items) =>
          Array.isArray(items) &&
          items.length > 0 &&
          items.reduce((sum, item) => sum + Number(item.percent || 0), 0) === 100,
        message: "Portfolio allocation must total exactly 100%.",
      },
    },
    riskScore: { type: Number, min: 0, max: 100, default: null },
    riskCategory: {
      type: String,
      enum: ["Conservative", "Balanced", "Aggressive", "Growth", null],
      default: null,
    },
    returnAssumptions: { type: Map, of: Number, default: {} },
    milestones: { type: [milestoneSchema], default: [] },
    disclaimer: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("Plan", planSchema);
