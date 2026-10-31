import { auth, currentUser } from "@clerk/nextjs/server";
import { connectMongo } from "@/lib/mongo";
import { Resource, type ResourceDoc } from "@/lib/models/resource";
import {
  ResourceComment,
  type ResourceCommentDoc,
} from "@/lib/models/resource-comment";
import { User } from "@/lib/models/user";
import { getQuestionById, getTopicBySlug } from "@/lib/catalog";
import { TRACKS, type TrackSlug } from "@/lib/types";
import { getLessonKey, getProjectModule } from "@/lib/project-catalog";
import {
  buildResourcePreview,
  cleanText,
  computeRankScore,
  isAdminEmail,
  isResourceType,
} from "@/lib/resources";

export const dynamic = "force-dynamic";

function userName(user: Awaited<ReturnType<typeof currentUser>>): string {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.emailAddresses[0]?.emailAddress ||
    "Onlearn user"
  );
}

async function viewer() {
  const { userId } = await auth();
  if (!userId) return { userId: null, isAdmin: false };
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? null;
  return { userId, isAdmin: isAdminEmail(email) };
}

function serializeResource(resource: ResourceDoc, comments: ResourceCommentDoc[], userId: string | null) {
  return {
    id: String(resource._id),
    questionId: resource.questionId,
    track: resource.track,
    topicSlug: resource.topicSlug,
    url: resource.url,
    title: resource.title,
    description: resource.description,
    siteName: resource.siteName,
    domain: resource.domain,
    thumbnailUrl: resource.thumbnailUrl,
    provider: resource.provider,
    youtubeVideoId: resource.youtubeVideoId,
    type: resource.type,
    containsFullSolution: resource.containsFullSolution,
    status: resource.status,
    verified: resource.verified,
    createdByName: resource.createdByName,
    upvoteCount: resource.upvotedByClerkIds.length,
    reportCount: resource.reportCount,
    viewerUpvoted: userId ? resource.upvotedByClerkIds.includes(userId) : false,
    viewerReported: userId ? resource.reportedByClerkIds.includes(userId) : false,
    createdAt: resource.createdAt,
    comments: comments.map((comment) => ({
      id: String(comment._id),
      resourceId: String(comment.resourceId),
      parentCommentId: comment.parentCommentId ? String(comment.parentCommentId) : null,
      text: comment.text,
      createdByName: comment.createdByName,
      isAdmin: comment.isAdmin,
      upvoteCount: comment.upvotedByClerkIds.length,
      viewerUpvoted: userId ? comment.upvotedByClerkIds.includes(userId) : false,
      createdAt: comment.createdAt,
    })),
  };
}

export async function GET(req: Request) {
  const { userId, isAdmin } = await viewer();
  const { searchParams } = new URL(req.url);
  const questionId = searchParams.get("questionId");
  if (!questionId) {
    return Response.json({ error: "missing questionId" }, { status: 400 });
  }

  await connectMongo();
  const resourceFilter = isAdmin
    ? { questionId, status: { $in: ["active", "hidden"] as const } }
    : { questionId, status: "active" as const };
  const resources = await Resource.find(resourceFilter)
    .sort({ verified: -1, rankScore: -1, createdAt: -1 })
    .limit(60);
  const comments = resources.length
    ? await ResourceComment.find({
        resourceId: { $in: resources.map((resource) => resource._id) },
      }).sort({ isAdmin: -1, createdAt: -1 })
    : [];
  const commentsByResource = new Map<string, typeof comments>();
  for (const comment of comments) {
    const key = String(comment.resourceId);
    commentsByResource.set(key, [...(commentsByResource.get(key) ?? []), comment]);
  }

  return Response.json({
    resources: resources.map((resource) =>
      serializeResource(resource, commentsByResource.get(String(resource._id)) ?? [], userId),
    ),
    isAdmin,
  });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }
  const user = await currentUser();

  const body = (await req.json()) as {
    questionId?: string;
    track?: string;
    topicSlug?: string;
    url?: string;
    title?: string;
    description?: string;
    type?: string;
    containsFullSolution?: boolean;
    scope?: { kind?: string; courseSlug?: string; moduleSlug?: string };
  };

  if (!body.url || !isResourceType(body.type)) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }

  let questionId = body.questionId;
  let track = body.track as TrackSlug;
  let topicSlug = body.topicSlug;
  if (body.scope?.kind === "lesson" && body.scope.courseSlug && body.scope.moduleSlug) {
    try {
      getProjectModule(body.scope.courseSlug, body.scope.moduleSlug);
    } catch {
      return Response.json({ error: "unknown lesson" }, { status: 400 });
    }
    questionId = getLessonKey(body.scope.courseSlug, body.scope.moduleSlug);
    track = "ds";
    topicSlug = body.scope.moduleSlug;
  }

  if (!questionId || !track || !topicSlug) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }

  if (!TRACKS.some((t) => t.slug === track)) {
    return Response.json({ error: "unknown track" }, { status: 400 });
  }
  if (body.scope?.kind !== "lesson") {
    const question = getQuestionById(questionId);
    if (!question || question.track !== track) {
      return Response.json({ error: "unknown question" }, { status: 400 });
    }
    if (!getTopicBySlug(track, topicSlug)) {
      return Response.json({ error: "unknown topic" }, { status: 400 });
    }
  }

  let preview;
  try {
    preview = await buildResourcePreview(body.url, body.title, body.description);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "invalid link" },
      { status: 400 },
    );
  }

  await connectMongo();
  try {
    const created = await Resource.create({
      ...preview,
      questionId,
      track,
      topicSlug,
      title: cleanText(body.title, 160) || preview.title,
      description: cleanText(body.description, 400) || preview.description,
      type: body.type,
      containsFullSolution: Boolean(body.containsFullSolution || body.type === "solution"),
      createdByClerkId: userId,
      createdByName: cleanText(userName(user), 80) || "Onlearn user",
      rankScore: 1,
    });
    created.rankScore = computeRankScore(created);
    await created.save();
    await User.updateOne({ clerkId: userId }, { $inc: { resourceCount: 1 } });

    return Response.json({ id: String(created._id) }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return Response.json({ error: "This resource already exists for this problem." }, { status: 409 });
    }
    throw error;
  }
}
