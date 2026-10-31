import mongoose, { type InferSchemaType, type Model } from "mongoose";

export const RESOURCE_TYPES = [
  "video",
  "article",
  "documentation",
  "paper",
  "discussion",
  "hint",
  "solution",
] as const;

export const REPORT_REASONS = [
  "spam",
  "harmful",
  "wrong_category",
  "spoiler",
  "duplicate",
  "other",
] as const;

export const RESOURCE_STATUSES = ["active", "hidden", "deleted"] as const;

const resourceSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, index: true },
    track: { type: String, required: true, index: true },
    topicSlug: { type: String, required: true, index: true },
    url: { type: String, required: true, maxlength: 2_000 },
    normalizedUrl: { type: String, required: true, maxlength: 2_000 },
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, default: null, maxlength: 400 },
    siteName: { type: String, default: null, maxlength: 120 },
    domain: { type: String, required: true, maxlength: 180 },
    thumbnailUrl: { type: String, default: null, maxlength: 2_000 },
    provider: { type: String, default: "website", maxlength: 40 },
    youtubeVideoId: { type: String, default: null, maxlength: 32 },
    type: { type: String, enum: RESOURCE_TYPES, required: true },
    containsFullSolution: { type: Boolean, default: false },
    status: { type: String, enum: RESOURCE_STATUSES, default: "active", index: true },
    verified: { type: Boolean, default: false, index: true },
    createdByClerkId: { type: String, required: true, index: true },
    createdByName: { type: String, default: "Onlearn user", maxlength: 80 },
    upvotedByClerkIds: { type: [String], default: [] },
    reportedByClerkIds: { type: [String], default: [] },
    reportReasons: { type: [String], default: [] },
    reportCount: { type: Number, default: 0 },
    rankScore: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

resourceSchema.index(
  { questionId: 1, normalizedUrl: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: "deleted" } } },
);
resourceSchema.index({ questionId: 1, verified: -1, rankScore: -1, createdAt: -1 });

export type ResourceDoc = InferSchemaType<typeof resourceSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Resource: Model<ResourceDoc> =
  (mongoose.models.Resource as Model<ResourceDoc>) ??
  mongoose.model<ResourceDoc>("Resource", resourceSchema);
