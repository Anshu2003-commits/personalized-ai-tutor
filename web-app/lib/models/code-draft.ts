import mongoose, { type InferSchemaType, type Model } from "mongoose";

const MAX_CODE_LEN = 100_000;

// The live editor buffer for a (user, question, language) triple. Unlike
// Submission this is upserted - exactly one document per language per question -
// and carries a monotonic `version` used for optimistic-concurrency conflict
// detection across tabs and devices. The starter code is never persisted here;
// an absent document just means "editor shows the starter code".
const codeDraftSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true },
    questionId: { type: String, required: true },
    // Editor language (e.g. "python", "cpp", "go"). One draft per language so
    // switching languages never clobbers another language's work. Defaults to
    // "python" to backfill rows written before multi-language support.
    language: { type: String, required: true, default: "python" },
    track: { type: String, required: true },
    topicSlug: { type: String, required: true },
    code: { type: String, required: true, maxlength: MAX_CODE_LEN },
    // Bumped on every accepted write. A write is rejected when the client's
    // known version no longer matches, surfacing a conflict instead of a
    // silent overwrite of a newer session's code.
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true },
);

// One draft per (user, question, language). Unique so the upsert is atomic and
// a second tab can't create a duplicate row. NOTE: this supersedes the legacy
// {clerkId, questionId} unique index - lib/draft.ts reconciles it at runtime
// via syncIndexes() so the old index can't block a second language's draft.
codeDraftSchema.index(
  { clerkId: 1, questionId: 1, language: 1 },
  { unique: true },
);

export type CodeDraftDoc = InferSchemaType<typeof codeDraftSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CodeDraft: Model<CodeDraftDoc> =
  (mongoose.models.CodeDraft as Model<CodeDraftDoc>) ??
  mongoose.model<CodeDraftDoc>("CodeDraft", codeDraftSchema);
