import { auth } from "@clerk/nextjs/server";
import { getDraft, saveDraft, deleteDraft } from "@/lib/draft";
import { getQuestionById, getTopicBySlug } from "@/lib/catalog";
import { languagesForTrack } from "@/lib/execution/editor-languages";
import { TRACKS, type TrackSlug } from "@/lib/types";

const DEFAULT_LANGUAGE = "python";

// Validate the language against the set offered for the track (single source of
// truth in editor-languages). Falls back to python when omitted so older
// clients keep working.
function resolveLanguage(track: TrackSlug, raw: string | null): string | null {
  const lang = raw ?? DEFAULT_LANGUAGE;
  return languagesForTrack(track).some((l) => l.id === lang) ? lang : null;
}

// GET /api/user/draft?questionId=...&language=... - latest persisted editor
// buffer for the signed-in user. Returns { draft: null } when nothing is stored
// (editor falls back to the starter code).
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const questionId = searchParams.get("questionId");
  if (!questionId) {
    return Response.json({ error: "missing questionId" }, { status: 400 });
  }
  const question = getQuestionById(questionId);
  if (!question) {
    return Response.json({ error: "unknown question" }, { status: 400 });
  }
  const language = resolveLanguage(question.track, searchParams.get("language"));
  if (!language) {
    return Response.json({ error: "unknown language" }, { status: 400 });
  }

  const draft = await getDraft(userId, questionId, language);
  return Response.json({ draft });
}

// PUT /api/user/draft - upsert the draft. On a version conflict responds 409
// with the current server draft so the client can offer keep-local vs reload.
export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as {
    questionId?: string;
    language?: string;
    track?: string;
    topicSlug?: string;
    code?: string;
    baseVersion?: number;
  };

  if (
    !body.questionId ||
    !body.track ||
    !body.topicSlug ||
    typeof body.code !== "string"
  ) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }

  // Reject identifiers that don't exist in the catalog so junk can't accumulate
  // in the drafts collection via direct API calls.
  const track = body.track as TrackSlug;
  if (!TRACKS.some((t) => t.slug === track)) {
    return Response.json({ error: "unknown track" }, { status: 400 });
  }
  const question = getQuestionById(body.questionId);
  if (!question || question.track !== track) {
    return Response.json({ error: "unknown question" }, { status: 400 });
  }
  if (!getTopicBySlug(track, body.topicSlug)) {
    return Response.json({ error: "unknown topic" }, { status: 400 });
  }
  const language = resolveLanguage(track, body.language ?? null);
  if (!language) {
    return Response.json({ error: "unknown language" }, { status: 400 });
  }

  const result = await saveDraft(userId, {
    questionId: body.questionId,
    language,
    track,
    topicSlug: body.topicSlug,
    code: body.code,
    baseVersion: typeof body.baseVersion === "number" ? body.baseVersion : 0,
  });

  if (!result.ok) {
    return Response.json(
      { conflict: true, server: result.server },
      { status: 409 },
    );
  }

  return Response.json({ draft: result.draft });
}

// DELETE /api/user/draft?questionId=...&language=... - clears the stored draft
// (reset to starter code). Idempotent.
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const questionId = searchParams.get("questionId");
  if (!questionId) {
    return Response.json({ error: "missing questionId" }, { status: 400 });
  }
  const question = getQuestionById(questionId);
  if (!question) {
    return Response.json({ error: "unknown question" }, { status: 400 });
  }
  const language = resolveLanguage(question.track, searchParams.get("language"));
  if (!language) {
    return Response.json({ error: "unknown language" }, { status: 400 });
  }

  await deleteDraft(userId, questionId, language);
  return Response.json({ ok: true });
}
