import mongoose, { type InferSchemaType, type Model } from "mongoose";

const lessonQuizAttemptSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true, index: true },
    lessonKey: { type: String, required: true, index: true },
    attemptCount: { type: Number, default: 0, min: 0, max: 3 },
    bestScore: { type: Number, default: 0, min: 0 },
    lastScore: { type: Number, default: 0, min: 0 },
    lastAnswers: { type: [Number], default: [] },
  },
  { timestamps: true },
);

lessonQuizAttemptSchema.index({ clerkId: 1, lessonKey: 1 }, { unique: true });

export type LessonQuizAttemptDoc = InferSchemaType<typeof lessonQuizAttemptSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const LessonQuizAttempt: Model<LessonQuizAttemptDoc> =
  (mongoose.models.LessonQuizAttempt as Model<LessonQuizAttemptDoc>) ??
  mongoose.model<LessonQuizAttemptDoc>("LessonQuizAttempt", lessonQuizAttemptSchema);
