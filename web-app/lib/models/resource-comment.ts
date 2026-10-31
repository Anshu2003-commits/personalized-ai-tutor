import mongoose, { type InferSchemaType, type Model } from "mongoose";

const resourceCommentSchema = new mongoose.Schema(
  {
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
      required: true,
      index: true,
    },
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResourceComment",
      default: null,
      index: true,
    },
    text: { type: String, required: true, maxlength: 1_000 },
    createdByClerkId: { type: String, required: true, index: true },
    createdByName: { type: String, default: "Onlearn user", maxlength: 80 },
    isAdmin: { type: Boolean, default: false, index: true },
    upvotedByClerkIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

resourceCommentSchema.index({ resourceId: 1, isAdmin: -1, createdAt: -1 });

export type ResourceCommentDoc = InferSchemaType<typeof resourceCommentSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ResourceComment: Model<ResourceCommentDoc> =
  (mongoose.models.ResourceComment as Model<ResourceCommentDoc>) ??
  mongoose.model<ResourceCommentDoc>("ResourceComment", resourceCommentSchema);
