import "server-only";
import { connectMongo } from "./mongo";
import { CodeDraft } from "./models/code-draft";
import type { TrackSlug } from "./types";

const MAX_CODE_LEN = 100_000;

export type DraftSnapshot = {
  code: string;
  version: number;
  updatedAt: string;
};

// Drafts gained a `language` dimension after the initial {clerkId, questionId}
// unique index shipped. syncIndexes() drops that now-wrong legacy index (which
// would otherwise block a second language's draft) and builds the new
// {clerkId, questionId, language} one. Memoized so it runs once per process;
// reset on failure so a transient error can retry.
let indexesReady: Promise<void> | null = null;
async function ensureIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = CodeDraft.syncIndexes()
      .then(() => undefined)
      .catch((e) => {
        indexesReady = null;
        throw e;
      });
  }
  return indexesReady;
}

async function ready(): Promise<void> {
  await connectMongo();
  // Best-effort: never let an index hiccup take down a read/write.
  await ensureIndexes().catch(() => {});
}

export async function getDraft(
  clerkId: string,
  questionId: string,
  language: string,
): Promise<DraftSnapshot | null> {
  await ready();
  const doc = await CodeDraft.findOne({ clerkId, questionId, language }).lean();
  if (!doc) return null;
  return {
    code: doc.code,
    version: doc.version,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export type SaveDraftResult =
  | { ok: true; draft: DraftSnapshot }
  // The client's known version is stale - another tab/device wrote first.
  // `server` is the current persisted draft the client should reconcile with.
  | { ok: false; conflict: true; server: DraftSnapshot | null };

/**
 * Upsert the draft for a (user, question, language) triple using optimistic
 * concurrency. `baseVersion` is the version the client last saw (0 if it never
 * loaded a server draft). The write only lands when it still matches the stored
 * version, otherwise the call reports a conflict and leaves the stored draft
 * untouched.
 */
export async function saveDraft(
  clerkId: string,
  input: {
    questionId: string;
    language: string;
    track: TrackSlug;
    topicSlug: string;
    code: string;
    baseVersion: number;
  },
): Promise<SaveDraftResult> {
  await ready();
  const { questionId, language, track, topicSlug, baseVersion } = input;
  const code = input.code.slice(0, MAX_CODE_LEN);

  const key = { clerkId, questionId, language };
  const existing = await CodeDraft.findOne(key).lean();
  const currentVersion = existing?.version ?? 0;

  if (baseVersion !== currentVersion) {
    return {
      ok: false,
      conflict: true,
      server: existing
        ? {
            code: existing.code,
            version: existing.version,
            updatedAt: existing.updatedAt.toISOString(),
          }
        : null,
    };
  }

  // Guard the write on the version we just read so two concurrent saves can't
  // both think they won; a lost race falls through to the conflict path.
  if (!existing) {
    try {
      const created = await CodeDraft.create({
        clerkId,
        questionId,
        language,
        track,
        topicSlug,
        code,
        version: 1,
      });
      return {
        ok: true,
        draft: {
          code: created.code,
          version: created.version,
          updatedAt: created.updatedAt.toISOString(),
        },
      };
    } catch {
      // Unique-index violation: another tab created the draft between our read
      // and write. Re-read and report it as a conflict.
      const now = await CodeDraft.findOne(key).lean();
      return {
        ok: false,
        conflict: true,
        server: now
          ? { code: now.code, version: now.version, updatedAt: now.updatedAt.toISOString() }
          : null,
      };
    }
  }

  const updated = await CodeDraft.findOneAndUpdate(
    { ...key, version: currentVersion },
    { $set: { code, track, topicSlug }, $inc: { version: 1 } },
    { new: true },
  ).lean();

  if (!updated) {
    const now = await CodeDraft.findOne(key).lean();
    return {
      ok: false,
      conflict: true,
      server: now
        ? { code: now.code, version: now.version, updatedAt: now.updatedAt.toISOString() }
        : null,
    };
  }

  return {
    ok: true,
    draft: {
      code: updated.code,
      version: updated.version,
      updatedAt: updated.updatedAt.toISOString(),
    },
  };
}

export async function deleteDraft(
  clerkId: string,
  questionId: string,
  language: string,
): Promise<void> {
  await ready();
  await CodeDraft.deleteOne({ clerkId, questionId, language });
}
