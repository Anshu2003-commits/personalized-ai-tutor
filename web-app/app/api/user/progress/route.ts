import { auth } from "@clerk/nextjs/server";
import { getQuestionsForTopic, getTopicsByTrack } from "@/lib/catalog";
import {
  getTopicProgress,
  getTrackProgressSnapshot,
  markQuestionCompleted,
  recordVisit,
} from "@/lib/progress";
import type { TrackSlug } from "@/lib/types";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const track = searchParams.get("track") as TrackSlug | null;
  const topicSlug = searchParams.get("topicSlug");

  if (!track) {
    return Response.json({ error: "missing track" }, { status: 400 });
  }

  // No topicSlug → track-level summary for the nav bar (solved / total / streak).
  if (!topicSlug) {
    const snapshot = await getTrackProgressSnapshot(userId, track);
    const total = getTopicsByTrack(track).reduce(
      (n, t) => n + getQuestionsForTopic(track, t.slug).length,
      0,
    );
    return Response.json({
      solved: snapshot.completedQuestionIds.size,
      total,
      streak: snapshot.streak.count,
      xp: snapshot.xp,
    });
  }

  const progress = await getTopicProgress(userId, track, topicSlug);
  return Response.json(progress ?? { status: "not_started", currentQuestionId: null, completedQuestionIds: [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as {
    action: string;
    track: TrackSlug;
    topicSlug: string;
    questionId: string;
    timeZone?: string;
  };

  if (body.action !== "question_completed" && body.action !== "visited") {
    return Response.json({ error: "unknown action" }, { status: 400 });
  }

  if (!body.track || !body.topicSlug || !body.questionId) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }

  if (body.action === "visited") {
    try {
      await recordVisit(userId, body.track, body.topicSlug, body.questionId);
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  try {
    const result = await markQuestionCompleted(
      userId,
      body.track,
      body.topicSlug,
      body.questionId,
      body.timeZone,
    );
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
