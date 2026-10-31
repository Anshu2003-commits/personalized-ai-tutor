import mongoose, { type InferSchemaType, type Model } from "mongoose";

const topicStateSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed"],
      default: "not_started",
    },
    currentQuestionId: { type: String, default: null },
    completedQuestionIds: { type: [String], default: [] },
  },
  { _id: false },
);

const moduleStateSchema = new mongoose.Schema(
  {
    topicProgress: {
      type: Map,
      of: topicStateSchema,
      default: () => new Map(),
    },
    streak: {
      count: { type: Number, default: 0 },
      lastActiveDayLocal: { type: String, default: null }, // YYYY-MM-DD
      lastActiveAt: { type: Date, default: null },
    },
    xp: { type: Number, default: 0 },
    // "Continue where you left off" - the last question the user opened.
    lastVisited: {
      topicSlug: { type: String, default: null },
      questionId: { type: String, default: null },
      at: { type: Date, default: null },
    },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, index: true },
    name: { type: String, default: null },
    image: { type: String, default: null },

    modules: {
      type: Map,
      of: moduleStateSchema,
      default: () => new Map(),
    },

    starredQuestions: { type: [String], default: [] },
    resourceCount: { type: Number, default: 0 },

    aiCredits: { type: Number, default: 100 },
    aiCreditsRefilledAt: { type: Date, default: () => new Date() },

    subscriptionStatus: {
      type: String,
      enum: ["free", "active", "past_due", "canceled"],
      default: "free",
    },
    dodoCustomerId: { type: String, default: null },
    dodoSubscriptionId: { type: String, default: null },

    preferredTrack: { type: String, default: null },
  },
  { timestamps: true },
);

export type TopicState = InferSchemaType<typeof topicStateSchema>;
export type ModuleState = InferSchemaType<typeof moduleStateSchema>;
export type UserDoc = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ??
  mongoose.model<UserDoc>("User", userSchema);
