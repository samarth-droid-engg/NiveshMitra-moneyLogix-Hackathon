import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Friend", trim: true, maxlength: 100 },
    email: {
      type: String,
      default: null,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, default: null, select: false },
    image: { type: String, default: null, maxlength: 2048 },

    // Basic details collected via the post-login form.
    age: { type: Number, default: null, min: 10, max: 100 },
    city: { type: String, default: null, trim: true, maxlength: 100 },
    occupation: { type: String, default: null, trim: true, maxlength: 120 },
    phone: { type: String, default: null, trim: true, maxlength: 30 },
    monthlyIncome: { type: Number, default: null, min: 1, max: 1_000_000_000 },
    goal: { type: String, default: null, trim: true, maxlength: 100 },
    basicInfoComplete: { type: Boolean, default: false },
    onboardingComplete: { type: Boolean, default: false },
    authVersion: { type: Number, default: 0, min: 0, select: false },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
