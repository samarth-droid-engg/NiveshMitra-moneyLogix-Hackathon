import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: { type: String, required: true, maxlength: 20_000 },
    requestId: { type: String, default: null, maxlength: 100 },
    // Emotion metadata attached to assistant turns.
    detectedEmotion: { type: String, default: null },
    riskSignal: {
      type: String,
      enum: ["none", "low", "medium", "high"],
      default: "none",
    },
    confidence: { type: Number, default: 0 },
    panicMode: { type: Boolean, default: false },
    triggeredBy: {
      type: String,
      enum: ["llm", "safety-net", "both", null],
      default: null,
    },
  },
  { timestamps: true, _id: false },
);

const conversationLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    slug: { type: String, required: true, index: true, maxlength: 150 },
    title: { type: String, default: "New Chat", maxlength: 100 },
    summary: { type: String, default: "", maxlength: 4000 },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model("ConversationLog", conversationLogSchema);
