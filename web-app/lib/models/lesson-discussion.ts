import mongoose, { type InferSchemaType, type Model } from "mongoose";

const lessonDiscussionSchema = new mongoose.Schema(
  {
    lessonKey: { type: String, required: true, index: true },
    body: { type: String, required: true, minlength: 2, maxlength: 2_000 },
    kind: { type: String, enum: ["question", "insight"], default: "question" },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "LessonDiscussion", default: null, index: true },
    createdByClerkId: { type: String, required: true, index: true },
    createdByName: { type: String, required: true, maxlength: 80 },
    upvotedByClerkIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

lessonDiscussionSchema.index({ lessonKey: 1, parentId: 1, createdAt: -1 });

export type LessonDiscussionDoc = InferSchemaType<typeof lessonDiscussionSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const LessonDiscussion: Model<LessonDiscussionDoc> =
  (mongoose.models.LessonDiscussion as Model<LessonDiscussionDoc>) ??
  mongoose.model<LessonDiscussionDoc>("LessonDiscussion", lessonDiscussionSchema);
